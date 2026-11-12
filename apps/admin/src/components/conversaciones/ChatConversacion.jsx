import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronUp, FileText, MessageSquareText, Plus, Send } from 'lucide-react'
import { estadoVentana24h, ultimos9 } from '@bakebrothers/domain'
import { Pill } from '../bakeos/ui'
import PanelContexto from './PanelContexto'
import RespuestasRapidas from './RespuestasRapidas'
import SelectorPlantilla from './SelectorPlantilla'
import {
  ESTADOS_BANDEJA,
  agruparPorDia,
  mensajeDeErrorDeEnvio,
  motivoDeConversacion,
  nombreDeConversacion,
  telefonoDeConversacion,
} from '../../utils/conversaciones'

function Burbuja({ m }) {
  const esCliente = m.rol === 'cliente'
  const esBot = m.rol === 'bot'
  const estilo = esCliente
    ? 'self-start border border-borde bg-white text-tinta'
    : esBot
      ? 'self-end bg-lila-suave text-tinta'
      : 'self-end bg-ok-suave text-tinta'
  const quien = esCliente ? null : esBot ? 'Bot' : (m.autor ?? 'Equipo')
  return (
    <div className={`flex max-w-[85%] flex-col rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${estilo}`}>
      {quien && <span className={`mb-0.5 text-[11px] font-bold ${esBot ? 'text-lila' : 'text-ok'}`}>{quien}</span>}
      <p className="whitespace-pre-wrap break-words">{m.texto}</p>
      <span className="mt-1 self-end text-[10.5px] text-gris">
        {m.plantilla ? `Plantilla · ${m.hora}` : m.hora}
      </span>
    </div>
  )
}

/**
 * Alto del chat = lo que queda de la pantalla visible desde donde empieza hasta abajo. Así los mensajes se desplazan
 * dentro de su caja y el cuadro para responder queda SIEMPRE a la vista, también sobre el teclado del celular
 * (`visualViewport` se achica cuando aparece el teclado). En celular, al abrir una conversación el chat se acomoda
 * justo debajo del menú.
 */
function useAlturaVisible(ref, claveDeConversacion) {
  const [alto, setAlto] = useState(null)
  const alineada = useRef(null)
  const enCelular = () => !!window.matchMedia?.('(max-width: 1023px)').matches
  const menu = () => document.querySelector('nav[aria-label="Secciones"]')?.getBoundingClientRect().bottom ?? 0

  // Fase 1: la altura. En celular se calcula para cuando el chat quede justo debajo del menú (no depende de cuánto
  // se haya desplazado ya la página); en escritorio, desde donde está.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const medir = () => {
      const visible = window.visualViewport?.height ?? window.innerHeight
      const arriba = enCelular() ? menu() + 8 : Math.max(el.getBoundingClientRect().top, menu())
      setAlto(Math.max(300, Math.floor(visible - arriba - 12)))
    }
    medir()
    window.visualViewport?.addEventListener('resize', medir)
    window.addEventListener('resize', medir)
    return () => {
      window.visualViewport?.removeEventListener('resize', medir)
      window.removeEventListener('resize', medir)
    }
  }, [ref, claveDeConversacion])

  // Fase 2: con la altura ya aplicada la página es lo bastante larga para acomodar el chat bajo el menú.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || alto === null || alineada.current === claveDeConversacion || !enCelular()) return
    alineada.current = claveDeConversacion
    window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - menu() - 8))
  }, [ref, alto, claveDeConversacion])
  return alto
}

/** Cuánto tiempo queda para responder con texto libre (WhatsApp: 24 h desde el último mensaje del cliente). */
function FranjaVentana({ ventana }) {
  const poca = ventana.abierta && ventana.restanteMs < 2 * 3_600_000
  const estilo = !ventana.abierta ? 'bg-red-50 text-red-700' : poca ? 'bg-amber-50 text-amber-800' : 'bg-ok-suave text-ok'
  return (
    <p className={`shrink-0 rounded-xl px-3 py-1.5 text-[13px] font-semibold leading-snug ${estilo}`} role="status">
      {ventana.abierta
        ? `${ventana.texto} para responder con texto libre`
        : 'Pasaron más de 24 horas desde el último mensaje del cliente: solo puedes enviar una plantilla.'}
    </p>
  )
}

/** Chat de una conversación: encabezado con acciones, mensajes estilo WhatsApp, panel de contexto y cuadro de respuesta. */
export default function ChatConversacion({
  conversacion,
  cliente,
  ahora,
  esAdmin,
  sedes,
  trabajando,
  errorAccion,
  onLimpiarError,
  onVolver,
  onTomar,
  onDevolver,
  onCerrar,
  onAsignarSede,
  onEnviar,
  onEnviarPlantilla,
  respuestas,
}) {
  const [texto, setTexto] = useState('')
  const [verMas, setVerMas] = useState(false)
  const [verRapidas, setVerRapidas] = useState(false)
  const [verPlantillas, setVerPlantillas] = useState(false)
  const [pedidosRelacionados, setPedidosRelacionados] = useState([])
  const [sedeParaTomar, setSedeParaTomar] = useState('')
  const cajaMensajes = useRef(null)
  const raiz = useRef(null)
  const alto = useAlturaVisible(raiz, conversacion.id)

  // Con el teclado abierto casi no queda pantalla: el encabezado se reduce a una línea (nombre y estado) para que el
  // cuadro de respuesta siempre se vea; los botones vuelven cuando el teclado se cierra.
  const compacto = alto !== null && alto < 520
  const ocupado = trabajando === conversacion.id
  const estado = ESTADOS_BANDEJA[conversacion.estado] ?? ESTADOS_BANDEJA.activa
  const motivoBase = motivoDeConversacion(conversacion)
  const hayPagoPorRevisar = pedidosRelacionados.some((p) => p.pago_reportado && !p.pago_resultado)
  const ventana = useMemo(() => estadoVentana24h(conversacion.historial ?? [], ahora), [conversacion.historial, ahora])
  const grupos = useMemo(() => agruparPorDia(conversacion.historial, ahora), [conversacion.historial, ahora])
  const esWhatsApp = conversacion.canal === 'whatsapp'
  // Tres situaciones distintas, cada una con su propia explicación (antes todas se veían igual: «No se puede escribir ahora»):
  //  1. Nadie la tomó todavía → botón para tomarla.   2. Tomada pero pasaron 24 h → elegir una plantilla.   3. Se puede escribir.
  const tomada = conversacion.estado === 'escalada' || conversacion.estado === 'atendida_por_operador'
  const ventanaCerrada = esWhatsApp && !ventana.abierta
  const nombre = nombreDeConversacion(conversacion, cliente ? new Map([[ultimos9(conversacion.external_id), cliente]]) : null)

  useEffect(() => {
    setTexto('')
    setVerRapidas(false)
    setVerPlantillas(false)
    onLimpiarError()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversacion.id])

  useEffect(() => {
    // Solo la caja de mensajes baja al último (scrollIntoView movía también toda la página).
    if (cajaMensajes.current) cajaMensajes.current.scrollTop = cajaMensajes.current.scrollHeight
  }, [conversacion.id, conversacion.historial?.length, alto])

  const enviar = async () => {
    if (!tomada || ventanaCerrada || !texto.trim() || ocupado) return
    const ok = await onEnviar(conversacion, texto)
    if (ok) setTexto('')
  }

  const crearPedidoUrl = `/nuevo-pedido?${new URLSearchParams({
    telefono: conversacion.external_id,
    nombre: cliente?.nombre ?? '',
    conversacion: conversacion.id,
  }).toString()}`

  const botonBase = 'flex min-h-11 flex-1 basis-[5.5rem] items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-center text-[13.5px] font-semibold leading-tight transition-opacity disabled:opacity-50'
  const Boton = ({ children, onClick, primario }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={ocupado}
      className={`${botonBase} ${primario ? 'bg-tinta text-white' : 'border border-borde bg-hueso text-tinta'}`}
    >
      {children}
    </button>
  )

  return (
    <section
      ref={raiz}
      style={alto ? { height: alto } : undefined}
      className="flex min-h-[220px] flex-col gap-2"
      aria-label={`Conversación con ${nombre}`}
    >
      {/* Encabezado compacto: quién es, en qué estado está y qué se puede hacer. */}
      <div className="shrink-0 rounded-2xl border border-borde bg-hueso p-3">
        <div className="flex items-start gap-1.5">
          <button onClick={onVolver} aria-label="Volver a la lista" className="-ml-1.5 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-gris lg:hidden">
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-bold leading-tight">{nombre}</h2>
            {nombre !== telefonoDeConversacion(conversacion) && <p className="text-[13px] text-gris">{telefonoDeConversacion(conversacion)}</p>}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Pill tono={estado.tono}>{estado.texto}</Pill>
              <Pill tono="neutro">{conversacion.sedes?.nombre ?? 'Sin local'}</Pill>
              {motivoBase && <Pill tono="prioridad">{motivoBase.etiqueta}</Pill>}
              {hayPagoPorRevisar && <Pill tono="prioridad">Pago por revisar</Pill>}
              {conversacion.estado === 'atendida_por_operador' && conversacion.contexto?.atendidaPor?.nombre && (
                <Pill tono="ok">Atiende: {conversacion.contexto.atendidaPor.nombre}</Pill>
              )}
            </div>
          </div>
        </div>

        {!compacto && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {/* Si está con el bot o cerrada, «Tomar» vive abajo, donde iría el cuadro de respuesta. */}
          {conversacion.estado === 'escalada' && (
            <Boton primario onClick={() => onTomar(conversacion, sedeParaTomar)}>
              Tomar conversación
            </Boton>
          )}
          {(conversacion.estado === 'atendida_por_operador' || conversacion.estado === 'cerrada') && (
            <Boton onClick={() => onDevolver(conversacion)}>Devolver al bot</Boton>
          )}
          {conversacion.estado !== 'cerrada' && <Boton onClick={() => onCerrar(conversacion)}>Cerrar</Boton>}
          <Link to={crearPedidoUrl} className={`${botonBase} border border-borde bg-hueso text-tinta`}>
            <Plus size={15} aria-hidden="true" /> Crear pedido
          </Link>
        </div>
        )}

        {!compacto && (
          <button
            onClick={() => setVerMas((v) => !v)}
            aria-expanded={verMas}
            className="mt-2.5 flex min-h-11 w-full items-center justify-between rounded-xl border border-borde bg-white px-3.5 text-sm font-semibold"
          >
            Datos del cliente, pedidos y local
            {verMas ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
          </button>
        )}
      </div>

      {/* Datos del cliente, pedidos y local: desplegados, ocupan el lugar de los mensajes (se desplazan dentro de su caja). El panel
          se carga siempre (alimenta la etiqueta «Pago por revisar») y solo se muestra al desplegarlo. */}
      <div className={verMas && !compacto ? 'max-h-[45%] shrink-0 overflow-y-auto rounded-2xl' : 'hidden'}>
        {esAdmin && (
          <label className="mb-2 flex items-center gap-2 rounded-2xl border border-borde bg-hueso p-3 text-sm">
            <span className="text-gris">Local</span>
            <select
              value={conversacion.sede_id ?? sedeParaTomar}
              onChange={(e) => (conversacion.sede_id || e.target.value === '' ? onAsignarSede(conversacion, e.target.value) : setSedeParaTomar(e.target.value))}
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-borde bg-white px-3 text-sm font-semibold outline-none focus:border-acento"
            >
              <option value="">Sin local</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
            {!conversacion.sede_id && sedeParaTomar && (
              <button onClick={() => onAsignarSede(conversacion, sedeParaTomar)} className="min-h-11 shrink-0 rounded-xl border border-borde px-3 text-sm font-semibold">
                Asignar
              </button>
            )}
          </label>
        )}
        <PanelContexto conversacion={conversacion} cliente={cliente} alCargarPedidos={setPedidosRelacionados} />
      </div>

      {/* Los mensajes ocupan todo el espacio que sobra y se desplazan por dentro. */}
      <div ref={cajaMensajes} className="flex min-h-[80px] flex-1 flex-col gap-1 overflow-y-auto rounded-2xl border border-borde bg-crema p-3" aria-live="polite">
        {grupos.length === 0 && <p className="py-6 text-center text-sm text-gris">Sin mensajes todavía.</p>}
        {grupos.map((g) => (
          <div key={g.etiqueta} className="flex flex-col gap-1.5">
            <p className="my-2 self-center rounded-full bg-borde/70 px-3 py-1 text-[11px] font-bold text-gris">{g.etiqueta}</p>
            {g.mensajes.map((m) => (
              <Burbuja key={m._i} m={m} />
            ))}
          </div>
        ))}
      </div>

      {esWhatsApp && <FranjaVentana ventana={ventana} />}
      {errorAccion && !verPlantillas && (
        <p role="alert" className="shrink-0 rounded-xl bg-red-50 px-3.5 py-2 text-sm text-red-700">
          {mensajeDeErrorDeEnvio(errorAccion)}
          {errorAccion.detalle && typeof errorAccion.detalle === 'string' ? <span className="block break-words text-xs opacity-80">{errorAccion.detalle}</span> : null}
        </p>
      )}

      {verRapidas && tomada && !ventanaCerrada && (
        <div className="max-h-[40%] shrink-0 overflow-y-auto">
          <RespuestasRapidas
            respuestas={respuestas.respuestas}
            esAdmin={esAdmin}
            error={respuestas.error}
            onElegir={(t) => {
              setTexto(t)
              setVerRapidas(false)
            }}
            onGuardar={respuestas.guardar}
            onBorrar={respuestas.borrar}
            onCerrar={() => setVerRapidas(false)}
          />
        </div>
      )}

      {/* Zona de respuesta: siempre a la vista, con el espacio seguro de abajo del celular. */}
      <div className="shrink-0 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
        {!tomada ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-borde bg-hueso p-3">
            <p className="text-sm text-gris">
              {conversacion.estado === 'activa'
                ? 'La está atendiendo el bot. Tómala para escribirle tú.'
                : 'La conversación está cerrada. Tómala para volver a escribirle.'}
            </p>
            <button
              type="button"
              onClick={() => onTomar(conversacion, sedeParaTomar)}
              disabled={ocupado}
              className="min-h-12 w-full rounded-xl bg-tinta px-4 text-[15px] font-semibold text-white disabled:opacity-50"
            >
              Tomar conversación
            </button>
          </div>
        ) : ventanaCerrada ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-borde bg-hueso p-3">
            <p className="text-sm text-gris">
              WhatsApp no deja enviar texto libre pasadas las 24 horas. Elige una plantilla aprobada: cuando el cliente responda, se vuelve a abrir la ventana.
            </p>
            <button
              type="button"
              onClick={() => setVerPlantillas(true)}
              disabled={ocupado}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-tinta px-4 text-[15px] font-semibold text-white disabled:opacity-50"
            >
              <FileText size={18} aria-hidden="true" /> Elegir una plantilla
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-2 rounded-2xl border border-borde bg-hueso p-2">
            <button
              type="button"
              onClick={() => setVerRapidas((v) => !v)}
              aria-label="Respuestas rápidas"
              aria-expanded={verRapidas}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-borde bg-white text-gris"
            >
              <MessageSquareText size={18} aria-hidden="true" />
            </button>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  enviar()
                }
              }}
              rows={1}
              placeholder="Escribe una respuesta…"
              aria-label="Respuesta"
              className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-borde bg-white px-3 py-2.5 text-[15px] outline-none focus:border-acento"
            />
            <button
              type="button"
              onClick={enviar}
              disabled={!texto.trim() || ocupado}
              aria-label="Enviar"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-tinta text-white disabled:opacity-40"
            >
              <Send size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {verPlantillas && (
        <SelectorPlantilla
          conversacionId={conversacion.id}
          ocupado={ocupado}
          errorAccion={errorAccion}
          onEnviar={(datos) => onEnviarPlantilla(conversacion, datos)}
          onCerrar={() => {
            setVerPlantillas(false)
            onLimpiarError()
          }}
        />
      )}
    </section>
  )
}

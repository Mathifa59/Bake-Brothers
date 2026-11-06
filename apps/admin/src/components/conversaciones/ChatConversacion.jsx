import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronUp, MessageSquareText, Plus, Send } from 'lucide-react'
import { estadoVentana24h, ultimos9 } from '@bakebrothers/domain'
import { Pill } from '../bakeos/ui'
import PanelContexto from './PanelContexto'
import RespuestasRapidas from './RespuestasRapidas'
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
      <span className="mt-1 self-end text-[10.5px] text-gris">{m.hora}</span>
    </div>
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
  respuestas,
}) {
  const [texto, setTexto] = useState('')
  const [verContexto, setVerContexto] = useState(false)
  const [verRapidas, setVerRapidas] = useState(false)
  const [pedidosRelacionados, setPedidosRelacionados] = useState([])
  const [sedeParaTomar, setSedeParaTomar] = useState('')
  const finMensajes = useRef(null)

  const ocupado = trabajando === conversacion.id
  const estado = ESTADOS_BANDEJA[conversacion.estado] ?? ESTADOS_BANDEJA.activa
  const motivoBase = motivoDeConversacion(conversacion)
  const hayPagoPorRevisar = pedidosRelacionados.some((p) => p.pago_reportado && !p.pago_resultado)
  const ventana = useMemo(() => estadoVentana24h(conversacion.historial ?? [], ahora), [conversacion.historial, ahora])
  const grupos = useMemo(() => agruparPorDia(conversacion.historial, ahora), [conversacion.historial, ahora])
  const puedeEscribir = conversacion.estado === 'escalada' || conversacion.estado === 'atendida_por_operador'
  const escrituraBloqueada = !puedeEscribir || (conversacion.canal === 'whatsapp' && !ventana.abierta)
  const nombre = nombreDeConversacion(conversacion, cliente ? new Map([[ultimos9(conversacion.external_id), cliente]]) : null)

  useEffect(() => {
    setTexto('')
    setVerRapidas(false)
    onLimpiarError()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversacion.id])

  useEffect(() => {
    finMensajes.current?.scrollIntoView?.({ block: 'end' })
  }, [conversacion.id, conversacion.historial?.length])

  const enviar = async () => {
    if (escrituraBloqueada || !texto.trim() || ocupado) return
    const ok = await onEnviar(conversacion, texto)
    if (ok) setTexto('')
  }

  const crearPedidoUrl = `/nuevo-pedido?${new URLSearchParams({
    telefono: conversacion.external_id,
    nombre: cliente?.nombre ?? '',
    conversacion: conversacion.id,
  }).toString()}`

  const Boton = ({ children, onClick, primario, disabled, ...resto }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || ocupado}
      className={`min-h-11 flex-1 whitespace-nowrap rounded-xl px-3.5 text-sm font-semibold transition-opacity disabled:opacity-50 ${
        primario ? 'bg-tinta text-white' : 'border border-borde bg-hueso text-tinta'
      }`}
      {...resto}
    >
      {children}
    </button>
  )

  return (
    <section className="flex flex-col gap-3" aria-label={`Conversación con ${nombre}`}>
      <div className="rounded-2xl border border-borde bg-hueso p-3.5">
        <div className="flex items-start gap-2">
          <button onClick={onVolver} aria-label="Volver a la lista" className="-ml-1 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-gris lg:hidden">
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold leading-tight">{nombre}</h2>
            <p className="text-sm text-gris">{telefonoDeConversacion(conversacion)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
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

        <div className="mt-3 flex flex-wrap gap-2">
          {conversacion.estado !== 'atendida_por_operador' && conversacion.estado !== 'cerrada' && (
            <Boton primario onClick={() => onTomar(conversacion, sedeParaTomar)}>
              Tomar conversación
            </Boton>
          )}
          {(conversacion.estado === 'atendida_por_operador' || conversacion.estado === 'cerrada') && (
            <Boton onClick={() => onDevolver(conversacion)}>Devolver al bot</Boton>
          )}
          {conversacion.estado !== 'cerrada' && <Boton onClick={() => onCerrar(conversacion)}>Cerrar</Boton>}
          <Link
            to={crearPedidoUrl}
            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-borde bg-hueso px-3.5 text-sm font-semibold"
          >
            <Plus size={15} aria-hidden="true" /> Crear pedido
          </Link>
        </div>

        {esAdmin && (
          <label className="mt-3 flex items-center gap-2 text-sm">
            <span className="text-gris">Local</span>
            <select
              value={conversacion.sede_id ?? sedeParaTomar}
              onChange={(e) => (conversacion.sede_id || e.target.value === '' ? onAsignarSede(conversacion, e.target.value) : setSedeParaTomar(e.target.value))}
              className="min-h-11 flex-1 rounded-xl border border-borde bg-white px-3 text-sm font-semibold outline-none focus:border-acento"
            >
              <option value="">Sin local</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
            {!conversacion.sede_id && sedeParaTomar && (
              <button onClick={() => onAsignarSede(conversacion, sedeParaTomar)} className="min-h-11 rounded-xl border border-borde px-3 text-sm font-semibold">
                Asignar
              </button>
            )}
          </label>
        )}

        <button
          onClick={() => setVerContexto((v) => !v)}
          aria-expanded={verContexto}
          className="mt-3 flex min-h-11 w-full items-center justify-between rounded-xl border border-borde bg-white px-3.5 text-sm font-semibold"
        >
          Datos del cliente y pedidos
          {verContexto ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
        </button>
      </div>

      {/* El panel se carga siempre (alimenta la etiqueta «Pago por revisar») y se muestra al desplegarlo. */}
      <div className={verContexto ? 'block' : 'hidden'}>
        <PanelContexto conversacion={conversacion} cliente={cliente} alCargarPedidos={setPedidosRelacionados} />
      </div>

      <div className="flex max-h-[55vh] min-h-[220px] flex-col gap-1 overflow-y-auto rounded-2xl border border-borde bg-crema p-3" aria-live="polite">
        {grupos.length === 0 && <p className="py-6 text-center text-sm text-gris">Sin mensajes todavía.</p>}
        {grupos.map((g) => (
          <div key={g.etiqueta} className="flex flex-col gap-1.5">
            <p className="my-2 self-center rounded-full bg-borde/70 px-3 py-1 text-[11px] font-bold text-gris">{g.etiqueta}</p>
            {g.mensajes.map((m) => (
              <Burbuja key={m._i} m={m} />
            ))}
          </div>
        ))}
        <div ref={finMensajes} />
      </div>

      {conversacion.canal === 'whatsapp' && (
        <p
          className={`rounded-xl px-3.5 py-2.5 text-sm ${ventana.abierta ? 'bg-ok-suave text-ok' : 'bg-red-50 text-red-700'}`}
          role="status"
        >
          {ventana.abierta
            ? `Ventana de WhatsApp abierta · ${ventana.texto}`
            : 'Ventana de 24 horas cerrada: pasó más de un día desde el último mensaje del cliente. WhatsApp solo permite enviar plantillas aprobadas; el texto libre está desactivado.'}
        </p>
      )}
      {!puedeEscribir && (
        <p className="rounded-xl bg-borde/50 px-3.5 py-2.5 text-sm text-gris">
          {conversacion.estado === 'activa' ? 'La atiende el bot. Toma la conversación para escribir.' : 'Conversación cerrada. Tómala o devuélvela al bot para continuar.'}
        </p>
      )}
      {errorAccion && (
        <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {mensajeDeErrorDeEnvio(errorAccion)}
          {errorAccion.detalle && typeof errorAccion.detalle === 'string' ? <span className="block text-xs opacity-80">{errorAccion.detalle}</span> : null}
        </p>
      )}

      {verRapidas && (
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
      )}

      <div className="sticky bottom-2 flex items-end gap-2 rounded-2xl border border-borde bg-hueso p-2">
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
          disabled={escrituraBloqueada}
          placeholder={escrituraBloqueada ? 'No se puede escribir ahora' : 'Escribe una respuesta…'}
          aria-label="Respuesta"
          className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-borde bg-white px-3 py-2.5 text-[15px] outline-none focus:border-acento disabled:bg-borde/40"
        />
        <button
          type="button"
          onClick={enviar}
          disabled={escrituraBloqueada || !texto.trim() || ocupado}
          aria-label="Enviar"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-tinta text-white disabled:opacity-40"
        >
          <Send size={18} aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}

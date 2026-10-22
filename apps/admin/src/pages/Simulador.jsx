import { useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Bot, FlaskConical, Hand, Receipt, RotateCcw, SendHorizontal, Wrench } from 'lucide-react'
import { extraerReferencia } from '@bakebrothers/domain'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { simularMensajeBot } from '../lib/apiClient'
import { formatoPrecio } from '../utils/formato'
import { Pill, Portada, Tarjeta } from '../components/bakeos/ui'

const CLAVE_SESION = 'bb-simulador-bot'

const EJEMPLOS = [
  'Quiero 1 caja de alfajores mix para recoger hoy',
  'Hola 👋 quiero hacer un pedido (ref: tt-halloween)',
  '¿Cuánto cuesta una torta de carrot cake?',
  'Mi pedido llegó roto, quiero un reembolso',
]

const ETIQUETA_TOOL = {
  consultarPrecio: 'Consultó el precio',
  consultarDisponibilidad: 'Consultó disponibilidad',
  consultarCombo: 'Consultó un combo',
  consultarReglasCatering: 'Consultó reglas de catering',
  evaluarSemaforoCateringPedido: 'Evaluó el semáforo de catering',
  crearPedido: 'Creó un pedido',
  escalarAHumano: 'Derivó a una persona',
}

const ESTADOS = {
  activa: { texto: 'Con el bot', tono: 'ok' },
  escalada: { texto: 'Escalada: el bot ya no responde', tono: 'prioridad' },
  atendida_por_operador: { texto: 'Atendida por una persona', tono: 'lila' },
}

const ESTADO_PEDIDO = { confirmed: 'Confirmado', payment_pending: 'Pendiente de pago' }

// La conversación se guarda en sessionStorage: ir a Producción a ver el pedido y volver no debe borrar el chat.
function leerSesion() {
  try {
    const crudo = sessionStorage.getItem(CLAVE_SESION)
    return crudo ? JSON.parse(crudo) : null
  } catch {
    return null
  }
}

function guardarSesion(datos) {
  try {
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify(datos))
  } catch {
    // sin sessionStorage (modo privado, etc.): el simulador funciona igual, solo no recuerda el chat.
  }
}

function mensajeDeError(err) {
  switch (err.codigo) {
    case 'SIMULADOR_NO_CONFIGURADO':
      return 'La API todavía no tiene configurada la clave de Claude (ANTHROPIC_API_KEY). Hay que cargarla en el servidor.'
    case 'MODELO_NO_DISPONIBLE':
      return `El modelo no respondió: ${err.detalle ?? 'error desconocido'}`
    case 'SOLO_ADMIN':
      return 'El simulador es solo para administradores.'
    case 'SIN_CONEXION':
      return 'No se pudo conectar con la API. Revisa tu conexión; si sigue igual, la API puede estar caída o bloqueando este origen.'
    case 'SIN_SESION':
    case 'TOKEN_INVALIDO':
    case 'NO_AUTORIZADO':
      return 'Tu sesión venció. Vuelve a iniciar sesión.'
    default:
      return err.message || 'Error desconocido'
  }
}

function Burbuja({ mensaje }) {
  const esCliente = mensaje.rol === 'cliente'
  return (
    <div className={`flex ${esCliente ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[88%] ${esCliente ? '' : 'w-full'}`}>
        <div
          className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
            esCliente ? 'rounded-br-md bg-tinta text-white' : 'rounded-bl-md border border-borde bg-hueso'
          }`}
        >
          {mensaje.texto}
        </div>

        {!esCliente && mensaje.silenciado && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-gris">
            <Hand size={13} aria-hidden="true" /> El bot no respondió: la conversación ya la tiene una persona.
          </p>
        )}

        {!esCliente && mensaje.herramientas?.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {mensaje.herramientas.map((h, i) => (
              <span key={`${h}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-borde/70 px-2 py-0.5 text-[10.5px] font-semibold text-gris">
                <Wrench size={10} aria-hidden="true" />
                {ETIQUETA_TOOL[h] ?? h}
              </span>
            ))}
          </div>
        )}

        {!esCliente && mensaje.motivo && (
          <p className="mt-1.5 text-xs text-acento-oscuro">
            <span className="font-semibold">Derivada a una persona:</span> {mensaje.motivo}
          </p>
        )}

        {!esCliente &&
          mensaje.pedidos?.map((p) => (
            <Link
              key={p.numero}
              to="/produccion"
              className="mt-2 flex items-center gap-3 rounded-xl border border-ok/30 bg-ok-suave px-3 py-2.5 text-sm"
            >
              <Receipt size={18} className="shrink-0 text-ok" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ok">Pedido {p.numero} creado (prueba)</span>
                <span className="block text-xs text-gris">
                  {ESTADO_PEDIDO[p.estado] ?? p.estado} · {formatoPrecio(p.total)} · ver en Producción
                </span>
              </span>
            </Link>
          ))}
      </div>
    </div>
  )
}

export default function Simulador() {
  const { perfil } = useAuth()
  const inicial = useRef(leerSesion()).current
  const [sedes, setSedes] = useState([])
  const [sedeId, setSedeId] = useState(inicial?.sedeId ?? '')
  const [mensajes, setMensajes] = useState(inicial?.mensajes ?? [])
  const [estado, setEstado] = useState(inicial?.estado ?? 'activa')
  // Referencia de campaña de la conversación simulada: la última "(ref: …)" que escribió el "cliente", como en WhatsApp.
  const [campana, setCampana] = useState(inicial?.campana ?? null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const fin = useRef(null)

  useEffect(() => {
    let cancelado = false
    supabase
      .from('sedes')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => {
        if (cancelado || !data) return
        setSedes(data)
        // Sede por defecto: la primera (Cedros). Si había una guardada y sigue existiendo, se respeta.
        setSedeId((actual) => (data.some((s) => s.id === actual) ? actual : (data[0]?.id ?? '')))
      })
    return () => {
      cancelado = true
    }
  }, [])

  useEffect(() => {
    guardarSesion({ sedeId, mensajes, estado, campana })
    fin.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' })
  }, [sedeId, mensajes, estado, campana, enviando])

  if (perfil?.rol !== 'admin') return <Navigate to="/resumen" replace />

  const info = ESTADOS[estado] ?? ESTADOS.activa
  const empezada = mensajes.length > 0

  async function enviar(contenido) {
    const limpio = contenido.trim()
    if (!limpio || enviando || !sedeId) return
    setError(null)
    setEnviando(true)
    setTexto('')
    // El mensaje del "cliente" se ve de inmediato; la respuesta llega cuando el cerebro termina (varios segundos).
    const previos = mensajes
    setMensajes([...previos, { rol: 'cliente', texto: limpio, en: new Date().toISOString() }])
    try {
      const r = await simularMensajeBot({
        mensaje: limpio,
        sedeId,
        estado,
        // El servidor solo necesita rol/texto/en de cada turno, no la metadata de pantalla.
        // (sin la "(ref: …)": el bot nunca la ve, igual que en el webhook real)
        historial: previos.map(({ rol, texto: t, en }) => ({ rol, texto: extraerReferencia(t).texto, en })),
        campana,
      })
      setEstado(r.estado)
      setCampana(r.campana ?? null)
      setMensajes((actuales) => [
        ...actuales,
        {
          rol: 'bot',
          texto: r.respuesta ?? '(el bot no respondió)',
          en: new Date().toISOString(),
          silenciado: r.botSilenciado,
          herramientas: r.herramientasUsadas,
          motivo: r.motivoEscalacion,
          pedidos: r.pedidosCreados,
        },
      ])
    } catch (err) {
      setError(mensajeDeError(err))
      // El turno no se completó: se devuelve el texto al cuadro y se quita el mensaje que no llegó a procesarse.
      setMensajes(previos)
      setTexto(limpio)
    } finally {
      setEnviando(false)
    }
  }

  function reiniciar() {
    setMensajes([])
    setEstado('activa')
    setCampana(null)
    setError(null)
    setTexto('')
  }

  return (
    <>
      <Portada
        titulo="Simulador del bot"
        subtitulo="Escribe como si fueras un cliente y mira cómo responde el bot real."
        accion={false}
      />

      <div role="note" className="mt-4 flex gap-3 rounded-2xl border border-borde bg-lila-suave/60 p-4 text-sm leading-relaxed">
        <FlaskConical size={18} className="mt-0.5 shrink-0 text-lila" aria-hidden="true" />
        <p>
          <span className="font-semibold">Es una prueba:</span> usa el mismo cerebro (Claude), catálogo y precios del bot de
          WhatsApp, pero <span className="font-semibold">no envía nada por WhatsApp</span>. Si el bot crea un pedido, es real y
          aparece en Pedidos y Producción, marcado como <span className="font-semibold">[PRUEBA]</span>.
        </p>
      </div>

      <Tarjeta className="mt-4 flex flex-wrap items-center gap-3 p-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="font-semibold">Sede</span>
          <select
            value={sedeId}
            onChange={(e) => setSedeId(e.target.value)}
            disabled={empezada || enviando}
            className="rounded-lg border border-borde bg-crema px-2.5 py-1.5 text-sm disabled:opacity-60"
          >
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </label>
        <Pill tono={info.tono}>{info.texto}</Pill>
        {campana && <Pill tono="lila">Campaña: {campana}</Pill>}
        <button
          type="button"
          onClick={reiniciar}
          disabled={!empezada || enviando}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-borde px-2.5 py-1.5 text-xs font-semibold text-gris hover:text-tinta disabled:opacity-40"
        >
          <RotateCcw size={13} aria-hidden="true" /> Nueva conversación
        </button>
      </Tarjeta>

      <section aria-label="Conversación simulada" aria-live="polite" className="mt-4 space-y-3">
        {!empezada && (
          <Tarjeta className="text-center">
            <Bot size={28} className="mx-auto text-gris" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold">Empieza la conversación</p>
            <p className="mt-1 text-xs text-gris">Escribe abajo, o prueba con uno de estos ejemplos:</p>
            <div className="mt-3 flex flex-col gap-2">
              {EJEMPLOS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => enviar(e)}
                  disabled={enviando || !sedeId}
                  className="rounded-xl border border-borde bg-crema px-3 py-2.5 text-left text-sm hover:border-acento disabled:opacity-50"
                >
                  “{e}”
                </button>
              ))}
            </div>
          </Tarjeta>
        )}

        {mensajes.map((m, i) => (
          <Burbuja key={`${m.en}-${i}`} mensaje={m} />
        ))}

        {enviando && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md border border-borde bg-hueso px-3.5 py-2.5 text-sm text-gris">
              El bot está pensando…
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {/* scroll-mb: la barra de escribir es sticky y taparía lo último (p. ej. la tarjeta del pedido) al hacer scroll automático. */}
        <div ref={fin} className="scroll-mb-32" />
      </section>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          enviar(texto)
        }}
        className="sticky bottom-0 mt-4 flex items-end gap-2 bg-crema/95 pb-3 pt-2 backdrop-blur"
      >
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              enviar(texto)
            }
          }}
          rows={2}
          maxLength={1000}
          placeholder="Escribe como si fueras el cliente…"
          aria-label="Mensaje del cliente"
          className="min-h-[48px] flex-1 resize-none rounded-xl border border-borde bg-hueso px-3 py-2.5 text-sm outline-none focus:border-acento"
        />
        <button
          type="submit"
          disabled={enviando || !texto.trim() || !sedeId}
          aria-label="Enviar"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-tinta text-white disabled:opacity-40"
        >
          <SendHorizontal size={18} aria-hidden="true" />
        </button>
      </form>
    </>
  )
}

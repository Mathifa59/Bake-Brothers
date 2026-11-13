import { fechaLimaISO, mismoTelefono, motivoEscaladaLegible, sumarDiasISO, telefonoLegible, ultimos9 } from '@bakebrothers/domain'
import { fechaCorta, horaLegible } from './formato'

/** Estado de la conversación → texto, color (tono de <Pill>) y orden en la lista («lo que espera una persona va primero»). */
export const ESTADOS_BANDEJA = {
  escalada: { texto: 'Esperando persona', tono: 'prioridad', orden: 0 },
  atendida_por_operador: { texto: 'Atendiendo', tono: 'ok', orden: 1 },
  activa: { texto: 'Con el bot', tono: 'lila', orden: 2 },
  cerrada: { texto: 'Cerrada', tono: 'neutro', orden: 3 },
}

export const FILTROS_BANDEJA = [
  { clave: 'esperando', etiqueta: 'Esperando persona', cumple: (c) => c.estado === 'escalada' },
  { clave: 'atendiendo', etiqueta: 'Atendiendo', cumple: (c) => c.estado === 'atendida_por_operador' },
  { clave: 'todas', etiqueta: 'Todas', cumple: () => true },
]

/** Mensajes del cliente sin responder: los que están al final del historial, después del último mensaje del bot o del equipo. */
export function mensajesSinResponder(conversacion) {
  if (conversacion.estado !== 'escalada' && conversacion.estado !== 'atendida_por_operador') return 0
  const historial = conversacion.historial ?? []
  let n = 0
  for (let i = historial.length - 1; i >= 0 && historial[i].rol === 'cliente'; i--) n++
  return n
}

export function ultimoMensaje(conversacion) {
  const historial = conversacion.historial ?? []
  return historial.length ? historial[historial.length - 1] : null
}

/** Lista ordenada: primero lo que espera una persona (el que lleva más tiempo esperando, arriba); el resto, lo más reciente primero. */
export function ordenarBandeja(conversaciones) {
  return [...conversaciones].sort((a, b) => {
    const oa = ESTADOS_BANDEJA[a.estado]?.orden ?? 9
    const ob = ESTADOS_BANDEJA[b.estado]?.orden ?? 9
    if (oa !== ob) return oa - ob
    const ta = new Date(a.ultimo_mensaje_en).getTime()
    const tb = new Date(b.ultimo_mensaje_en).getTime()
    return a.estado === 'escalada' ? ta - tb : tb - ta
  })
}

/** Índice teléfono (últimos 9 dígitos) → cliente, para mostrar el nombre en vez del número en bruto. */
export function indexarClientes(clientes) {
  const mapa = new Map()
  for (const c of clientes ?? []) {
    if (c.telefono) mapa.set(ultimos9(c.telefono), c)
    // Un cliente con dos números: la conversación que llega por cualquiera de los dos muestra su nombre.
    if (c.telefono_secundario) mapa.set(ultimos9(c.telefono_secundario), c)
  }
  return mapa
}

export function clienteDe(conversacion, indice) {
  return indice?.get(ultimos9(conversacion.external_id)) ?? null
}

export function nombreDeConversacion(conversacion, indice) {
  const cliente = clienteDe(conversacion, indice)
  if (cliente?.nombre) return cliente.nombre
  return conversacion.canal === 'whatsapp' ? telefonoLegible(conversacion.external_id) : `Cliente de ${conversacion.canal}`
}

export const telefonoDeConversacion = (conversacion) =>
  conversacion.canal === 'whatsapp' ? telefonoLegible(conversacion.external_id) : conversacion.external_id

/** Motivo por el que el bot derivó la conversación (null si no hay o ya no aplica). */
export function motivoDeConversacion(conversacion) {
  if (conversacion.estado !== 'escalada') return null
  return motivoEscaladaLegible(conversacion.contexto?.ultimaEscalacion?.motivo ?? conversacion.contexto?.ultimoError?.motivo)
}

/** «hace 5 min», «hace 3 h», «ayer», «3 nov» — para el último mensaje de la lista. */
export function haceCuanto(iso, ahora = new Date()) {
  const t = new Date(iso)
  const min = Math.floor((ahora.getTime() - t.getTime()) / 60_000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const dias = Math.floor(h / 24)
  return dias === 1 ? 'ayer' : fechaCorta(fechaLimaISO(t))
}

/** Separador de día del chat: «Hoy», «Ayer» o «3 nov». */
export function etiquetaDia(iso, ahora = new Date()) {
  const dia = fechaLimaISO(new Date(iso))
  const hoy = fechaLimaISO(ahora)
  if (dia === hoy) return 'Hoy'
  if (dia === sumarDiasISO(hoy, -1)) return 'Ayer'
  return fechaCorta(dia)
}

/** Mensajes del historial agrupados por día, con la hora corta de Lima («5:54 p. m.»). */
export function agruparPorDia(historial, ahora = new Date()) {
  const grupos = []
  for (const [i, m] of (historial ?? []).entries()) {
    const en = m.en ? new Date(m.en) : null
    const etiqueta = en ? etiquetaDia(m.en, ahora) : 'Sin fecha'
    let g = grupos[grupos.length - 1]
    if (!g || g.etiqueta !== etiqueta) {
      g = { etiqueta, mensajes: [] }
      grupos.push(g)
    }
    g.mensajes.push({ ...m, _i: i, hora: en ? horaLegible(en) : '' })
  }
  return grupos
}

export { mismoTelefono, telefonoLegible }

/** Texto de la ventana de 24 h → mensaje de error legible cuando el servidor la rechaza. */
export function mensajeDeErrorDeEnvio(err) {
  switch (err?.codigo) {
    case 'VENTANA_24H_CERRADA':
      return 'La ventana de 24 horas está cerrada: WhatsApp solo permite enviar plantillas aprobadas. Elige una plantilla.'
    case 'SIN_ACCESO_A_LA_CONVERSACION':
      return 'Esta conversación es de otro local.'
    case 'TRANSICION_NO_VALIDA':
      return 'La conversación ya cambió de estado. Se actualizó la lista.'
    case 'CONVERSACION_NO_TOMADA':
      return 'Primero toma la conversación para poder escribirle.'
    case 'PLANTILLAS_NO_DISPONIBLES':
      return 'No se pudieron leer las plantillas de WhatsApp. Intenta de nuevo en un momento.'
    case 'PLANTILLA_NO_APROBADA':
      return 'Esa plantilla ya no está aprobada en WhatsApp. Elige otra.'
    case 'FALTAN_VARIABLES':
      return 'Completa todos los campos de la plantilla.'
    case 'ENVIO_FALLIDO':
      return 'WhatsApp no aceptó el mensaje. No se envió nada.'
    default:
      return err?.message ?? 'No se pudo completar la acción.'
  }
}

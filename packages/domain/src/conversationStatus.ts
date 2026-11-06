export const ESTADOS_CONVERSACION = [
  'activa',
  'escalada',
  'atendida_por_operador',
  'cerrada',
] as const

export type EstadoConversacion = (typeof ESTADOS_CONVERSACION)[number]

/**
 * Máquina de estados de una conversación de bot (WhatsApp/FB/IG). Extensión
 * del mismo patrón que orderStatus.ts, no un modelo aparte:
 *  - `activa`: el bot está atendiendo (RAG/tool-calling) sin intervención humana.
 *  - `escalada`: el bot no pudo resolver (o el cliente lo pidió) — requiere operador.
 *  - `atendida_por_operador`: un operador ya tomó la conversación en el dashboard.
 *  - `cerrada`: resuelta, sin acción pendiente.
 * `cerrada → activa` existe porque el mismo número puede volver a escribir
 * días después — no hace falta una conversación nueva para eso.
 *
 * Coexistence (2026-10): el equipo también responde desde la app del celular
 * del negocio. Meta avisa esas respuestas con un "message echo"
 * (`smb_message_echoes`) y, si la conversación estaba `activa` o `cerrada`,
 * pasa directo a `atendida_por_operador` para que el bot se calle — por eso
 * existen `activa → atendida_por_operador` y `cerrada → atendida_por_operador`
 * (antes solo se llegaba ahí desde `escalada`, vía el dashboard).
 */
export const TRANSICIONES_VALIDAS_CONVERSACION: Record<
  EstadoConversacion,
  readonly EstadoConversacion[]
> = {
  activa: ['escalada', 'cerrada', 'atendida_por_operador'],
  escalada: ['atendida_por_operador', 'cerrada'],
  atendida_por_operador: ['activa', 'cerrada'],
  cerrada: ['activa', 'atendida_por_operador'],
}

export function esEstadoConversacion(valor: string): valor is EstadoConversacion {
  return (ESTADOS_CONVERSACION as readonly string[]).includes(valor)
}

export function puedeTransicionarConversacion(
  actual: EstadoConversacion,
  siguiente: EstadoConversacion
): boolean {
  return TRANSICIONES_VALIDAS_CONVERSACION[actual]?.includes(siguiente) ?? false
}

/** Texto que ve el operador en el dashboard (Semana 3). */
export function estadoConversacionLegible(estado: EstadoConversacion): string {
  switch (estado) {
    case 'activa':
      return 'Atendida por el bot'
    case 'escalada':
      return 'Esperando operador'
    case 'atendida_por_operador':
      return 'Atendida por operador'
    case 'cerrada':
      return 'Cerrada'
  }
}

/** Horas sin mensajes humanos tras las que el bot retoma una conversación pausada por un echo (configurable, ver env AUTO_RETORNO_BOT_HORAS en apps/api). */
export const HORAS_AUTO_RETORNO_BOT_POR_DEFECTO = 3

export interface ConversacionParaAutoRetorno {
  estado: EstadoConversacion
  /** true solo si la conversación pasó a `atendida_por_operador` por un echo de Coexistence (no por una escalada del bot). */
  pausadaPorEcho: boolean
  /** Último mensaje humano (echo o respuesta del dashboard) — null si nunca hubo. */
  ultimoMensajeHumanoEn: Date | null
}

/**
 * ¿Debe el bot retomar esta conversación al llegar un mensaje nuevo del
 * cliente? Evaluación perezosa, sin cron: solo se pregunta cuando llega ese
 * mensaje.
 *
 * Regla central: SOLO las conversaciones pausadas por un echo se auto-retornan.
 * Una escalada del bot (semáforo de catering, alergia, reclamo, error) que
 * después tomó un humano NUNCA vuelve sola — requiere cierre/devolución
 * explícita de una persona. Lo garantiza `pausadaPorEcho`, que solo se
 * enciende al pasar a `atendida_por_operador` desde `activa`/`cerrada`/sin
 * conversación — nunca desde `escalada`.
 */
export function debeAutoRetornarAlBot(
  conversacion: ConversacionParaAutoRetorno,
  ahora: Date,
  horas: number = HORAS_AUTO_RETORNO_BOT_POR_DEFECTO
): boolean {
  if (conversacion.estado !== 'atendida_por_operador') return false
  if (!conversacion.pausadaPorEcho) return false
  if (!conversacion.ultimoMensajeHumanoEn) return false
  return ahora.getTime() - conversacion.ultimoMensajeHumanoEn.getTime() > horas * 60 * 60 * 1000
}

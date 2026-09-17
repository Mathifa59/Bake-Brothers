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
 */
export const TRANSICIONES_VALIDAS_CONVERSACION: Record<
  EstadoConversacion,
  readonly EstadoConversacion[]
> = {
  activa: ['escalada', 'cerrada'],
  escalada: ['atendida_por_operador', 'cerrada'],
  atendida_por_operador: ['activa', 'cerrada'],
  cerrada: ['activa'],
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

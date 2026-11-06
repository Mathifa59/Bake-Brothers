/**
 * Ventana de atención de 24 horas de WhatsApp: se puede escribir texto libre solo hasta 24 h después del
 * ÚLTIMO mensaje del cliente. Pasado ese tiempo solo se pueden enviar plantillas aprobadas por Meta.
 * Lógica pura: recibe el historial de la conversación y la hora actual.
 */
export const HORAS_VENTANA_WHATSAPP = 24

export interface MensajeConHora {
  rol: string
  en?: string | null
}

export interface EstadoVentana {
  abierta: boolean
  /** Instante en que se cierra (o se cerró). Null si el cliente nunca escribió. */
  venceEn: Date | null
  /** Milisegundos que quedan (0 si ya cerró). */
  restanteMs: number
  /** «Quedan 3 h 20 min», «Quedan 45 min» o «Cerrada». */
  texto: string
}

export function ultimoMensajeDelCliente(historial: MensajeConHora[]): Date | null {
  let ultimo: Date | null = null
  for (const m of historial) {
    if (m.rol !== 'cliente' || !m.en) continue
    const t = new Date(m.en)
    if (!Number.isNaN(t.getTime()) && (!ultimo || t > ultimo)) ultimo = t
  }
  return ultimo
}

export function estadoVentana24h(historial: MensajeConHora[], ahora: Date = new Date()): EstadoVentana {
  const ultimo = ultimoMensajeDelCliente(historial)
  if (!ultimo) return { abierta: false, venceEn: null, restanteMs: 0, texto: 'Cerrada' }
  const venceEn = new Date(ultimo.getTime() + HORAS_VENTANA_WHATSAPP * 3_600_000)
  const restanteMs = venceEn.getTime() - ahora.getTime()
  if (restanteMs <= 0) return { abierta: false, venceEn, restanteMs: 0, texto: 'Cerrada' }
  const minutos = Math.floor(restanteMs / 60_000)
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  const texto = h > 0 ? `Quedan ${h} h${m > 0 ? ` ${m} min` : ''}` : `Quedan ${Math.max(m, 1)} min`
  return { abierta: true, venceEn, restanteMs, texto }
}

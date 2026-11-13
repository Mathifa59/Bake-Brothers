/**
 * La hora de un pedido (`orders.horario_entrega`) es texto libre: «7:30», «07:30», «7:30 am», «4pm», «4:30 p. m.»,
 * «16:00», «7:30–8:00». Esto la convierte a minutos desde la medianoche para ordenar y para saber qué sale antes
 * de las 8:00 a. m. Si no se entiende devuelve null — nunca se adivina (un pedido sin hora clara no se cuenta
 * como «antes de las 8»).
 */
export function minutosDelDia(horario: string | null | undefined): number | null {
  if (!horario) return null
  // Un rango («7:30–8:00», «7:30 a 8:00») cuenta por su primera hora: es cuando hay que tenerlo listo.
  const primera = horario.trim().toLowerCase().split(/\s*(?:–|—|-|\ba\b|hasta)\s*(?=\d)/)[0]
  const m = primera.match(/^(\d{1,2})(?:[:.h](\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?\s*$/)
  if (!m) return null
  let h = Number(m[1])
  const min = m[2] ? Number(m[2]) : 0
  const sufijo = m[3]?.replace(/[\s.]/g, '')
  if (min > 59 || h > 24) return null
  // Con am/pm la hora va de 1 a 12: «0pm» y «13pm» no existen.
  if (sufijo && (h === 0 || h > 12)) return null
  if (sufijo === 'pm' && h < 12) h += 12
  else if (sufijo === 'am' && h === 12) h = 0
  if (h === 24) return min === 0 ? 24 * 60 : null
  return h * 60 + min
}

/** Hora límite de la primera tanda de despacho (mayoristas): lo que sale antes de las 8:00 a. m. */
export const LIMITE_DESPACHO_TEMPRANO_MIN = 8 * 60

export function saleAntesDeLas8(horario: string | null | undefined): boolean {
  const m = minutosDelDia(horario)
  return m !== null && m < LIMITE_DESPACHO_TEMPRANO_MIN
}

/** «07:30» a partir de minutos (para guardar una hora canónica en las órdenes de mayoristas). */
export function horaCanonica(minutos: number): string {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

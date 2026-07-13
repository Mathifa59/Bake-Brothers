/**
 * Reglas de anticipación mínima y capacidad de producción.
 *
 * Convención de fechas: la fecha de entrega es un `YYYY-MM-DD` local y la
 * anticipación se mide contra las 00:00 de ese día. Es deliberadamente
 * conservador: un pedido para "mañana" hecho a las 23:00 cuenta como 1 h de
 * anticipación, no 10 (no prometemos la franja horaria).
 */

const parseISODate = (iso: string): Date | null => {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/** Horas entre `ahora` y las 00:00 del día de entrega. NaN si la fecha es inválida. */
export function horasDeAnticipacion(fechaEntregaISO: string, ahora: Date = new Date()): number {
  const entrega = parseISODate(fechaEntregaISO)
  if (!entrega) return NaN
  return (entrega.getTime() - ahora.getTime()) / 3_600_000
}

export function cumpleAnticipacionMinima(params: {
  fechaEntregaISO: string
  anticipacionHorasMinima: number
  ahora?: Date
}): boolean {
  const { fechaEntregaISO, anticipacionHorasMinima, ahora } = params
  const horas = horasDeAnticipacion(fechaEntregaISO, ahora)
  if (Number.isNaN(horas)) return false
  return horas >= anticipacionHorasMinima
}

/**
 * Cupo de producción de un día. `cupoMaximo === null` significa "sin límite
 * configurado" (no bloquea). Un día bloqueado se modela como cupo 0.
 */
export function hayCupoDisponible(params: {
  cupoMaximo: number | null
  unidadesReservadas: number
  unidadesSolicitadas: number
}): boolean {
  const { cupoMaximo, unidadesReservadas, unidadesSolicitadas } = params
  if (cupoMaximo === null) return true
  return unidadesReservadas + unidadesSolicitadas <= cupoMaximo
}

/** Unidades que aún se pueden aceptar. `null` = sin límite. */
export function cupoRestante(params: {
  cupoMaximo: number | null
  unidadesReservadas: number
}): number | null {
  const { cupoMaximo, unidadesReservadas } = params
  if (cupoMaximo === null) return null
  return Math.max(0, cupoMaximo - unidadesReservadas)
}

/**
 * Reglas de anticipación mínima y capacidad de producción.
 *
 * Convención de fechas: la fecha de entrega es un `YYYY-MM-DD` **de Lima** y la
 * anticipación se mide contra las 00:00 (hora de Lima) de ese día — nunca con el
 * huso del servidor o del dispositivo (en Coolify es UTC: 5 horas de diferencia).
 * Es deliberadamente conservador: un pedido para "mañana" hecho a las 23:00 cuenta
 * como 1 h de anticipación, no 10 (no prometemos la franja horaria).
 */

import { inicioDiaLima } from './zonaLima.js'

const ISO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

/** Parsea un YYYY-MM-DD a (año, mes, día) o null si no es una fecha de calendario válida. */
const parseISODate = (iso: string): { y: number; m: number; d: number } | null => {
  const r = ISO_FECHA.exec(iso)
  if (!r) return null
  const [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])]
  const t = new Date(Date.UTC(y, m - 1, d))
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null
  return { y, m, d }
}

/** Horas entre `ahora` y las 00:00 (Lima) del día de entrega. NaN si la fecha es inválida. */
export function horasDeAnticipacion(fechaEntregaISO: string, ahora: Date = new Date()): number {
  if (!parseISODate(fechaEntregaISO)) return NaN
  return (inicioDiaLima(fechaEntregaISO).getTime() - ahora.getTime()) / 3_600_000
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

/** true si `fechaISO` (un día de calendario, sin huso) cae en domingo. */
export function esDomingo(fechaISO: string): boolean {
  const f = parseISODate(fechaISO)
  return f !== null && new Date(Date.UTC(f.y, f.m - 1, f.d)).getUTCDay() === 0
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

/**
 * Horario de cada local por día de la semana, ESTRUCTURADO (tabla `sedes_horarios`, migración 0050), y la validación de
 * la hora de recojo contra él. Lógica pura: la API junta las filas y esto decide. La hora siempre es la de Lima.
 *
 * Se puede recoger desde `abre` hasta ANTES de `cierra` (a la hora exacta de cierre ya no). Un día sin fila = cerrado.
 */
import { minutosDelDia } from './horaPedido.js'
import { fechaLimaISO, partesLima } from './zonaLima.js'

/** Un día de horario: `dia` 0 = domingo … 6 = sábado; `abre`/`cierra` en minutos desde la medianoche. */
export interface HorarioDia {
  dia: number
  abre: number
  cierra: number
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
export const diaDeSemana = (fechaISO: string): number => new Date(`${fechaISO}T12:00:00Z`).getUTCDay()
export const nombreDeDia = (fechaISO: string): string => DIAS[diaDeSemana(fechaISO)]

/** «7:30 a. m.», «8:30 p. m.», «12:00 p. m.». */
export function horaLegible(minutos: number): string {
  const h24 = Math.floor(minutos / 60) % 24
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h}:${String(minutos % 60).padStart(2, '0')} ${h24 < 12 ? 'a. m.' : 'p. m.'}`
}

/** «07:30:00» (columna `time` de Postgres) → minutos. */
export function minutosDeTime(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function horarioDelDia(horarios: readonly HorarioDia[], fechaISO: string): HorarioDia | null {
  const dia = diaDeSemana(fechaISO)
  return horarios.find((h) => h.dia === dia) ?? null
}

export type MotivoHoraInvalida = 'SIN_HORARIOS' | 'LOCAL_CERRADO' | 'HORA_NO_ENTENDIDA' | 'FUERA_DE_HORARIO' | 'HORA_PASADA'

export type ResultadoHoraRecojo =
  | { ok: true }
  | {
      ok: false
      motivo: MotivoHoraInvalida
      /** Horario de ese día en texto legible (cuando el local abre ese día). */
      abre?: string
      cierra?: string
    }

/**
 * ¿La hora de recojo cae dentro del horario del local ese día? Para HOY además tiene que ser posterior a la hora actual.
 *  - SIN_HORARIOS: el local no tiene horario cargado → no se puede validar (el bot deriva a una persona).
 *  - LOCAL_CERRADO: ese día no abre.
 *  - HORA_NO_ENTENDIDA: «por la tarde», vacío… → hay que pedir una hora concreta.
 *  - FUERA_DE_HORARIO / HORA_PASADA.
 */
export function validarHoraDeRecojo(p: {
  horarios: readonly HorarioDia[]
  fechaISO: string
  hora: string | null | undefined
  ahora: Date
}): ResultadoHoraRecojo {
  if (p.horarios.length === 0) return { ok: false, motivo: 'SIN_HORARIOS' }
  const dia = horarioDelDia(p.horarios, p.fechaISO)
  if (!dia) return { ok: false, motivo: 'LOCAL_CERRADO' }
  const info = { abre: horaLegible(dia.abre), cierra: horaLegible(dia.cierra) }
  const m = minutosDelDia(p.hora)
  if (m === null) return { ok: false, motivo: 'HORA_NO_ENTENDIDA', ...info }
  if (m < dia.abre || m >= dia.cierra) return { ok: false, motivo: 'FUERA_DE_HORARIO', ...info }
  if (p.fechaISO === fechaLimaISO(p.ahora)) {
    const ahora = partesLima(p.ahora)
    if (m <= ahora.hora * 60 + ahora.minuto) return { ok: false, motivo: 'HORA_PASADA', ...info }
  }
  return { ok: true }
}

/** Para el prompt: el horario de recojo de HOY de cada local («Cedros 7:30 a. m.–8:30 p. m.; Santa Marina cerrado hoy»). */
export function textoHorarioDeHoy(ahora: Date, locales: readonly { nombre: string; horarios: readonly HorarioDia[] }[]): string {
  const hoy = fechaLimaISO(ahora)
  const partes = locales.map((l) => {
    const d = horarioDelDia(l.horarios, hoy)
    return d ? `${l.nombre} ${horaLegible(d.abre)}–${horaLegible(d.cierra)}` : `${l.nombre} cerrado hoy`
  })
  return `HORARIO DE HOY (${nombreDeDia(hoy)}) PARA RECOJO: ${partes.join('; ')}. Se recoge desde la hora de apertura hasta antes del cierre; para hoy, además, la hora tiene que ser posterior a la actual.`
}

/**
 * Hora y fecha de Lima — el negocio opera en un solo lugar y Lima no tiene
 * horario de verano (UTC-5 todo el año), así que un offset fijo es exacto.
 * Nada de `new Date().getDate()`/`getHours()` del dispositivo: dependen del
 * timezone del navegador (ya causó un bug real de 5 horas, ver 0027).
 */
export const OFFSET_LIMA = '-05:00'

export interface PartesLima {
  /** YYYY-MM-DD en Lima. */
  fecha: string
  /** 0-23 en Lima. */
  hora: number
  minuto: number
}

const formateador = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function partesLima(fecha: Date): PartesLima {
  const p = Object.fromEntries(formateador.formatToParts(fecha).map((x) => [x.type, x.value]))
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour), minuto: Number(p.minute) }
}

export function fechaLimaISO(fecha: Date = new Date()): string {
  return partesLima(fecha).fecha
}

/** Suma (o resta) días a un YYYY-MM-DD, sin tocar ninguna zona horaria. */
export function sumarDiasISO(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + dias))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

/** El instante exacto en que empieza ese día calendario en Lima (00:00 hora Lima). */
export function inicioDiaLima(iso: string): Date {
  return new Date(`${iso}T00:00:00${OFFSET_LIMA}`)
}

/** Día de la semana en español ("lunes") de un YYYY-MM-DD. */
export function diaSemanaLegible(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('es-PE', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d, 12)))
}

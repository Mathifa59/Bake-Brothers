/**
 * Textos del horario de un local, GENERADOS desde la tabla por día (`sedes_horarios`): es la única fuente. De ahí salen
 * el texto que lee el bot, los renglones de la web («Lunes a sábado · 7:30 a. m. – 8:30 p. m.») y el JSON-LD de Google
 * (`openingHoursSpecification`). Un cambio de horario se hace en la tabla y nada más (la web se regenera con
 * `pnpm --filter @bakebrothers/api horarios:web`). Lógica pura.
 *
 * Los días con las mismas horas se juntan en un rango, también «dando la vuelta» a la semana (viernes a miércoles), y los
 * rangos salen del más largo al más corto.
 */
import { horaLegible, type HorarioDia } from './horarioLocal.js'

const NOMBRES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const EN_INGLES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
/** La semana empieza el lunes (como en Perú): lunes … sábado, domingo. */
const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0]

export interface GrupoHorario {
  /** Días de la semana (0 = domingo … 6 = sábado), en el orden del rango (puede dar la vuelta: vie, sáb, dom, lun, mar, mié). */
  dias: number[]
  abre: number
  cierra: number
}

/** Junta los días que tienen exactamente las mismas horas. Un día sin fila (cerrado) no entra en ningún grupo. */
export function agruparHorario(horarios: readonly HorarioDia[]): GrupoHorario[] {
  const clave = (dia: number): string | null => {
    const h = horarios.find((x) => x.dia === dia)
    return h ? `${h.abre}-${h.cierra}` : null
  }
  const claves = ORDEN_SEMANA.map(clave)
  const datos = (dia: number) => horarios.find((x) => x.dia === dia)!

  // Primer día de un rango: el que no tiene las mismas horas que el día anterior (en círculo). Si todos son iguales, hay uno solo.
  const inicio = claves.findIndex((c, i) => c !== claves[(i + 6) % 7])
  const grupos: GrupoHorario[] = []
  if (inicio === -1) {
    if (claves[0] !== null) grupos.push({ dias: [...ORDEN_SEMANA], abre: datos(1).abre, cierra: datos(1).cierra })
  } else {
    let actual: GrupoHorario | null = null
    for (let k = 0; k < 7; k++) {
      const i = (inicio + k) % 7
      const dia = ORDEN_SEMANA[i]
      if (claves[i] === null) {
        actual = null
        continue
      }
      if (actual && claves[i] === claves[(i + 6) % 7]) {
        actual.dias.push(dia)
      } else {
        actual = { dias: [dia], abre: datos(dia).abre, cierra: datos(dia).cierra }
        grupos.push(actual)
      }
    }
  }
  const posicion = (g: GrupoHorario) => ORDEN_SEMANA.indexOf(g.dias[0])
  return grupos.sort((a, b) => b.dias.length - a.dias.length || posicion(a) - posicion(b))
}

/** «lunes a sábado», «domingo», «sábado y domingo», «todos los días». */
export function rangoDeDias(dias: readonly number[]): string {
  if (dias.length === 7) return 'todos los días'
  if (dias.length === 1) return NOMBRES[dias[0]]
  if (dias.length === 2) return `${NOMBRES[dias[0]]} y ${NOMBRES[dias[1]]}`
  return `${NOMBRES[dias[0]]} a ${NOMBRES[dias[dias.length - 1]]}`
}

/** El texto que lee el bot: «lunes a sábado 7:30 a. m. a 8:30 p. m.; domingo 10:30 a. m. a 8:30 p. m.». Vacío si no hay horario. */
export function textoHorarioBot(horarios: readonly HorarioDia[]): string {
  return agruparHorario(horarios)
    .map((g) => `${rangoDeDias(g.dias)} ${horaLegible(g.abre)} a ${horaLegible(g.cierra)}`)
    .join('; ')
}

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Los renglones de la web: [{ dias: 'Lunes a sábado', horas: '7:30 a. m. – 8:30 p. m.' }, …]. */
export function renglonesHorarioWeb(horarios: readonly HorarioDia[]): { dias: string; horas: string }[] {
  return agruparHorario(horarios).map((g) => ({ dias: capitalizar(rangoDeDias(g.dias)), horas: `${horaLegible(g.abre)} – ${horaLegible(g.cierra)}` }))
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** `openingHoursSpecification` de schema.org para el JSON-LD (días en inglés, horas «HH:MM»). */
export function horarioJsonLd(horarios: readonly HorarioDia[]): { '@type': 'OpeningHoursSpecification'; dayOfWeek: string | string[]; opens: string; closes: string }[] {
  return agruparHorario(horarios).map((g) => ({
    '@type': 'OpeningHoursSpecification' as const,
    dayOfWeek: g.dias.length === 1 ? EN_INGLES[g.dias[0]] : g.dias.map((d) => EN_INGLES[d]),
    opens: hhmm(g.abre),
    closes: hhmm(g.cierra),
  }))
}

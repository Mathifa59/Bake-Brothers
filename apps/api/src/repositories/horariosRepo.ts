import type pg from 'pg'
import { minutosDeTime, type HorarioDia } from '@bakebrothers/domain'

/**
 * Horario estructurado de los locales (`sedes_horarios`, migración 0050). Cada fila es un día de la semana
 * (0 = domingo … 6 = sábado) con su hora de apertura y de cierre; un día sin fila = local cerrado.
 */
const aHorarioDia = (r: { dia_semana: number; abre: string; cierra: string }): HorarioDia => ({
  dia: r.dia_semana,
  abre: minutosDeTime(r.abre),
  cierra: minutosDeTime(r.cierra),
})

export async function horariosDeSede(client: pg.PoolClient, sedeId: string): Promise<HorarioDia[]> {
  const { rows } = await client.query(`select dia_semana, abre::text as abre, cierra::text as cierra from sedes_horarios where sede_id = $1`, [sedeId])
  return rows.map(aHorarioDia)
}

/** Los locales activos con su horario (para decirle al bot qué horas ofrecer y para sugerir «el otro local»). */
export interface LocalConHorario {
  id: string
  nombre: string
  direccion: string | null
  horarios: HorarioDia[]
}

export async function horariosDeLocales(client: pg.PoolClient): Promise<LocalConHorario[]> {
  const { rows } = await client.query(
    `select s.id, s.nombre, s.direccion, h.dia_semana, h.abre::text as abre, h.cierra::text as cierra
       from sedes s left join sedes_horarios h on h.sede_id = s.id
      where s.activo order by s.nombre`
  )
  const porSede = new Map<string, LocalConHorario>()
  for (const r of rows) {
    const s = porSede.get(r.id) ?? { id: r.id as string, nombre: r.nombre as string, direccion: (r.direccion as string | null) ?? null, horarios: [] }
    if (r.dia_semana !== null) s.horarios.push(aHorarioDia(r))
    porSede.set(r.id, s)
  }
  return [...porSede.values()]
}

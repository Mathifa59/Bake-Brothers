import type pg from 'pg'

/**
 * Las sedes temporales de las pruebas nacen sin horario, y un recojo en una sede sin horario cargado no se puede validar
 * (NO_SE_PUDO_VALIDAR, ver services/crearPedido.ts). Esto les da horario todos los días, de 00:00 a 23:59, para los tests
 * que no prueban horarios. Las filas se borran solas junto con la sede (on delete cascade).
 */
export async function darHorarioTodosLosDias(db: Pick<pg.Pool, 'query'>, sedeId: string): Promise<void> {
  await db.query(
    `insert into sedes_horarios (sede_id, dia_semana, abre, cierra)
     select $1, d, time '00:00', time '23:59' from generate_series(0, 6) as d
     on conflict (sede_id, dia_semana) do nothing`,
    [sedeId]
  )
}

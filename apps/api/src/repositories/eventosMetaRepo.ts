import type pg from 'pg'

/**
 * Guarda el payload crudo COMPLETO de un evento de Meta que se descarta sin
 * procesar (Messenger/Instagram, ver bot/parsearMensajesWhatsApp.ts —
 * ninguno de los dos tiene parser real todavía). Ver 0025 para el porqué:
 * antes esto solo quedaba en los logs de Coolify, que rotan.
 */
export async function guardarEventoMetaSinProcesar(
  client: pg.Pool | pg.PoolClient,
  canal: 'facebook' | 'instagram',
  payload: unknown
): Promise<void> {
  await client.query(`insert into eventos_meta_sin_procesar (canal, payload) values ($1, $2)`, [
    canal,
    JSON.stringify(payload),
  ])
}

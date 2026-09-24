import type pg from 'pg'

export type CanalConversacion = 'whatsapp' | 'facebook' | 'instagram'

/** Resuelve sede_id a partir del whatsapp_phone_number_id real que manda Meta — null si ninguna sede lo tiene cargado. */
export async function sedePorPhoneNumberId(client: pg.PoolClient, phoneNumberId: string): Promise<string | null> {
  const { rows } = await client.query(`select id from sedes where whatsapp_phone_number_id = $1`, [phoneNumberId])
  return rows[0]?.id ?? null
}

/** Busca la conversación por (tenant, canal, external_id) o la crea — una fila por identidad externa (ver 0009). */
export async function encontrarOCrearConversacion(
  client: pg.PoolClient,
  tenantId: string,
  canal: CanalConversacion,
  externalId: string,
  sedeId: string | null
): Promise<string> {
  const existente = await client.query(
    `select id from conversaciones where tenant_id = $1 and canal = $2 and external_id = $3`,
    [tenantId, canal, externalId]
  )
  if (existente.rows[0]) return existente.rows[0].id

  const creada = await client.query(
    `insert into conversaciones (tenant_id, canal, external_id, sede_id) values ($1, $2, $3, $4) returning id`,
    [tenantId, canal, externalId, sedeId]
  )
  return creada.rows[0].id
}

/**
 * Idempotencia real (ver 0024_mensajes_webhook_procesados.sql): intenta
 * marcar un mensaje real de Meta como procesado. Devuelve true la primera
 * vez (hay que correr el bot), false si ya se había procesado antes (Meta
 * reintentó el mismo mensaje — no hay que volver a correr nada).
 */
export async function marcarMensajeComoProcesado(client: pg.Pool | pg.PoolClient, mensajeId: string): Promise<boolean> {
  const { rows } = await client.query(
    `insert into mensajes_webhook_procesados (mensaje_id) values ($1) on conflict (mensaje_id) do nothing returning mensaje_id`,
    [mensajeId]
  )
  return rows.length > 0
}

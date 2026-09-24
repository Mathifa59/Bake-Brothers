import type pg from 'pg'

export type CanalConversacion = 'whatsapp' | 'facebook' | 'instagram'
export type EstadoConversacionDb = 'activa' | 'escalada' | 'atendida_por_operador' | 'cerrada'

export interface ConversacionParaResponder {
  id: string
  canal: CanalConversacion
  externalId: string
  sedeId: string | null
  estado: EstadoConversacionDb
}

/** Resuelve sede_id a partir del whatsapp_phone_number_id real que manda Meta — null si ninguna sede lo tiene cargado. */
export async function sedePorPhoneNumberId(client: pg.PoolClient, phoneNumberId: string): Promise<string | null> {
  const { rows } = await client.query(`select id from sedes where whatsapp_phone_number_id = $1`, [phoneNumberId])
  return rows[0]?.id ?? null
}

/** Dirección inversa de sedePorPhoneNumberId: el número real desde el que hay que responder por WhatsApp. */
export async function phoneNumberIdPorSede(client: pg.PoolClient, sedeId: string): Promise<string | null> {
  const { rows } = await client.query(`select whatsapp_phone_number_id from sedes where id = $1`, [sedeId])
  return rows[0]?.whatsapp_phone_number_id ?? null
}

/** Lee una conversación por id, dentro del tenant — para la bandeja del dashboard (routes/dashboardConversaciones.ts). */
export async function conversacionPorId(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<ConversacionParaResponder | null> {
  const { rows } = await client.query(
    `select id, canal, external_id, sede_id, estado from conversaciones where id = $1 and tenant_id = $2`,
    [id, tenantId]
  )
  const fila = rows[0]
  if (!fila) return null
  return {
    id: fila.id,
    canal: fila.canal,
    externalId: fila.external_id,
    sedeId: fila.sede_id,
    estado: fila.estado,
  }
}

/**
 * Agrega el mensaje del operador al historial y actualiza el estado — vía
 * `historial || $1::jsonb` (no leer+reescribir el array completo en JS) para
 * no perder mensajes concurrentes, mismo patrón que ya usa
 * procesarMensajeEntrante en cerebro.ts.
 */
export async function agregarMensajeOperador(
  client: pg.PoolClient,
  conversacionId: string,
  texto: string,
  nuevoEstado: EstadoConversacionDb
): Promise<void> {
  const nuevoMensaje = { rol: 'operador', texto, en: new Date().toISOString() }
  await client.query(
    `update conversaciones set historial = historial || $1::jsonb, estado = $2, ultimo_mensaje_en = now() where id = $3`,
    [JSON.stringify([nuevoMensaje]), nuevoEstado, conversacionId]
  )
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

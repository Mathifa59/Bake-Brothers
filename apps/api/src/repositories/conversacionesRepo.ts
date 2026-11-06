import type pg from 'pg'

export type CanalConversacion = 'whatsapp' | 'facebook' | 'instagram'
export type EstadoConversacionDb = 'activa' | 'escalada' | 'atendida_por_operador' | 'cerrada'

export interface ConversacionParaResponder {
  id: string
  canal: CanalConversacion
  externalId: string
  sedeId: string | null
  /** Número por el que escribió el cliente la última vez (desde ese se le responde). Null en conversaciones antiguas. */
  whatsappPhoneNumberId: string | null
  estado: EstadoConversacionDb
  historial: { rol: string; en?: string | null }[]
}

/**
 * Resuelve sede_id a partir del phone_number_id real que manda Meta, usando la
 * conexión ACTIVA del número (whatsapp_conexiones) — null si ninguna sede lo
 * tiene conectado. El webhook ya descarta los números no conectados antes de
 * llegar acá (routes/webhook.ts), así que en el flujo normal nunca es null.
 */
export async function sedePorPhoneNumberId(client: pg.PoolClient, phoneNumberId: string): Promise<string | null> {
  const { rows } = await client.query(
    `select sede_id from whatsapp_conexiones where phone_number_id = $1 and estado = 'activa'`,
    [phoneNumberId]
  )
  return rows[0]?.sede_id ?? null
}

/**
 * Dirección inversa de sedePorPhoneNumberId: el número real desde el que hay
 * que responder por WhatsApp. Sale de la conexión ACTIVA de la sede
 * (whatsapp_conexiones), no de sedes.whatsapp_phone_number_id: ese campo es
 * solo un espejo, y sin conexión activa no hay token con el que enviar — la
 * sede se considera "sin WhatsApp configurado".
 */
export async function phoneNumberIdPorSede(client: pg.PoolClient, sedeId: string): Promise<string | null> {
  const { rows } = await client.query(
    `select phone_number_id from whatsapp_conexiones where sede_id = $1 and estado = 'activa'`,
    [sedeId]
  )
  return rows[0]?.phone_number_id ?? null
}

/** Lee una conversación por id, dentro del tenant — para la bandeja del dashboard (routes/dashboardConversaciones.ts). */
export async function conversacionPorId(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<ConversacionParaResponder | null> {
  const { rows } = await client.query(
    `select id, canal, external_id, sede_id, whatsapp_phone_number_id, estado, historial from conversaciones where id = $1 and tenant_id = $2`,
    [id, tenantId]
  )
  const fila = rows[0]
  if (!fila) return null
  return {
    id: fila.id,
    canal: fila.canal,
    externalId: fila.external_id,
    sedeId: fila.sede_id,
    whatsappPhoneNumberId: fila.whatsapp_phone_number_id ?? null,
    estado: fila.estado,
    historial: Array.isArray(fila.historial) ? fila.historial : [],
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
  nuevoEstado: EstadoConversacionDb,
  // autor: nombre de quien respondió (se muestra en el chat). sedeAAsignar: si la conversación no tenía local, el
  // de quien la atiende. atendidaPor: se guarda para mostrar «Atiende: …» en la bandeja.
  opciones: { autor?: string; sedeAAsignar?: string | null; atendidaPor?: string | null } = {}
): Promise<void> {
  const nuevoMensaje = { rol: 'operador', texto, en: new Date().toISOString(), ...(opciones.autor ? { autor: opciones.autor } : {}) }
  await client.query(
    `update conversaciones
        set historial = historial || $1::jsonb,
            estado = $2,
            ultimo_mensaje_en = now(),
            sede_id = coalesce(sede_id, $4::uuid),
            contexto = case when $5::text is not null
                            then contexto || jsonb_build_object('atendidaPor', jsonb_build_object('nombre', $5::text, 'en', now()))
                            else contexto end
      where id = $3`,
    [JSON.stringify([nuevoMensaje]), nuevoEstado, conversacionId, opciones.sedeAAsignar ?? null, opciones.atendidaPor ?? null]
  )
}

/** Quién es esta persona para mostrarla en el chat: su nombre, o «Equipo <local>» (las cuentas de sede no tienen nombre), o «Dirección». */
export async function nombreVisibleDelOperador(client: pg.PoolClient, usuarioId: string): Promise<string> {
  const { rows } = await client.query(
    `select u.nombre, u.rol, s.nombre as sede from usuarios_dashboard u left join sedes s on s.id = u.sede_id where u.id = $1`,
    [usuarioId]
  )
  const f = rows[0]
  if (!f) return 'Equipo'
  if (f.nombre) return f.nombre as string
  if (f.rol === 'admin') return 'Dirección'
  return f.sede ? `Equipo ${f.sede}` : 'Equipo'
}

/**
 * Tomar / devolver al bot / cerrar. Cambia el estado (el trigger de 0017 sigue siendo la barrera final) y, al
 * tomar, deja la sede (si la conversación no tenía) y quién la atiende. Al devolver o cerrar se borra «atendidaPor».
 * Una conversación tomada a mano nunca se auto-retorna al bot (pausada_por_echo = false).
 */
export async function cambiarEstadoConversacion(
  client: pg.PoolClient,
  conversacionId: string,
  nuevoEstado: EstadoConversacionDb,
  opciones: { sedeAAsignar?: string | null; atendidaPor?: string | null } = {}
): Promise<void> {
  await client.query(
    `update conversaciones
        set estado = $2,
            pausada_por_echo = false,
            sede_id = coalesce(sede_id, $3::uuid),
            contexto = case when $4::text is not null
                            then contexto || jsonb_build_object('atendidaPor', jsonb_build_object('nombre', $4::text, 'en', now()))
                            else contexto - 'atendidaPor' end
      where id = $1`,
    [conversacionId, nuevoEstado, opciones.sedeAAsignar ?? null, opciones.atendidaPor ?? null]
  )
}

/** Cambia el local de la conversación (solo dirección). Pasar null la deja «sin local». */
export async function asignarSedeAConversacion(client: pg.PoolClient, conversacionId: string, sedeId: string | null): Promise<void> {
  await client.query(`update conversaciones set sede_id = $2 where id = $1`, [conversacionId, sedeId])
}

/** Busca la conversación por (tenant, canal, external_id) o la crea — una fila por identidad externa (ver 0009). */
export async function encontrarOCrearConversacion(
  client: pg.PoolClient,
  tenantId: string,
  canal: CanalConversacion,
  externalId: string,
  sedeId: string | null,
  // Número de WhatsApp por el que escribió el cliente: se guarda para responderle desde ese mismo número
  // (el del bot no tiene sede de donde sacarlo). Se actualiza en cada mensaje: la conversación es una por
  // cliente, y puede escribirle a un local y al bot.
  whatsappPhoneNumberId: string | null = null
): Promise<string> {
  const existente = await client.query(
    `select id, whatsapp_phone_number_id from conversaciones where tenant_id = $1 and canal = $2 and external_id = $3`,
    [tenantId, canal, externalId]
  )
  if (existente.rows[0]) {
    if (whatsappPhoneNumberId && existente.rows[0].whatsapp_phone_number_id !== whatsappPhoneNumberId) {
      await client.query(`update conversaciones set whatsapp_phone_number_id = $2 where id = $1`, [
        existente.rows[0].id,
        whatsappPhoneNumberId,
      ])
    }
    return existente.rows[0].id
  }

  const creada = await client.query(
    `insert into conversaciones (tenant_id, canal, external_id, sede_id, whatsapp_phone_number_id) values ($1, $2, $3, $4, $5) returning id`,
    [tenantId, canal, externalId, sedeId, whatsappPhoneNumberId]
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

import type pg from 'pg'

/**
 * Cliente (persona dueña del número de WhatsApp) de una conversación, con lo que el bot necesita saber de él:
 * si ya tenemos su nombre real y si alguna vez respondió a «¿quieres recibir promociones?».
 * Es el cliente de la CONVERSACIÓN (el que escribe), no el de un pedido: los mensajes promocionales van al
 * número que escribe, así que el consentimiento se guarda ahí aunque el pedido sea para otra persona.
 */
export interface ClienteDeConversacion {
  customerId: string
  nombre: string | null
  nombreConfirmado: boolean
  /** true = aceptó · false = dijo que no · null = nunca respondió (todavía se le puede preguntar). */
  aceptaMarketing: boolean | null
  /** Mayorista registrado: el bot no le cotiza ni le toma pedidos (lo atiende una persona por un WhatsApp directo). */
  esMayorista?: boolean
}

export async function leerClienteDeConversacion(
  client: pg.PoolClient,
  tenantId: string,
  conversacionId: string
): Promise<ClienteDeConversacion | null> {
  const { rows } = await client.query<{
    id: string
    nombre: string | null
    nombre_confirmado: boolean
    acepta_marketing: boolean | null
    es_mayorista: boolean
  }>(
    `select c.id, c.nombre, c.nombre_confirmado, c.acepta_marketing, c.es_mayorista
       from conversaciones cv
       join customers c on c.id = cv.customer_id and c.tenant_id = cv.tenant_id
      where cv.id = $1 and cv.tenant_id = $2`,
    [conversacionId, tenantId]
  )
  const f = rows[0]
  if (!f) return null
  return { customerId: f.id, nombre: f.nombre, nombreConfirmado: f.nombre_confirmado, aceptaMarketing: f.acepta_marketing, esMayorista: f.es_mayorista }
}

export type ResultadoConsentimiento =
  | { ok: true; guardado: true }
  /** Ya había respondido antes: la primera respuesta no se pisa (la pregunta se hace una sola vez). */
  | { ok: true; guardado: false; yaRespondido: true; aceptaMarketing: boolean | null }
  | { ok: false; error: 'CLIENTE_NO_ENCONTRADO' }

/**
 * Guarda la respuesta a «¿quieres recibir promociones?» en el cliente de la conversación. Solo escribe si todavía
 * no había respondido (`acepta_marketing is null`): una respuesta guardada no se sobrescribe desde el bot — cambiarla
 * es cosa de una persona. Guarda también cuándo respondió (para poder demostrarlo).
 */
export async function guardarConsentimientoPromociones(
  client: pg.PoolClient,
  tenantId: string,
  conversacionId: string,
  acepta: boolean
): Promise<ResultadoConsentimiento> {
  const cliente = await leerClienteDeConversacion(client, tenantId, conversacionId)
  if (!cliente) return { ok: false, error: 'CLIENTE_NO_ENCONTRADO' }
  const { rowCount } = await client.query(
    `update customers set acepta_marketing = $3, acepta_marketing_en = now()
      where id = $1 and tenant_id = $2 and acepta_marketing is null`,
    [cliente.customerId, tenantId, acepta]
  )
  if (!rowCount) return { ok: true, guardado: false, yaRespondido: true, aceptaMarketing: cliente.aceptaMarketing }
  return { ok: true, guardado: true }
}

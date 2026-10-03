import type pg from 'pg'

export type TipoTokenWhatsApp = 'negocio' | 'prueba'
export type OrigenConexionWhatsApp = 'embedded_signup' | 'manual'

/** Una fila de whatsapp_conexiones — incluye el token YA cifrado (nunca en claro, nunca sale por una ruta HTTP). */
export interface ConexionWhatsApp {
  id: string
  sedeId: string
  wabaId: string
  phoneNumberId: string
  businessId: string | null
  tokenCifrado: string
  tipoToken: TipoTokenWhatsApp
  origen: OrigenConexionWhatsApp
  estado: 'activa' | 'desconectada'
  syncContactosSolicitadoEn: Date | null
  syncHistorialSolicitadoEn: Date | null
  conectadoEn: Date
}

type Db = pg.Pool | pg.PoolClient

function filaAConexion(fila: Record<string, unknown>): ConexionWhatsApp {
  return {
    id: fila.id as string,
    sedeId: fila.sede_id as string,
    wabaId: fila.waba_id as string,
    phoneNumberId: fila.phone_number_id as string,
    businessId: (fila.business_id as string | null) ?? null,
    tokenCifrado: fila.token_cifrado as string,
    tipoToken: fila.tipo_token as TipoTokenWhatsApp,
    origen: fila.origen as OrigenConexionWhatsApp,
    estado: fila.estado as 'activa' | 'desconectada',
    syncContactosSolicitadoEn: (fila.sync_contactos_solicitado_en as Date | null) ?? null,
    syncHistorialSolicitadoEn: (fila.sync_historial_solicitado_en as Date | null) ?? null,
    conectadoEn: fila.conectado_en as Date,
  }
}

/** La conexión ACTIVA de un número, o null si ninguna sede lo tiene conectado. */
export async function conexionActivaPorPhoneNumberId(db: Db, phoneNumberId: string): Promise<ConexionWhatsApp | null> {
  const { rows } = await db.query(
    `select * from whatsapp_conexiones where phone_number_id = $1 and estado = 'activa'`,
    [phoneNumberId]
  )
  return rows[0] ? filaAConexion(rows[0]) : null
}

export interface RegistroConexionWhatsApp {
  sedeId: string
  wabaId: string
  phoneNumberId: string
  businessId?: string | null
  tokenCifrado: string
  tipoToken: TipoTokenWhatsApp
  origen: OrigenConexionWhatsApp
}

export class SedeNoEncontradaError extends Error {
  constructor(sedeId: string) {
    super(`No existe la sede ${sedeId}`)
  }
}

/**
 * Registra (o actualiza) la conexión de un número a una sede y deja
 * `sedes.whatsapp_phone_number_id`/`whatsapp_waba_id` en sintonía — todo en
 * la misma transacción del `client` que se pase (quien llama abre/cierra la
 * transacción), así un fallo a la mitad no deja la sede apuntando a un
 * número sin conexión ni al revés.
 *
 * Reglas (las dos con un índice único detrás, no solo con código):
 *  - una sola conexión ACTIVA por sede: si la sede ya tenía otra con un
 *    número distinto, esa pasa a `desconectada`;
 *  - un número pertenece a una sola sede: si estaba conectado a otra, se
 *    mueve (y esa otra sede pierde su phone_number_id).
 * Volver a registrar el mismo número reemplaza token/tipo/origen — es la
 * forma de rotar un token.
 */
export async function registrarConexionWhatsApp(
  client: pg.PoolClient,
  datos: RegistroConexionWhatsApp
): Promise<ConexionWhatsApp> {
  const sede = await client.query(`select id from sedes where id = $1`, [datos.sedeId])
  if (!sede.rows[0]) throw new SedeNoEncontradaError(datos.sedeId)

  await client.query(
    `update whatsapp_conexiones set estado = 'desconectada', actualizado_en = now()
     where sede_id = $1 and estado = 'activa' and phone_number_id <> $2`,
    [datos.sedeId, datos.phoneNumberId]
  )

  // Si ese número estaba conectado a OTRA sede, esa sede deja de apuntarle.
  await client.query(
    `update sedes set whatsapp_phone_number_id = null, whatsapp_waba_id = null
     where whatsapp_phone_number_id = $1 and id <> $2`,
    [datos.phoneNumberId, datos.sedeId]
  )

  const { rows } = await client.query(
    `insert into whatsapp_conexiones
       (sede_id, waba_id, phone_number_id, business_id, token_cifrado, tipo_token, origen)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (phone_number_id) do update set
       sede_id = excluded.sede_id,
       waba_id = excluded.waba_id,
       business_id = excluded.business_id,
       token_cifrado = excluded.token_cifrado,
       tipo_token = excluded.tipo_token,
       origen = excluded.origen,
       estado = 'activa',
       actualizado_en = now()
     returning *`,
    [
      datos.sedeId,
      datos.wabaId,
      datos.phoneNumberId,
      datos.businessId ?? null,
      datos.tokenCifrado,
      datos.tipoToken,
      datos.origen,
    ]
  )

  await client.query(`update sedes set whatsapp_phone_number_id = $1, whatsapp_waba_id = $2 where id = $3`, [
    datos.phoneNumberId,
    datos.wabaId,
    datos.sedeId,
  ])

  return filaAConexion(rows[0])
}

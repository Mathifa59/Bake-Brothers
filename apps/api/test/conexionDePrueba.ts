// Helper de tests contra Postgres real: deja un número "conectado" a una sede
// (fila activa en whatsapp_conexiones con el token cifrado de verdad + el
// espejo en sedes) y lo quita al terminar. Reemplaza al viejo truco de
// fijar sedes.whatsapp_phone_number_id a mano y mandar con un token global
// (META_WHATSAPP_TOKEN, que ya no existe — ver migración 0030).
import type pg from 'pg'
import { cifrarTokenWhatsApp } from '../src/bot/tokensWhatsApp.js'

export const TOKEN_DE_PRUEBA = 'token-de-negocio-de-prueba-fetch-mockeado'

type Db = pg.Pool | pg.PoolClient

export async function sembrarConexion(
  db: Db,
  datos: { sedeId: string; phoneNumberId: string; wabaId?: string; token?: string }
): Promise<void> {
  await quitarConexion(db, datos)
  await db.query(
    `insert into whatsapp_conexiones (sede_id, waba_id, phone_number_id, token_cifrado, tipo_token, origen)
     values ($1, $2, $3, $4, 'prueba', 'manual')`,
    [datos.sedeId, datos.wabaId ?? 'WABA_DE_PRUEBA', datos.phoneNumberId, cifrarTokenWhatsApp(datos.token ?? TOKEN_DE_PRUEBA)]
  )
  await db.query(`update sedes set whatsapp_phone_number_id = $1, whatsapp_waba_id = $2 where id = $3`, [
    datos.phoneNumberId,
    datos.wabaId ?? 'WABA_DE_PRUEBA',
    datos.sedeId,
  ])
}

export async function quitarConexion(db: Db, datos: { sedeId: string; phoneNumberId: string }): Promise<void> {
  await db.query(`delete from whatsapp_conexiones where phone_number_id = $1 or sede_id = $2`, [
    datos.phoneNumberId,
    datos.sedeId,
  ])
  await db.query(`update sedes set whatsapp_phone_number_id = null, whatsapp_waba_id = null where id = $1`, [datos.sedeId])
}

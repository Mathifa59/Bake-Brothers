/**
 * Registra a mano un número de WhatsApp en `whatsapp_conexiones`. Hace exactamente lo mismo que
 * POST /api/dashboard/whatsapp/conexiones/manual, sin pasar por el navegador: cifra el token con
 * WHATSAPP_TOKEN_ENCRYPTION_KEY. El token va por variable de entorno, NO por argumento: no queda en el
 * historial del shell ni en la lista de procesos.
 *
 * Dos usos (desde apps/api, con DATABASE_URL y WHATSAPP_TOKEN_ENCRYPTION_KEY en .env):
 *
 *  - NÚMERO DEL BOT (el plan vigente): un número nuevo, solo para el bot, conectado directo a la API de
 *    Meta en una app del portafolio de Bake Brothers, con token de usuario del sistema. No pertenece a una
 *    sede: el bot pregunta en qué local recoge el cliente.
 *      WHATSAPP_TOKEN_A_REGISTRAR=<token> pnpm whatsapp:registrar -- \
 *        --bot --waba <waba_id> --phone <phone_number_id> --tipo sistema
 *
 *  - NÚMERO DE UN LOCAL (o de prueba): lleva sede.
 *      WHATSAPP_TOKEN_A_REGISTRAR=<token> pnpm whatsapp:registrar -- \
 *        --sede <uuid o nombre exacto de la sede> --waba <waba_id> --phone <phone_number_id> \
 *        [--tipo prueba|negocio|sistema] [--business <business_id>]
 */
import { parseArgs } from 'node:util'
import { pool } from '../src/db.js'
import { cifrarTokenWhatsApp } from '../src/bot/tokensWhatsApp.js'
import { registrarConexionWhatsApp } from '../src/repositories/whatsappConexionesRepo.js'

const { values } = parseArgs({
  options: {
    sede: { type: 'string' },
    bot: { type: 'boolean', default: false },
    waba: { type: 'string' },
    phone: { type: 'string' },
    tipo: { type: 'string', default: 'prueba' },
    business: { type: 'string' },
  },
})

const token = process.env.WHATSAPP_TOKEN_A_REGISTRAR
if ((!values.sede && !values.bot) || (values.sede && values.bot) || !values.waba || !values.phone || !token) {
  console.error(
    'Faltan datos: elige --bot (número del bot, sin sede) o --sede <sede>, y pasa --waba, --phone y la variable WHATSAPP_TOKEN_A_REGISTRAR.'
  )
  process.exit(1)
}
if (values.tipo !== 'prueba' && values.tipo !== 'negocio' && values.tipo !== 'sistema') {
  console.error('--tipo debe ser "prueba", "negocio" o "sistema".')
  process.exit(1)
}

const client = await pool.connect()
try {
  await client.query('begin')
  let sede: { id: string; nombre: string } | null = null
  if (values.sede) {
    const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(values.sede)
    const { rows } = await client.query(
      esUuid ? `select id, nombre from sedes where id = $1` : `select id, nombre from sedes where nombre = $1`,
      [values.sede]
    )
    if (rows.length !== 1) {
      throw new Error(`No encontré exactamente una sede para "${values.sede}" (encontradas: ${rows.length})`)
    }
    sede = rows[0]
  }
  const conexion = await registrarConexionWhatsApp(client, {
    sedeId: sede?.id ?? null,
    uso: values.bot ? 'bot' : 'sede',
    wabaId: values.waba,
    phoneNumberId: values.phone,
    businessId: values.business ?? null,
    tokenCifrado: cifrarTokenWhatsApp(token),
    tipoToken: values.tipo,
    origen: 'manual',
  })
  await client.query('commit')
  console.log(
    `OK — conexión ${conexion.id} registrada: ${sede ? `sede "${sede.nombre}"` : 'NÚMERO DEL BOT (sin sede)'}, número ${conexion.phoneNumberId}, tipo ${conexion.tipoToken}, estado ${conexion.estado}`
  )
} catch (err) {
  await client.query('rollback').catch(() => {})
  console.error('No se registró la conexión:', err instanceof Error ? err.message : err)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}

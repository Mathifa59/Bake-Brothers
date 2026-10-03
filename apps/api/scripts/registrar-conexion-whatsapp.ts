/**
 * Registra a mano un número de WhatsApp en `whatsapp_conexiones` — pensado
 * para el número de PRUEBA de la app de DevHorses (ensayos y videos del App
 * Review antes de que el Embedded Signup esté aprobado). Hace exactamente lo
 * mismo que POST /api/dashboard/whatsapp/conexiones/manual, sin pasar por el
 * navegador: cifra el token con WHATSAPP_TOKEN_ENCRYPTION_KEY y deja
 * `sedes.whatsapp_phone_number_id` en sintonía.
 *
 * Uso (desde apps/api, con DATABASE_URL y WHATSAPP_TOKEN_ENCRYPTION_KEY en .env):
 *
 *   WHATSAPP_TOKEN_A_REGISTRAR=<token> pnpm whatsapp:registrar -- \
 *     --sede <uuid o nombre exacto de la sede> --waba <waba_id> --phone <phone_number_id> \
 *     [--tipo prueba|negocio] [--business <business_id>]
 *
 * El token va por variable de entorno, NO por argumento: no queda en el
 * historial del shell ni en la lista de procesos.
 */
import { parseArgs } from 'node:util'
import { pool } from '../src/db.js'
import { cifrarTokenWhatsApp } from '../src/bot/tokensWhatsApp.js'
import { registrarConexionWhatsApp } from '../src/repositories/whatsappConexionesRepo.js'

const { values } = parseArgs({
  options: {
    sede: { type: 'string' },
    waba: { type: 'string' },
    phone: { type: 'string' },
    tipo: { type: 'string', default: 'prueba' },
    business: { type: 'string' },
  },
})

const token = process.env.WHATSAPP_TOKEN_A_REGISTRAR
if (!values.sede || !values.waba || !values.phone || !token) {
  console.error('Faltan datos: --sede, --waba, --phone y la variable WHATSAPP_TOKEN_A_REGISTRAR son obligatorios.')
  process.exit(1)
}
if (values.tipo !== 'prueba' && values.tipo !== 'negocio') {
  console.error('--tipo debe ser "prueba" o "negocio".')
  process.exit(1)
}

const client = await pool.connect()
try {
  await client.query('begin')
  const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(values.sede)
  const { rows } = await client.query(
    esUuid ? `select id, nombre from sedes where id = $1` : `select id, nombre from sedes where nombre = $1`,
    [values.sede]
  )
  if (rows.length !== 1) {
    throw new Error(`No encontré exactamente una sede para "${values.sede}" (encontradas: ${rows.length})`)
  }
  const conexion = await registrarConexionWhatsApp(client, {
    sedeId: rows[0].id,
    wabaId: values.waba,
    phoneNumberId: values.phone,
    businessId: values.business ?? null,
    tokenCifrado: cifrarTokenWhatsApp(token),
    tipoToken: values.tipo,
    origen: 'manual',
  })
  await client.query('commit')
  console.log(
    `OK — conexión ${conexion.id} registrada: sede "${rows[0].nombre}", número ${conexion.phoneNumberId}, tipo ${conexion.tipoToken}, estado ${conexion.estado}`
  )
} catch (err) {
  await client.query('rollback').catch(() => {})
  console.error('No se registró la conexión:', err instanceof Error ? err.message : err)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}

/**
 * Alta de un número de WhatsApp: lo registra en la Cloud API de Meta, suscribe la app a la cuenta de WhatsApp y lo
 * deja registrado en Bake OS (tabla whatsapp_conexiones, con el token cifrado). Es el paso de la noche de la
 * migración del número: ver docs/migracion-numero.md.
 *
 * SECRETOS POR TERMINAL, nunca en archivos del repo ni como argumento (no deben quedar en el historial del shell
 * ni en la lista de procesos): el token y el PIN se leen de las variables de entorno WHATSAPP_TOKEN_A_REGISTRAR y
 * WHATSAPP_PIN o, si no están, se piden por la terminal sin mostrarlos mientras se escriben.
 *
 * Desde apps/api, con DATABASE_URL y WHATSAPP_TOKEN_ENCRYPTION_KEY en el .env:
 *
 *   pnpm whatsapp:alta -- --bot --waba <waba_id> --phone <phone_number_id>
 *   pnpm whatsapp:alta -- --sede Cedros --waba <waba_id> --phone <phone_number_id>
 *
 * Opciones: --solo-meta (no toca la base de Bake OS), --simular (muestra qué haría y no llama a nadie).
 * Para el número único de los dos locales usa --bot (no pertenece a ninguna sede).
 */
import { parseArgs } from 'node:util'
import { createInterface } from 'node:readline'
import { Writable } from 'node:stream'
import { altaNumeroMeta, validarPeticionAlta } from '../src/bot/altaNumeroMeta.js'

const { values } = parseArgs({
  options: {
    bot: { type: 'boolean', default: false },
    sede: { type: 'string' },
    waba: { type: 'string' },
    phone: { type: 'string' },
    'solo-meta': { type: 'boolean', default: false },
    simular: { type: 'boolean', default: false },
  },
})

if ((!values.bot && !values.sede) || (values.bot && values.sede) || !values.waba || !values.phone) {
  console.error('Uso: --bot (o --sede <nombre o uuid>) --waba <waba_id> --phone <phone_number_id> [--solo-meta] [--simular]')
  process.exit(1)
}

/** Pide un dato por la terminal sin mostrarlo mientras se escribe. */
function pedirOculto(pregunta: string): Promise<string> {
  return new Promise((resolve) => {
    let mudo = false
    const salida = new Writable({
      write(chunk, _enc, cb) {
        if (!mudo) process.stdout.write(chunk)
        cb()
      },
    })
    const rl = createInterface({ input: process.stdin, output: salida, terminal: true })
    rl.question(pregunta, (respuesta) => {
      rl.close()
      process.stdout.write('\n')
      resolve(respuesta.trim())
    })
    mudo = true
  })
}

const token = process.env.WHATSAPP_TOKEN_A_REGISTRAR?.trim() || (await pedirOculto('Token del usuario del sistema: '))
const pin = process.env.WHATSAPP_PIN?.trim() || (await pedirOculto('PIN de 6 dígitos de la verificación en dos pasos: '))

const { env } = await import('../src/env.js')
const peticion = { graphVersion: env.META_GRAPH_VERSION, phoneNumberId: values.phone, wabaId: values.waba, token, pin }

const problema = validarPeticionAlta(peticion)
if (problema) {
  console.error(problema)
  process.exit(1)
}

if (values.simular) {
  const base = `https://graph.facebook.com/${peticion.graphVersion}`
  console.log('Simulación — no se llama a nadie. Se haría, en orden:')
  console.log(`  1. GET  ${base}/${peticion.phoneNumberId}`)
  console.log(`  2. POST ${base}/${peticion.phoneNumberId}/register   (messaging_product=whatsapp, pin=******)`)
  console.log(`  3. POST ${base}/${peticion.wabaId}/subscribed_apps`)
  console.log(`  4. GET  ${base}/${peticion.wabaId}/subscribed_apps`)
  console.log(values['solo-meta'] ? '  (sin registrar en Bake OS)' : `  5. Registrar en Bake OS como ${values.bot ? 'NÚMERO DEL BOT (sin sede)' : `número de la sede "${values.sede}"`}`)
  process.exit(0)
}

const informe = await altaNumeroMeta(peticion)
for (const p of informe.pasos) console.log(`${p.ok ? '✔' : '✘'} ${p.paso}: ${p.detalle}`)
if (!informe.ok) {
  console.error('\nEl alta en Meta no terminó. No se registró nada en Bake OS. Revisa el mensaje de arriba y vuelve a correr el comando.')
  process.exit(1)
}

if (values['solo-meta']) {
  console.log('\nListo en Meta. (--solo-meta: no se registró en Bake OS.)')
  process.exit(0)
}

// Registro en Bake OS: el token se cifra con WHATSAPP_TOKEN_ENCRYPTION_KEY, igual que scripts/registrar-conexion-whatsapp.ts.
const { pool } = await import('../src/db.js')
const { cifrarTokenWhatsApp } = await import('../src/bot/tokensWhatsApp.js')
const { registrarConexionWhatsApp } = await import('../src/repositories/whatsappConexionesRepo.js')
const client = await pool.connect()
try {
  await client.query('begin')
  let sedeId: string | null = null
  if (values.sede) {
    const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(values.sede)
    const { rows } = await client.query(
      esUuid ? `select id from sedes where id = $1` : `select id from sedes where nombre = $1`,
      [values.sede]
    )
    if (rows.length !== 1) throw new Error(`No encontré exactamente una sede para "${values.sede}"`)
    sedeId = rows[0].id
  }
  const conexion = await registrarConexionWhatsApp(client, {
    sedeId,
    uso: values.bot ? 'bot' : 'sede',
    wabaId: values.waba,
    phoneNumberId: values.phone,
    businessId: null,
    tokenCifrado: cifrarTokenWhatsApp(token),
    tipoToken: 'sistema',
    origen: 'manual',
  })
  await client.query('commit')
  console.log(`\n✔ Registrado en Bake OS: conexión ${conexion.id} (${values.bot ? 'número del bot, sin sede' : `sede ${values.sede}`}), estado ${conexion.estado}.`)
} catch (err) {
  await client.query('rollback').catch(() => {})
  console.error('\nEl número quedó listo en Meta, pero NO se registró en Bake OS:', err instanceof Error ? err.message : err)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}

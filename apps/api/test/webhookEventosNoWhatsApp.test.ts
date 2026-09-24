// Prueba real de 0025_eventos_meta_sin_procesar.sql: un evento de Messenger
// u Instagram (ninguno de los dos tiene parser real todavía, ver
// bot/parsearMensajesWhatsApp.ts) se guarda con el payload crudo COMPLETO,
// no solo un mensaje de "evento ignorado" — así se puede construir el
// parser real después contra ejemplos que de verdad llegaron. No necesita
// mockear el SDK de Anthropic: estos eventos nunca llegan al cerebro del
// bot. Se salta si falta DATABASE_URL real.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { buildApp } from '../src/app.js'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

describe.skipIf(!hayBaseDeDatosReal)('POST /webhook — eventos de Messenger/Instagram sin procesar (real)', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  const marcador = `TEST_EVENTOS_${Date.now()}`

  beforeAll(async () => {
    client = await pool.connect()
  })

  afterAll(async () => {
    await client.query(`delete from eventos_meta_sin_procesar where payload->'entry'->0->>'id' = $1`, [marcador])
    client.release()
    await pool.end()
  })

  it('un evento real de Messenger (object: "page") se guarda con el payload crudo completo', async () => {
    const payloadMessenger = {
      object: 'page',
      entry: [
        {
          id: marcador,
          time: Date.now(),
          messaging: [
            {
              sender: { id: 'PSID_DE_PRUEBA' },
              recipient: { id: 'PAGE_ID_DE_PRUEBA' },
              timestamp: Date.now(),
              message: { mid: 'mid.DE_PRUEBA', text: '¿Tienen tortas de chocolate?' },
            },
          ],
        },
      ],
    }

    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/webhook', payload: payloadMessenger })
    expect(res.statusCode).toBe(200)

    const { rows } = await client.query(
      `select canal, payload from eventos_meta_sin_procesar where payload->'entry'->0->>'id' = $1`,
      [marcador]
    )
    expect(rows.length).toBe(1)
    expect(rows[0].canal).toBe('facebook')
    // El payload guardado tiene que ser el crudo COMPLETO, no un resumen.
    expect(rows[0].payload).toEqual(payloadMessenger)
  })

  it('un evento real de Instagram (object: "instagram") se guarda con canal correcto', async () => {
    const marcadorIg = `${marcador}_IG`
    const payloadInstagram = {
      object: 'instagram',
      entry: [
        {
          id: marcadorIg,
          time: Date.now(),
          messaging: [
            {
              sender: { id: 'IGSID_DE_PRUEBA' },
              recipient: { id: 'IG_ACCOUNT_DE_PRUEBA' },
              message: { mid: 'mid.IG_DE_PRUEBA', text: 'Hola, ¿hacen envíos?' },
            },
          ],
        },
      ],
    }

    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/webhook', payload: payloadInstagram })
    expect(res.statusCode).toBe(200)

    const { rows } = await client.query(
      `select canal, payload from eventos_meta_sin_procesar where payload->'entry'->0->>'id' = $1`,
      [marcadorIg]
    )
    expect(rows.length).toBe(1)
    expect(rows[0].canal).toBe('instagram')
    expect(rows[0].payload).toEqual(payloadInstagram)

    await client.query(`delete from eventos_meta_sin_procesar where payload->'entry'->0->>'id' = $1`, [marcadorIg])
  })

  it('un payload real de WhatsApp NO se guarda acá (sin falsos positivos)', async () => {
    const { rows: antes } = await client.query(`select count(*)::int as n from eventos_meta_sin_procesar`)

    const payloadWhatsApp = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA_DE_PRUEBA',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '51999999999', phone_number_id: 'PHONE_ID' },
                messages: [], // sin mensajes reales — solo importa que object sea whatsapp_business_account
              },
            },
          ],
        },
      ],
    }

    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/webhook', payload: payloadWhatsApp })
    expect(res.statusCode).toBe(200)

    const { rows: despues } = await client.query(`select count(*)::int as n from eventos_meta_sin_procesar`)
    expect(despues[0].n).toBe(antes[0].n)
  })
})

// Prueba real de la arquitectura async + idempotencia de POST /webhook (ver
// routes/webhook.ts + bot/procesarWebhookWhatsApp.ts). Meta considera
// fallido cualquier webhook que tarde más de ~3s en responder y reintenta el
// mismo mensaje si eso pasa — dos cosas que hay que probar con evidencia
// real, no solo revisando el código:
//   1. El POST responde 200 bien por debajo de 3s AUNQUE el procesamiento de
//      fondo (el cerebro del bot) tarde mucho más — se mockea el SDK de
//      Anthropic para que cada vuelta tarde ~1.2s de verdad (delay real, no
//      simulado), sumando bien por encima de 3s en total entre las 3 vueltas.
//   2. Mandar el MISMO mensaje (mismo id real de WhatsApp) dos veces no
//      duplica nada — ni el historial de la conversación ni un pedido real.
//
// Se salta si falta DATABASE_URL real, igual que el resto de tests de este
// proyecto contra Postgres real. Necesita un rol con select amplio en
// schema public + insert/update/delete en customers/orders/order_items/
// conversaciones/mensajes_webhook_procesados y update en order_sequences
// (mismo criterio que test/dashboardOrders.test.ts) — membresía en app_api
// alcanza para las políticas RLS de conversaciones.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

// obtenerApiKey() de cerebro.ts exige que la variable exista — el SDK está
// mockeado abajo, nunca sale un request real.
process.env.ANTHROPIC_API_KEY ||= 'dummy-para-test-mockeado-nunca-sale-un-request-real'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}))

// vi.mock se hoistea arriba de este import — app.js (y cerebro.ts dentro)
// ya recibe el SDK mockeado cuando se importa acá.
const { buildApp } = await import('../src/app.js')

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function payloadWhatsApp(mensajeId: string, telefono: string, texto: string) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_DE_PRUEBA',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '51999999999', phone_number_id: 'PHONE_ID_DE_PRUEBA' },
              contacts: [{ profile: { name: 'Cliente de prueba' }, wa_id: telefono }],
              messages: [
                {
                  from: telefono,
                  id: mensajeId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: texto },
                },
              ],
            },
          },
        ],
      },
    ],
  }
}

describe.skipIf(!hayBaseDeDatosReal)('POST /webhook — async + idempotencia real', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let tenantId: string

  beforeAll(async () => {
    client = await pool.connect()
    const { rows } = await client.query(`select id from tenants where slug = 'bake-brothers'`)
    tenantId = rows[0].id
  })

  afterAll(async () => {
    client.release()
    await pool.end()
  })

  afterEach(() => {
    mockCreate.mockReset()
  })

  it(
    'responde 200 en menos de 2.5s aunque el cerebro tarde ~3.6s de verdad, y procesa en segundo plano',
    async () => {
      const telefono = '999000777'
      const mensajeId = `wamid.TEST_ASYNC_${Date.now()}`

      await client.query(`delete from mensajes_webhook_procesados where mensaje_id = $1`, [mensajeId])
      await client.query(`delete from conversaciones where tenant_id = $1 and canal = 'whatsapp' and external_id = $2`, [
        tenantId,
        telefono,
      ])

      const DELAY_MS = 1200
      mockCreate
        .mockImplementationOnce(async () => {
          await esperar(DELAY_MS)
          return { content: [{ type: 'tool_use', id: 't1', name: 'consultarPrecio', input: { busqueda: 'carrot cake' } }] }
        })
        .mockImplementationOnce(async () => {
          await esperar(DELAY_MS)
          return {
            content: [{ type: 'tool_use', id: 't2', name: 'consultarDisponibilidad', input: { busqueda: 'carrot cake' } }],
          }
        })
        .mockImplementationOnce(async () => {
          await esperar(DELAY_MS)
          return { content: [{ type: 'text', text: 'Cuesta S/ 9.90 y sí hay disponible 😊' }] }
        })

      const app = await buildApp()
      try {
        const inicio = Date.now()
        const res = await app.inject({
          method: 'POST',
          url: '/webhook',
          payload: payloadWhatsApp(mensajeId, telefono, '¿Cuánto cuesta el carrot cake y hay stock?'),
        })
        const elapsedMs = Date.now() - inicio

        expect(res.statusCode).toBe(200)
        // El trabajo de fondo mockeado tarda >=3600ms reales — si la
        // respuesta lo esperara, este assert fallaría de verdad, no es un
        // número arbitrario.
        expect(elapsedMs).toBeLessThan(2500)

        // Justo después de responder, el trabajo de fondo (3 vueltas de
        // 1.2s) todavía no debería haber escrito nada — confirma que sigue
        // corriendo aparte, no que "por casualidad" ya había terminado.
        const { rows: filaInmediata } = await client.query(
          `select historial from conversaciones where tenant_id = $1 and canal = 'whatsapp' and external_id = $2`,
          [tenantId, telefono]
        )
        expect((filaInmediata[0]?.historial ?? []).length).toBe(0)

        // Ahora sí se espera de verdad a que el trabajo de fondo termine
        // (con margen sobre las 3 vueltas x 1.2s).
        let historialFinal: Array<{ rol: string; texto: string }> = []
        for (let intento = 0; intento < 20; intento++) {
          await esperar(300)
          const { rows } = await client.query(
            `select historial from conversaciones where tenant_id = $1 and canal = 'whatsapp' and external_id = $2`,
            [tenantId, telefono]
          )
          historialFinal = rows[0]?.historial ?? []
          if (historialFinal.length > 0) break
        }

        expect(mockCreate).toHaveBeenCalledTimes(3)
        expect(historialFinal.length).toBe(2)
        expect(historialFinal[0].rol).toBe('cliente')
        expect(historialFinal[1].texto).toMatch(/9[.,]90/)
      } finally {
        await client.query(`delete from conversaciones where tenant_id = $1 and canal = 'whatsapp' and external_id = $2`, [
          tenantId,
          telefono,
        ])
        await client.query(`delete from mensajes_webhook_procesados where mensaje_id = $1`, [mensajeId])
      }
    },
    15_000
  )

  it(
    'el mismo mensaje mandado dos veces (mismo id real de WhatsApp) no duplica el pedido ni el historial',
    async () => {
      const telefono = '999000778'
      const mensajeId = `wamid.TEST_DUP_${Date.now()}`

      await client.query(`delete from orders where customer_id in (select id from customers where telefono = $1)`, [telefono])
      await client.query(`delete from customers where telefono = $1`, [telefono])
      await client.query(`delete from conversaciones where tenant_id = $1 and canal = 'whatsapp' and external_id = $2`, [
        tenantId,
        telefono,
      ])
      await client.query(`delete from mensajes_webhook_procesados where mensaje_id = $1`, [mensajeId])

      const fecha = (() => {
        let d = new Date()
        d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 10)
        while (d.getDay() === 0) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      })()

      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            id: 'toolu_dup',
            name: 'crearPedido',
            input: {
              clienteNombre: 'Cliente Duplicado Test',
              clienteTelefono: telefono,
              tipoEntrega: 'tienda',
              fechaEntregaISO: fecha,
              horario: '4pm',
              items: [{ tipo: 'producto', busqueda: 'carrot cake', tamano: 'Individual', cantidad: 1 }],
              metodoPago: 'yape',
              pagoPorAdelantado: false,
            },
          },
        ],
      })
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '¡Listo! Tu pedido quedó registrado 😊' }],
      })

      const app = await buildApp()
      try {
        const payload = payloadWhatsApp(
          mensajeId,
          telefono,
          `Quiero un carrot cake individual para recoger en tienda el ${fecha} a las 4pm. Soy Cliente Duplicado Test, tel ${telefono}, pago con yape al llegar.`
        )

        const res1 = await app.inject({ method: 'POST', url: '/webhook', payload })
        expect(res1.statusCode).toBe(200)

        let ordenesLuego1 = 0
        for (let intento = 0; intento < 20; intento++) {
          await esperar(300)
          const { rows } = await client.query(
            `select count(*)::int as n from orders where customer_id in (select id from customers where telefono = $1)`,
            [telefono]
          )
          ordenesLuego1 = rows[0].n
          if (ordenesLuego1 > 0) break
        }
        expect(ordenesLuego1).toBe(1)
        expect(mockCreate).toHaveBeenCalledTimes(2)

        // Meta reintenta EXACTAMENTE el mismo mensaje (mismo id real).
        const res2 = await app.inject({ method: 'POST', url: '/webhook', payload })
        expect(res2.statusCode).toBe(200)
        await esperar(500)

        // El modelo no se volvió a llamar — el mensaje ya estaba marcado
        // como procesado, no se reprocesó nada.
        expect(mockCreate).toHaveBeenCalledTimes(2)

        const { rows: ordenesFinal } = await client.query(
          `select count(*)::int as n from orders where customer_id in (select id from customers where telefono = $1)`,
          [telefono]
        )
        expect(ordenesFinal[0].n).toBe(1)

        const { rows: convFinal } = await client.query(
          `select historial from conversaciones where tenant_id = $1 and canal = 'whatsapp' and external_id = $2`,
          [tenantId, telefono]
        )
        expect((convFinal[0]?.historial ?? []).length).toBe(2)
      } finally {
        await client.query(`delete from orders where customer_id in (select id from customers where telefono = $1)`, [telefono])
        await client.query(`delete from customers where telefono = $1`, [telefono])
        await client.query(`delete from conversaciones where tenant_id = $1 and canal = 'whatsapp' and external_id = $2`, [
          tenantId,
          telefono,
        ])
        await client.query(`delete from mensajes_webhook_procesados where mensaje_id = $1`, [mensajeId])
      }
    },
    20_000
  )
})

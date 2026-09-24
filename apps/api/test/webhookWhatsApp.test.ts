// Prueba real de la arquitectura async + idempotencia de POST /webhook (ver
// routes/webhook.ts + bot/procesarWebhookWhatsApp.ts). Meta considera
// fallido cualquier webhook que tarde más de ~3s en responder y reintenta el
// mismo mensaje si eso pasa — cosas que hay que probar con evidencia real,
// no solo revisando el código:
//   1. El POST responde 200 bien por debajo de 3s AUNQUE el procesamiento de
//      fondo (el cerebro del bot) tarde mucho más — se mockea el SDK de
//      Anthropic para que cada vuelta tarde ~1.2s de verdad (delay real, no
//      simulado), sumando bien por encima de 3s en total entre las 3 vueltas.
//      También confirma que la respuesta real del bot se manda de verdad por
//      WhatsApp (enviarMensajeMeta, con fetch mockeado — no hay token real
//      de Meta en este entorno).
//   2. Mandar el MISMO mensaje (mismo id real de WhatsApp) dos veces no
//      duplica nada — ni el historial de la conversación, ni un pedido real,
//      ni el envío real (fetch solo se llama una vez).
//   3. Si el cerebro revienta con una excepción real (no un rechazo de
//      negocio, un fallo real de la API de Anthropic) mientras procesa en
//      segundo plano, la conversación queda `escalada` con el motivo real
//      del error guardado — nunca se pierde el mensaje en silencio.
//   4. Un mensaje nuevo del cliente sobre una conversación que YA está
//      `escalada`/`atendida_por_operador` (un humano ya está a cargo) se
//      guarda en el historial (para que el operador lo vea) pero NO dispara
//      al cerebro (cero llamadas al SDK de Anthropic) ni manda ninguna
//      respuesta automática por WhatsApp — la única forma de que el bot
//      vuelva a responder solo es que el operador devuelva la conversación
//      a `activa` a mano (Conversaciones.jsx, transición ya existente en
//      conversationStatus.ts).
//
// Se salta si falta DATABASE_URL real, igual que el resto de tests de este
// proyecto contra Postgres real. Necesita un rol con select amplio en
// schema public + insert/update/delete en customers/orders/order_items/
// conversaciones/mensajes_webhook_procesados y update en order_sequences
// (mismo criterio que test/dashboardOrders.test.ts) — membresía en app_api
// alcanza para las políticas RLS de conversaciones.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

// obtenerApiKey() de cerebro.ts exige que la variable exista — el SDK está
// mockeado abajo, nunca sale un request real.
process.env.ANTHROPIC_API_KEY ||= 'dummy-para-test-mockeado-nunca-sale-un-request-real'
// enviarMensajeMeta (bot/meta.ts) exige esta variable para no fallar de
// entrada — fetch está mockeado abajo, nunca sale un request real a Meta.
process.env.META_WHATSAPP_TOKEN ||= 'dummy-token-para-test-fetch-mockeado'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

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

  beforeEach(() => {
    // Default: el envío real por WhatsApp "funciona" — los tests que
    // necesitan que falle lo pisan explícitamente.
    mockFetch.mockResolvedValue({ ok: true, text: async () => '' } as unknown as Response)
  })

  afterEach(() => {
    mockCreate.mockReset()
    mockFetch.mockReset()
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

        // La respuesta real del bot se mandó de verdad por WhatsApp
        // (enviarMensajeMeta → fetch a la Cloud API real de Meta, mockeado).
        expect(mockFetch).toHaveBeenCalledTimes(1)
        const [url, opciones] = mockFetch.mock.calls[0] as [string, RequestInit]
        expect(url).toBe('https://graph.facebook.com/v21.0/PHONE_ID_DE_PRUEBA/messages')
        expect((opciones.headers as Record<string, string>).Authorization).toBe('Bearer dummy-token-para-test-fetch-mockeado')
        const cuerpo = JSON.parse(opciones.body as string)
        expect(cuerpo.to).toBe(telefono)
        expect(cuerpo.text.body).toMatch(/9[.,]90/)
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
        expect(mockFetch).toHaveBeenCalledTimes(1)

        // Meta reintenta EXACTAMENTE el mismo mensaje (mismo id real).
        const res2 = await app.inject({ method: 'POST', url: '/webhook', payload })
        expect(res2.statusCode).toBe(200)
        await esperar(500)

        // El modelo no se volvió a llamar — el mensaje ya estaba marcado
        // como procesado, no se reprocesó nada. Tampoco se volvió a mandar
        // el mensaje por WhatsApp.
        expect(mockCreate).toHaveBeenCalledTimes(2)
        expect(mockFetch).toHaveBeenCalledTimes(1)

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

  it(
    'si el modelo revienta con un error real, la conversación queda escalada con el motivo real — nunca se pierde en silencio',
    async () => {
      const telefono = '999000779'
      const mensajeId = `wamid.TEST_ERROR_${Date.now()}`

      await client.query(`delete from conversaciones where tenant_id = $1 and canal = 'whatsapp' and external_id = $2`, [
        tenantId,
        telefono,
      ])
      await client.query(`delete from mensajes_webhook_procesados where mensaje_id = $1`, [mensajeId])

      // Error real del SDK, no un rechazo de negocio — simula, por ejemplo,
      // que la API de Anthropic esté caída o el request falle por la razón
      // que sea. No hay try/catch alrededor de esta llamada dentro del loop
      // de evaluarTurno — se propaga tal cual, que es justo lo que hay que
      // probar que el código de más arriba maneja bien.
      mockCreate.mockRejectedValueOnce(new Error('Fallo simulado de la API de Anthropic'))

      const app = await buildApp()
      try {
        const res = await app.inject({
          method: 'POST',
          url: '/webhook',
          payload: payloadWhatsApp(mensajeId, telefono, '¿Tienen torta de chocolate?'),
        })
        expect(res.statusCode).toBe(200)

        let estadoFinal: string | undefined
        let contextoFinal: { ultimoError?: { motivo?: string } } | undefined
        for (let intento = 0; intento < 20; intento++) {
          await esperar(300)
          const { rows } = await client.query(
            `select estado, contexto from conversaciones where tenant_id = $1 and canal = 'whatsapp' and external_id = $2`,
            [tenantId, telefono]
          )
          estadoFinal = rows[0]?.estado
          contextoFinal = rows[0]?.contexto
          if (estadoFinal === 'escalada') break
        }

        expect(estadoFinal).toBe('escalada')
        expect(contextoFinal?.ultimoError?.motivo).toMatch(/error interno/i)
        expect(contextoFinal?.ultimoError?.motivo).toMatch(/Fallo simulado de la API de Anthropic/)

        // El cerebro nunca llegó a generar una respuesta — no se intentó
        // mandar nada por WhatsApp.
        expect(mockFetch).not.toHaveBeenCalled()
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

  it.each(['escalada', 'atendida_por_operador'] as const)(
    'un mensaje nuevo sobre una conversación ya %s se guarda en el historial pero NO llama a Claude ni manda nada por WhatsApp',
    async (estadoPrevio) => {
      const telefono = estadoPrevio === 'escalada' ? '999000780' : '999000781'
      const mensajeId = `wamid.TEST_${estadoPrevio.toUpperCase()}_${Date.now()}`

      await client.query(`delete from conversaciones where tenant_id = $1 and canal = 'whatsapp' and external_id = $2`, [
        tenantId,
        telefono,
      ])
      await client.query(`delete from mensajes_webhook_procesados where mensaje_id = $1`, [mensajeId])

      const historialPrevio = [
        { rol: 'cliente', texto: 'Tengo un problema con mi pedido', en: new Date().toISOString() },
        { rol: 'bot', texto: 'Te derivo con un operador real, un momento por favor.', en: new Date().toISOString() },
      ]
      const { rows: creada } = await client.query(
        `insert into conversaciones (tenant_id, canal, external_id, estado, historial)
         values ($1, 'whatsapp', $2, $3, $4::jsonb) returning id`,
        [tenantId, telefono, estadoPrevio, JSON.stringify(historialPrevio)]
      )
      const conversacionId = creada[0].id as string

      const app = await buildApp()
      try {
        const res = await app.inject({
          method: 'POST',
          url: '/webhook',
          payload: payloadWhatsApp(mensajeId, telefono, 'Sigo esperando una respuesta, hola?'),
        })
        expect(res.statusCode).toBe(200)

        // Se espera al procesamiento de fondo igual que en los otros casos
        // de este archivo — sin asumir que ya terminó apenas responde 200.
        let historialFinal: Array<{ rol: string; texto: string }> = []
        let estadoFinal: string | undefined
        for (let intento = 0; intento < 15; intento++) {
          await esperar(300)
          const { rows } = await client.query(`select estado, historial from conversaciones where id = $1`, [conversacionId])
          estadoFinal = rows[0]?.estado
          historialFinal = rows[0]?.historial ?? []
          if (historialFinal.length > historialPrevio.length) break
        }

        expect(historialFinal.length).toBe(historialPrevio.length + 1)
        expect(historialFinal[historialPrevio.length]).toMatchObject({
          rol: 'cliente',
          texto: 'Sigo esperando una respuesta, hola?',
        })
        // El estado no lo cambia el mensaje entrante — sigue igual que
        // antes, nadie lo "reactiva" solo con que el cliente escriba.
        expect(estadoFinal).toBe(estadoPrevio)

        // El cerebro nunca se llamó (ni siquiera un intento fallido) y no
        // se mandó ninguna respuesta automática por WhatsApp.
        expect(mockCreate).not.toHaveBeenCalled()
        expect(mockFetch).not.toHaveBeenCalled()
      } finally {
        await client.query(`delete from conversaciones where id = $1`, [conversacionId])
        await client.query(`delete from mensajes_webhook_procesados where mensaje_id = $1`, [mensajeId])
      }
    },
    10_000
  )
})

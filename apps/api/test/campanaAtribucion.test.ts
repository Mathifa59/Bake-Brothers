// Atribución de campañas de punta a punta (sin herramientas externas): la landing
// agrega "(ref: tt-halloween)" al mensaje prellenado de WhatsApp → POST /webhook real →
// la referencia se guarda en la conversación y NO llega al modelo → el pedido que crea
// el bot la lleva en orders.campana. Con el SDK de Anthropic y el envío a Meta
// mockeados (sin credenciales reales); todo lo demás corre real contra Postgres.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { fechaLimaISO } from '@bakebrothers/domain'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

process.env.ANTHROPIC_API_KEY ||= 'dummy-para-test-mockeado-nunca-sale-un-request-real'
process.env.META_WHATSAPP_TOKEN ||= 'dummy-token-para-test-fetch-mockeado'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({ messages: { create: mockCreate } })),
}))
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { buildApp } = await import('../src/app.js')

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

function payload(mensajeId: string, telefono: string, texto: string) {
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
              messages: [{ from: telefono, id: mensajeId, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: texto } }],
            },
          },
        ],
      },
    ],
  }
}

const TEL = '999000888'
const TEL_PEDIDO = '999000889' // teléfono de contacto que da el cliente al pedir

describe.skipIf(!hayBaseDeDatosReal)('atribución de campañas — webhook real', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let app: Awaited<ReturnType<typeof buildApp>>
  let tenantId: string
  let n = 0

  const limpiar = async () => {
    await pool.query(`delete from order_items where order_id in (select o.id from orders o join customers c on c.id = o.customer_id where c.telefono = $1)`, [TEL_PEDIDO])
    await pool.query(`delete from orders where customer_id in (select id from customers where telefono = $1)`, [TEL_PEDIDO])
    await pool.query(`delete from customers where telefono = $1`, [TEL_PEDIDO])
    await pool.query(`delete from conversaciones where tenant_id = $1 and canal = 'whatsapp' and external_id = $2`, [tenantId, TEL])
    await pool.query(`delete from mensajes_webhook_procesados where mensaje_id like 'wamid.TEST_CAMPANA_%'`)
  }

  const enviar = async (texto: string) => {
    const res = await app.inject({ method: 'POST', url: '/webhook', payload: payload(`wamid.TEST_CAMPANA_${Date.now()}_${n++}`, TEL, texto) })
    expect(res.statusCode).toBe(200)
  }
  /** El cerebro corre en segundo plano después del 200: se espera a que el historial tenga la respuesta del bot. */
  const esperarRespuestaDelBot = async (turnosBot: number) => {
    for (let i = 0; i < 60; i++) {
      const { rows } = await pool.query(`select historial from conversaciones where tenant_id = $1 and external_id = $2`, [tenantId, TEL])
      const bots = (rows[0]?.historial ?? []).filter((h: { rol: string }) => h.rol === 'bot').length
      if (bots >= turnosBot) return
      await esperar(100)
    }
    throw new Error('el bot no respondió a tiempo')
  }
  const conversacion = async () =>
    (await pool.query(`select contexto, historial from conversaciones where tenant_id = $1 and external_id = $2`, [tenantId, TEL])).rows[0]

  beforeAll(async () => {
    tenantId = (await pool.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
    app = await buildApp()
  })
  afterAll(async () => {
    await limpiar()
    await pool.end()
  })
  beforeEach(async () => {
    await limpiar()
    mockFetch.mockResolvedValue({ ok: true, text: async () => '' } as unknown as Response)
  })
  afterEach(() => {
    mockCreate.mockReset()
    mockFetch.mockReset()
  })

  const textoDelBot = (texto: string) => ({ content: [{ type: 'text', text: texto }] })

  it('la referencia del primer mensaje se guarda en la conversación y el modelo nunca la ve', async () => {
    mockCreate.mockResolvedValueOnce(textoDelBot('¡Hola! ¿Qué te provoca hoy? 😊'))
    await enviar('Hola Bake Brothers 👋 Quiero hacer un pedido (ref: tt-halloween)')
    await esperarRespuestaDelBot(1)

    const c = await conversacion()
    expect(c.contexto.campana).toBe('tt-halloween')
    // ni en el historial ni en lo que recibió Claude
    expect(c.historial[0].texto).toBe('Hola Bake Brothers 👋 Quiero hacer un pedido')
    const mensajesAlModelo = JSON.stringify(mockCreate.mock.calls[0][0].messages)
    expect(mensajesAlModelo).not.toMatch(/ref:/i)
    expect(mensajesAlModelo).toContain('Quiero hacer un pedido')
  })

  it('el pedido que crea el bot en esa conversación queda con orders.campana', async () => {
    mockCreate.mockResolvedValueOnce(textoDelBot('¡Hola! Cuéntame qué quieres 😊'))
    await enviar('Hola Bake Brothers 👋 (ref: ig-navidad)')
    await esperarRespuestaDelBot(1)

    mockCreate
      .mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            id: 'toolu_pedido',
            name: 'crearPedido',
            input: {
              clienteNombre: 'Carla Campaña',
              clienteTelefono: TEL_PEDIDO,
              tipoEntrega: 'tienda',
              fechaEntregaISO: fechaLimaISO(),
              horario: '8:00 pm',
              items: [{ tipo: 'producto', busqueda: 'alfajor mix', tamano: 'Caja x10', cantidad: 1 }],
              metodoPago: 'yape',
              pagoPorAdelantado: false,
            },
          },
        ],
      })
      .mockResolvedValueOnce(textoDelBot('¡Listo! Tu pedido quedó registrado 🎉'))
    await enviar('Una caja de alfajores mix x10, soy Carla, mi teléfono es 999000889, la recojo hoy a las 8 pm y pago con yape')
    await esperarRespuestaDelBot(2)

    const { rows } = await pool.query(
      `select o.campana, o.canal, o.estado from orders o join customers c on c.id = o.customer_id where c.telefono = $1`,
      [TEL_PEDIDO]
    )
    expect(rows).toEqual([{ campana: 'ig-navidad', canal: 'whatsapp', estado: 'confirmed' }])
  })

  it('si el cliente vuelve por otra campaña, gana la más reciente (los pedidos nuevos se atribuyen a esa)', async () => {
    mockCreate.mockResolvedValue(textoDelBot('Claro 😊'))
    await enviar('Hola (ref: tt-halloween)')
    await esperarRespuestaDelBot(1)
    expect((await conversacion()).contexto.campana).toBe('tt-halloween')

    await enviar('Hola otra vez (ref: ig-navidad)')
    await esperarRespuestaDelBot(2)
    expect((await conversacion()).contexto.campana).toBe('ig-navidad')
  })

  it('un mensaje posterior SIN referencia no borra la campaña de la conversación', async () => {
    mockCreate.mockResolvedValue(textoDelBot('Claro 😊'))
    await enviar('Hola (ref: tt-halloween)')
    await esperarRespuestaDelBot(1)
    await enviar('¿tienen tortas de chocolate?')
    await esperarRespuestaDelBot(2)
    expect((await conversacion()).contexto.campana).toBe('tt-halloween')
  })

  it('sin referencia (la mayoría de los clientes) el pedido queda con campana NULL', async () => {
    mockCreate
      .mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            id: 'toolu_pedido2',
            name: 'crearPedido',
            input: {
              clienteNombre: 'Sin Campaña',
              clienteTelefono: TEL_PEDIDO,
              tipoEntrega: 'tienda',
              fechaEntregaISO: fechaLimaISO(),
              horario: '8:00 pm',
              items: [{ tipo: 'producto', busqueda: 'alfajor mix', tamano: 'Caja x10', cantidad: 1 }],
              metodoPago: 'yape',
              pagoPorAdelantado: false,
            },
          },
        ],
      })
      .mockResolvedValueOnce(textoDelBot('¡Listo! 🎉'))
    await enviar('Quiero una caja de alfajores mix x10 para hoy, soy Sin Campaña, 999000889, 8 pm, yape')
    await esperarRespuestaDelBot(1)

    const { rows } = await pool.query(
      `select o.campana from orders o join customers c on c.id = o.customer_id where c.telefono = $1`,
      [TEL_PEDIDO]
    )
    expect(rows).toEqual([{ campana: null }])
    expect((await conversacion()).contexto.campana).toBeUndefined()
  })
})

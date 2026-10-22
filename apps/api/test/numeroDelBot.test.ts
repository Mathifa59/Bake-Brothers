// Número NUEVO solo para el bot (sin sede). Plan vigente de WhatsApp: el número se conecta directo a la
// API de Meta con token de usuario del sistema, no pertenece a ningún local, y el bot tiene que
// preguntar en qué local recoge el cliente (o si es delivery) ANTES de crear el pedido.
//
// Se prueba contra Postgres real (mismo criterio que el resto de tests de la API; se salta sin
// DATABASE_URL) y con el SDK de Anthropic y `fetch` mockeados — nunca sale un request real:
//   1. crearPedido EXIGE la sede (el servidor, no el modelo): SEDE_REQUERIDA / SEDE_NO_VALIDA, el
//      local se reconoce sin importar mayúsculas ni "local de…", y una conversación que ya trae sede
//      no pregunta nada. Un rechazo no deja rastro (ni cliente ni pedido).
//   2. Delivery: usa SEDE_DELIVERY si está configurada; si no, el pedido queda sin sede.
//   3. El prompt del modelo recibe el contexto de sede SOLO cuando la conversación no la trae.
//   4. De punta a punta por POST /webhook con una conexión `uso = 'bot'`: el bot pregunta, el cliente
//      responde, el pedido nace con la sede elegida, la conversación sigue sin sede y la respuesta sale
//      por el número del bot con su token.
//   5. Responder desde el panel una conversación sin sede usa el número por el que escribió el cliente.
//   6. La firma de Meta es obligatoria en producción (503 sin META_APP_SECRET, 401 con firma mala).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

process.env.ANTHROPIC_API_KEY ||= 'dummy-para-test-mockeado-nunca-sale-un-request-real'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { buildApp } = await import('../src/app.js')
const { env } = await import('../src/env.js')
const { crearPedido } = await import('../src/services/crearPedido.js')
const { evaluarTurno, textoContextoSede } = await import('../src/bot/cerebro.js')
const { registrarConexionWhatsApp } = await import('../src/repositories/whatsappConexionesRepo.js')
const { cifrarTokenWhatsApp } = await import('../src/bot/tokensWhatsApp.js')
const { responderConversacion } = await import('../src/services/responderConversacion.js')

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Próxima fecha (a 10 días, saltando domingos) en formato YYYY-MM-DD. */
function fechaValida(): string {
  let d = new Date()
  d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 10)
  while (d.getDay() === 0) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const SEDE_UNO = 'Zeta Prueba'
const SEDE_DOS = 'Omega Prueba'

describe('textoContextoSede', () => {
  it('lista los locales y pide preguntar el local sin asumirlo', () => {
    const t = textoContextoSede(['Cedros', 'Santa Marina'])
    expect(t).toContain('Cedros o Santa Marina')
    expect(t).toMatch(/NO pertenece a un local/)
    expect(t).toMatch(/sedeRecojo/)
  })
})

describe.skipIf(!hayBaseDeDatosReal)('número del bot — sede del pedido', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let tenantId: string
  let sedeUnoId: string
  let sedeDosId: string

  beforeAll(async () => {
    client = await pool.connect()
    tenantId = (await client.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
    await client.query(`delete from sedes where nombre in ($1, $2)`, [SEDE_UNO, SEDE_DOS])
    sedeUnoId = (await client.query(`insert into sedes (nombre) values ($1) returning id`, [SEDE_UNO])).rows[0].id
    sedeDosId = (await client.query(`insert into sedes (nombre) values ($1) returning id`, [SEDE_DOS])).rows[0].id
  })

  afterAll(async () => {
    await client.query(`delete from sedes where id = any($1::uuid[])`, [[sedeUnoId, sedeDosId]])
    client.release()
    await pool.end()
  })

  beforeEach(() => {
    mockFetch.mockResolvedValue({ ok: true, text: async () => '' } as unknown as Response)
  })

  afterEach(() => {
    mockCreate.mockReset()
    mockFetch.mockReset()
  })

  const base = (extra: Partial<Parameters<typeof crearPedido>[3]> = {}): Parameters<typeof crearPedido>[3] => ({
    cliente: { nombre: 'Cliente Sede Test', telefono: '999111222' },
    tipoEntrega: 'tienda',
    fechaEntregaISO: fechaValida(),
    horario: '4pm',
    items: [{ tipo: 'producto', busqueda: 'carrot cake', tamano: 'Individual', cantidad: 1 }],
    metodoPago: 'yape',
    pagoPorAdelantado: false,
    ...extra,
  })

  // Cada caso corre dentro de una transacción que se deshace: no deja clientes ni pedidos.
  async function enTransaccion<T>(fn: () => Promise<T>): Promise<T> {
    await client.query('begin')
    try {
      return await fn()
    } finally {
      await client.query('rollback')
    }
  }

  const sedeDelPedido = async (numero: string) =>
    (await client.query(`select sede_id from orders where numero = $1`, [numero])).rows[0].sede_id as string | null
  const cuentaPedidosYClientes = async () =>
    (await client.query(`select (select count(*) from orders)::int as o, (select count(*) from customers)::int as c`)).rows[0]

  it('recojo sin local → SEDE_REQUERIDA con las opciones, y no crea cliente ni pedido', async () => {
    await enTransaccion(async () => {
      const antes = await cuentaPedidosYClientes()
      const r = await crearPedido(client, tenantId, 'whatsapp', base())
      expect(r.ok).toBe(false)
      if (r.ok) return
      expect(r.error).toBe('SEDE_REQUERIDA')
      expect((r.detalle as { sedesDisponibles: string[] }).sedesDisponibles).toEqual(
        expect.arrayContaining([SEDE_UNO, SEDE_DOS])
      )
      expect(await cuentaPedidosYClientes()).toEqual(antes)
    })
  })

  it('un local que no existe → SEDE_NO_VALIDA', async () => {
    await enTransaccion(async () => {
      const r = await crearPedido(client, tenantId, 'whatsapp', base({ sedeElegida: 'Miraflores' }))
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toBe('SEDE_NO_VALIDA')
    })
  })

  it('"delivery" como respuesta a un pedido de recojo no es un local válido', async () => {
    await enTransaccion(async () => {
      const r = await crearPedido(client, tenantId, 'whatsapp', base({ sedeElegida: 'delivery' }))
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toBe('SEDE_NO_VALIDA')
    })
  })

  it('reconoce el local sin importar mayúsculas ni "en el local de…" y asigna la sede al pedido', async () => {
    await enTransaccion(async () => {
      const r = await crearPedido(client, tenantId, 'whatsapp', base({ sedeElegida: 'en el local de OMEGA prueba' }))
      expect(r.ok).toBe(true)
      if (r.ok) expect(await sedeDelPedido(r.numero)).toBe(sedeDosId)
    })
  })

  it('una conversación que ya trae sede (número de un local) no pregunta nada y manda sobre lo que diga el modelo', async () => {
    await enTransaccion(async () => {
      const r = await crearPedido(client, tenantId, 'whatsapp', base({ sedeId: sedeUnoId, sedeElegida: SEDE_DOS }))
      expect(r.ok).toBe(true)
      if (r.ok) expect(await sedeDelPedido(r.numero)).toBe(sedeUnoId)
    })
  })

  it('delivery sin SEDE_DELIVERY configurada → el pedido se crea y queda sin sede', async () => {
    await enTransaccion(async () => {
      const previa = env.SEDE_DELIVERY
      env.SEDE_DELIVERY = undefined
      try {
        const r = await crearPedido(
          client,
          tenantId,
          'whatsapp',
          base({ tipoEntrega: 'delivery', direccion: 'Av. Prueba 123', distrito: 'Chorrillos' })
        )
        expect(r.ok).toBe(true)
        if (r.ok) expect(await sedeDelPedido(r.numero)).toBeNull()
      } finally {
        env.SEDE_DELIVERY = previa
      }
    })
  })

  it('delivery con SEDE_DELIVERY configurada → el pedido va a esa sede', async () => {
    await enTransaccion(async () => {
      const previa = env.SEDE_DELIVERY
      env.SEDE_DELIVERY = SEDE_UNO
      try {
        const r = await crearPedido(
          client,
          tenantId,
          'whatsapp',
          base({ tipoEntrega: 'delivery', direccion: 'Av. Prueba 123', distrito: 'Chorrillos' })
        )
        expect(r.ok).toBe(true)
        if (r.ok) expect(await sedeDelPedido(r.numero)).toBe(sedeUnoId)
      } finally {
        env.SEDE_DELIVERY = previa
      }
    })
  })

  it('el prompt del modelo trae el contexto de sede solo cuando la conversación no tiene sede', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Hola 😊' }] })

    await evaluarTurno(client, tenantId, [], 'hola', 'activa', 'whatsapp', undefined)
    const sinSede = mockCreate.mock.calls[0][0].system as string
    expect(sinSede).toContain('NO pertenece a un local')
    expect(sinSede).toContain(SEDE_UNO)
    expect(sinSede).toContain(SEDE_DOS)

    mockCreate.mockClear()
    await evaluarTurno(client, tenantId, [], 'hola', 'activa', 'whatsapp', sedeUnoId)
    const conSede = mockCreate.mock.calls[0][0].system as string
    expect(conSede).not.toContain('NO pertenece a un local')
  })
})

describe.skipIf(!hayBaseDeDatosReal)('número del bot — de punta a punta por POST /webhook', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let tenantId: string
  let sedeId: string
  const PHONE_ID_BOT = 'PHONE_ID_BOT_DE_PRUEBA'
  const TOKEN_BOT = 'token-de-usuario-del-sistema-de-prueba'
  const telefono = '999000900'

  const payload = (mensajeId: string, texto: string) => ({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_BOT_DE_PRUEBA',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '51999999000', phone_number_id: PHONE_ID_BOT },
              contacts: [{ profile: { name: 'Cliente Bot Test' }, wa_id: telefono }],
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
  })

  async function limpiar() {
    await client.query(`delete from orders where customer_id in (select id from customers where telefono = $1)`, [telefono])
    await client.query(`delete from customers where telefono = $1`, [telefono])
    await client.query(`delete from conversaciones where tenant_id = $1 and canal = 'whatsapp' and external_id = $2`, [
      tenantId,
      telefono,
    ])
    await client.query(`delete from mensajes_webhook_procesados where mensaje_id like 'wamid.TEST_BOT_%'`)
  }

  beforeAll(async () => {
    client = await pool.connect()
    tenantId = (await client.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
    await client.query(`delete from sedes where nombre = $1`, [SEDE_UNO])
    sedeId = (await client.query(`insert into sedes (nombre) values ($1) returning id`, [SEDE_UNO])).rows[0].id
    await client.query(`delete from whatsapp_conexiones where phone_number_id = $1`, [PHONE_ID_BOT])
    await registrarConexionWhatsApp(client, {
      sedeId: null,
      uso: 'bot',
      wabaId: 'WABA_BOT_DE_PRUEBA',
      phoneNumberId: PHONE_ID_BOT,
      tokenCifrado: cifrarTokenWhatsApp(TOKEN_BOT),
      tipoToken: 'sistema',
      origen: 'manual',
    })
    await limpiar()
  })

  afterAll(async () => {
    await limpiar()
    await client.query(`delete from whatsapp_conexiones where phone_number_id = $1`, [PHONE_ID_BOT])
    await client.query(`delete from sedes where id = $1`, [sedeId])
    client.release()
    await pool.end()
  })

  beforeEach(() => {
    mockFetch.mockResolvedValue({ ok: true, text: async () => '' } as unknown as Response)
  })

  afterEach(() => {
    mockCreate.mockReset()
    mockFetch.mockReset()
  })

  async function esperarHasta(cond: () => Promise<boolean>, intentos = 25) {
    for (let i = 0; i < intentos; i++) {
      if (await cond()) return
      await esperar(200)
    }
  }

  it('el bot pregunta el local, el cliente responde y el pedido nace con esa sede (la conversación sigue sin sede)', async () => {
    const fecha = fechaValida()
    const itemsPedido = [{ tipo: 'producto', busqueda: 'carrot cake', tamano: 'Individual', cantidad: 1 }]
    const pedidoBase = {
      clienteNombre: 'Cliente Bot Test',
      clienteTelefono: telefono,
      tipoEntrega: 'tienda',
      fechaEntregaISO: fecha,
      horario: '4pm',
      items: itemsPedido,
      metodoPago: 'yape',
      pagoPorAdelantado: false,
    }

    // Mensaje 1: el modelo intenta crear el pedido sin local → el servidor lo rechaza → el modelo pregunta.
    mockCreate
      .mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'toolu_1', name: 'crearPedido', input: pedidoBase }],
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: `¿En qué local recoges: ${SEDE_UNO} u otro? 😊` }],
      })

    const app = await buildApp()
    const res1 = await app.inject({
      method: 'POST',
      url: '/webhook',
      payload: payload('wamid.TEST_BOT_1', `Quiero un carrot cake individual para el ${fecha}, tel ${telefono}`),
    })
    expect(res1.statusCode).toBe(200)

    await esperarHasta(async () => mockFetch.mock.calls.length >= 1)

    const { rows: ordenesAntes } = await client.query(
      `select count(*)::int as n from orders where customer_id in (select id from customers where telefono = $1)`,
      [telefono]
    )
    // Sin local no hay pedido, y el servidor se lo dijo al modelo con las opciones reales.
    expect(ordenesAntes[0].n).toBe(0)
    const resultadoDeLaTool = JSON.stringify(mockCreate.mock.calls[1][0].messages)
    expect(resultadoDeLaTool).toContain('SEDE_REQUERIDA')
    expect(resultadoDeLaTool).toContain(SEDE_UNO)

    // Mensaje 2: el cliente responde el local → el modelo vuelve a crear el pedido con sedeRecojo.
    mockFetch.mockClear()
    mockCreate.mockReset()
    mockCreate
      .mockResolvedValueOnce({
        content: [
          { type: 'tool_use', id: 'toolu_2', name: 'crearPedido', input: { ...pedidoBase, sedeRecojo: `Local ${SEDE_UNO}` } },
        ],
      })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '¡Listo! Tu pedido quedó registrado 😊' }] })

    const res2 = await app.inject({
      method: 'POST',
      url: '/webhook',
      payload: payload('wamid.TEST_BOT_2', `En el local ${SEDE_UNO}`),
    })
    expect(res2.statusCode).toBe(200)

    await esperarHasta(async () => {
      const { rows } = await client.query(
        `select count(*)::int as n from orders where customer_id in (select id from customers where telefono = $1)`,
        [telefono]
      )
      return rows[0].n > 0 && mockFetch.mock.calls.length >= 1
    })

    const { rows: pedidos } = await client.query(
      `select o.sede_id from orders o join customers c on c.id = o.customer_id where c.telefono = $1`,
      [telefono]
    )
    expect(pedidos).toHaveLength(1)
    expect(pedidos[0].sede_id).toBe(sedeId)

    // La conversación NO se asigna a ninguna sede (es del número del bot) y recuerda por qué número habla.
    const { rows: conv } = await client.query(
      `select sede_id, whatsapp_phone_number_id from conversaciones where tenant_id = $1 and canal = 'whatsapp' and external_id = $2`,
      [tenantId, telefono]
    )
    expect(conv[0].sede_id).toBeNull()
    expect(conv[0].whatsapp_phone_number_id).toBe(PHONE_ID_BOT)

    // La respuesta salió por el número del bot, con el token del usuario del sistema.
    const [url, opciones] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`https://graph.facebook.com/v21.0/${PHONE_ID_BOT}/messages`)
    expect((opciones.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN_BOT}`)
  }, 20_000)

  it('responder desde el panel una conversación sin sede sale por el número por el que escribió el cliente', async () => {
    await client.query(
      `insert into conversaciones (tenant_id, canal, external_id, estado, historial, sede_id, whatsapp_phone_number_id)
       values ($1, 'whatsapp', $2, 'escalada', '[]'::jsonb, null, $3)
       on conflict (tenant_id, canal, external_id) do update set estado = 'escalada', sede_id = null, whatsapp_phone_number_id = $3`,
      [tenantId, telefono, PHONE_ID_BOT]
    )
    const { rows } = await client.query(
      `select id from conversaciones where tenant_id = $1 and canal = 'whatsapp' and external_id = $2`,
      [tenantId, telefono]
    )

    // Un operador de cualquier sede puede atenderla (no tiene dueño).
    const operador = { userId: '00000000-0000-0000-0000-000000000001', rol: 'operador', sedeId: sedeId } as never
    const r = await responderConversacion(client, tenantId, operador, rows[0].id, 'Hola, te escribimos del local 😊')
    expect(r).toEqual({ ok: true })

    const [url, opciones] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`https://graph.facebook.com/v21.0/${PHONE_ID_BOT}/messages`)
    expect((opciones.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN_BOT}`)
    const { rows: despues } = await client.query(`select estado from conversaciones where id = $1`, [rows[0].id])
    expect(despues[0].estado).toBe('atendida_por_operador')
  })
})

describe('POST /webhook — la firma de Meta es obligatoria en producción', () => {
  const cuerpo = JSON.stringify({ object: 'whatsapp_business_account', entry: [] })
  const cabeceras = { 'content-type': 'application/json' }

  afterEach(() => {
    delete process.env.META_APP_SECRET
    env.NODE_ENV = 'test'
  })

  it('sin META_APP_SECRET en producción → 503 y no atiende nada', async () => {
    delete process.env.META_APP_SECRET
    env.NODE_ENV = 'production'
    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/webhook', headers: cabeceras, payload: cuerpo })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toEqual({ error: 'FIRMA_NO_CONFIGURADA' })
  })

  it('con META_APP_SECRET en producción: firma mala → 401, firma buena → 200', async () => {
    process.env.META_APP_SECRET = 'secreto-de-prueba'
    env.NODE_ENV = 'production'
    const app = await buildApp()

    const mala = await app.inject({
      method: 'POST',
      url: '/webhook',
      headers: { ...cabeceras, 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) },
      payload: cuerpo,
    })
    expect(mala.statusCode).toBe(401)

    const firma = 'sha256=' + createHmac('sha256', 'secreto-de-prueba').update(cuerpo).digest('hex')
    const buena = await app.inject({
      method: 'POST',
      url: '/webhook',
      headers: { ...cabeceras, 'x-hub-signature-256': firma },
      payload: cuerpo,
    })
    expect(buena.statusCode).toBe(200)
  })

  it('fuera de producción sin secreto sigue aceptando (desarrollo y tests)', async () => {
    delete process.env.META_APP_SECRET
    env.NODE_ENV = 'test'
    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/webhook', headers: cabeceras, payload: cuerpo })
    expect(res.statusCode).toBe(200)
  })
})

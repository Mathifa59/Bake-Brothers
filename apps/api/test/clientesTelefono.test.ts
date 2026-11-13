// Etapa 4 (clientes): el teléfono se guarda en E.164 y es único; quien escribe por WhatsApp queda enlazado a su cliente.
//   - findOrCreateCustomer: «912944096», «51 912 944 096» y «+51912944096» son el mismo cliente (índice único de 0045);
//     un teléfono que no se entiende se rechaza, nunca se inventa; dos pedidos a la vez no duplican.
//   - Webhook de WhatsApp: la conversación se enlaza al cliente existente por teléfono; si no existe, se crea con el
//     nombre del perfil de WhatsApp (o el número) sin confirmar; un pedido posterior le pone su nombre real.
//   - POST /api/orders y crearPedido (bot) rechazan un teléfono inválido.
// Sin Claude real (SDK mockeado, no se usa con el bot apagado) y sin Meta real (fetch mockeado). Necesita Postgres con
// el esquema hasta la 0045; sin eso se salta.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal = !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

process.env.ANTHROPIC_API_KEY ||= 'dummy-para-test-mockeado-nunca-sale-un-request-real'
const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({ messages: { create: mockCreate } })),
}))
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)
const mockConfig = vi.fn()
vi.mock('../src/repositories/configuracionBotRepo.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/repositories/configuracionBotRepo.js')>()),
  leerConfiguracionBot: (...args: unknown[]) => mockConfig(...args),
}))

const { buildApp } = await import('../src/app.js')
const { sembrarConexion, quitarConexion } = await import('./conexionDePrueba.js')
const { findOrCreateCustomer, TelefonoInvalidoError } = await import('../src/repositories/ordersRepo.js')
const { parsearMensajesWhatsApp } = await import('../src/bot/parsearMensajesWhatsApp.js')
const { crearPedido } = await import('../src/services/crearPedido.js')

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('parser de WhatsApp: nombre del perfil', () => {
  const payload = (contacts: unknown) => ({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: 'PID' },
              ...(contacts ? { contacts } : {}),
              messages: [{ from: '51999400001', id: 'wamid.X1', type: 'text', text: { body: 'Hola' } }],
            },
          },
        ],
      },
    ],
  })
  it('toma el nombre de contacts[].profile.name por wa_id', () => {
    const [m] = parsearMensajesWhatsApp(payload([{ wa_id: '51999400001', profile: { name: '  Ana Torres ' } }]))
    expect(m.nombrePerfil).toBe('Ana Torres')
  })
  it('sin contacts, o con otro wa_id, no inventa un nombre', () => {
    expect(parsearMensajesWhatsApp(payload(undefined))[0].nombrePerfil).toBeUndefined()
    expect(parsearMensajesWhatsApp(payload([{ wa_id: '51888888888', profile: { name: 'Otra' } }]))[0].nombrePerfil).toBeUndefined()
  })
})

describe.skipIf(!hayBaseDeDatosReal)('clientes: teléfono E.164 único y enlace con la conversación', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let tenantId: string
  let sedeId: string
  let app: Awaited<ReturnType<typeof buildApp>>
  const PHONE_ID = 'PHONE_ID_CLIENTES'
  // 99940xxxx: solo para este archivo. Se borran al empezar y al terminar.
  const MIOS = `like '+5199940%'`

  const limpiar = async () => {
    await client.query(`delete from mensajes_webhook_procesados where mensaje_id like 'wamid.CLIENTES_%'`)
    await client.query(`delete from conversaciones where external_id like '5199940%'`)
    await client.query(`delete from customers where telefono ${MIOS}`)
  }
  const clientes = async (sufijo: string) =>
    (await client.query(`select id, nombre, telefono, nombre_confirmado from customers where tenant_id = $1 and telefono = $2`, [tenantId, `+5199940${sufijo}`])).rows
  const conversacion = async (waId: string) =>
    (await client.query(`select id, customer_id from conversaciones where tenant_id = $1 and canal = 'whatsapp' and external_id = $2`, [tenantId, waId])).rows[0]

  const texto = (id: string, tel: string, body: string, nombre?: string) => ({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_DE_PRUEBA',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '51999999999', phone_number_id: PHONE_ID },
              ...(nombre ? { contacts: [{ profile: { name: nombre }, wa_id: tel }] } : {}),
              messages: [{ from: tel, id, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body } }],
            },
          },
        ],
      },
    ],
  })
  const enviar = async (cuerpo: unknown) => {
    const r = await app.inject({ method: 'POST', url: '/webhook', payload: cuerpo as object })
    expect(r.statusCode).toBe(200)
    await esperar(700) // el procesamiento corre en segundo plano, después del 200
  }

  beforeAll(async () => {
    client = await pool.connect()
    tenantId = (await client.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
    sedeId = (await client.query(`insert into sedes (nombre) values ('TEST clientes') returning id`)).rows[0].id
    await sembrarConexion(client, { sedeId, phoneNumberId: PHONE_ID })
    app = await buildApp()
    await limpiar()
  })
  afterAll(async () => {
    await app.close()
    await limpiar()
    await quitarConexion(client, { sedeId, phoneNumberId: PHONE_ID })
    await client.query(`delete from sedes where id = $1`, [sedeId])
    client.release()
    await pool.end()
  })
  beforeEach(async () => {
    mockConfig.mockResolvedValue({ botActivo: false, bienvenidaActiva: false, mensajeBienvenida: '' })
    mockFetch.mockResolvedValue({ ok: true, text: async () => '', json: async () => ({ messages: [{ id: 'wamid.SALIDA' }] }) } as unknown as Response)
    await limpiar()
  })
  afterEach(() => {
    mockCreate.mockReset()
    mockFetch.mockReset()
    mockConfig.mockReset()
  })

  // ——— findOrCreateCustomer
  it('las distintas formas de escribir el mismo celular son UN solo cliente, guardado en E.164', async () => {
    const formas = ['99940 0101', '+51 999 400 101', '51999400101', '0051-999-400-101', '999400101']
    const ids = new Set<string>()
    for (const t of formas) ids.add(await findOrCreateCustomer(client, tenantId, { nombre: 'Ana Torres', telefono: t }))
    expect(ids.size).toBe(1)
    const filas = await clientes('0101')
    expect(filas).toHaveLength(1)
    expect(filas[0].telefono).toBe('+51999400101')
  })

  it('un teléfono que no se entiende se rechaza: ni cliente ni pedido con un número inventado', async () => {
    for (const malo of ['abc', '12345', '812944096', '']) {
      await expect(findOrCreateCustomer(client, tenantId, { nombre: 'Ana', telefono: malo })).rejects.toBeInstanceOf(TelefonoInvalidoError)
    }
  })

  it('dos pedidos del mismo cliente a la vez no lo duplican (índice único + on conflict)', async () => {
    const [a, b] = await Promise.all([pool.connect(), pool.connect()])
    try {
      const [x, y] = await Promise.all([
        findOrCreateCustomer(a, tenantId, { nombre: 'Luis Rojas', telefono: '999400102' }),
        findOrCreateCustomer(b, tenantId, { nombre: 'Luis Rojas', telefono: '+51 999 400 102' }),
      ])
      expect(x).toBe(y)
      expect(await clientes('0102')).toHaveLength(1)
    } finally {
      a.release()
      b.release()
    }
  })

  it('la base impide un teléfono duplicado o fuera de E.164, aunque alguien lo intente a mano', async () => {
    await client.query(`insert into customers (tenant_id, nombre, telefono) values ($1, 'A', '+51999400103')`, [tenantId])
    await expect(client.query(`insert into customers (tenant_id, nombre, telefono) values ($1, 'B', '+51999400103')`, [tenantId])).rejects.toThrow(/customers_tenant_telefono_unico/)
    await expect(client.query(`insert into customers (tenant_id, nombre, telefono) values ($1, 'C', '999400104')`, [tenantId])).rejects.toThrow(/customers_telefono_e164/)
  })

  it('varios clientes sin teléfono (mayoristas importados) conviven: el índice único solo cuenta los que tienen', async () => {
    await client.query(`insert into customers (tenant_id, nombre, es_mayorista) values ($1, 'TEST MAYORISTA 1', true), ($1, 'TEST MAYORISTA 2', true)`, [tenantId])
    try {
      const { rows } = await client.query(`select count(*)::int n from customers where nombre like 'TEST MAYORISTA %' and telefono is null`)
      expect(rows[0].n).toBe(2)
    } finally {
      await client.query(`delete from customers where nombre like 'TEST MAYORISTA %'`)
    }
  })

  // ——— Webhook de WhatsApp
  it('escribe alguien nuevo: se crea el cliente con el nombre de su perfil, sin confirmar, y la conversación queda enlazada', async () => {
    await enviar(texto('wamid.CLIENTES_1', '51999400201', 'Hola, quiero una torta', 'Rosa Vega'))
    const filas = await clientes('0201')
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ nombre: 'Rosa Vega', nombre_confirmado: false })
    const c = await conversacion('51999400201')
    expect(c.customer_id).toBe(filas[0].id)
  })

  it('sin nombre de perfil, el cliente nuevo se llama por su número legible', async () => {
    await enviar(texto('wamid.CLIENTES_2', '51999400202', 'Buenas'))
    const filas = await clientes('0202')
    expect(filas[0].nombre).toBe('+51 999 400 202')
    expect(filas[0].nombre_confirmado).toBe(false)
  })

  it('escribe alguien que YA es cliente (guardado como lo escribió un operador): se enlaza al existente, sin duplicar ni cambiarle el nombre', async () => {
    const existente = await findOrCreateCustomer(client, tenantId, { nombre: 'Ana Torres', telefono: '999 400 203' })
    await enviar(texto('wamid.CLIENTES_3', '51999400203', 'Hola de nuevo', 'AnitaTorres_92'))
    const filas = await clientes('0203')
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ id: existente, nombre: 'Ana Torres', nombre_confirmado: true })
    expect((await conversacion('51999400203')).customer_id).toBe(existente)
  })

  it('mensajes siguientes no crean otro cliente ni cambian el enlace', async () => {
    await enviar(texto('wamid.CLIENTES_4A', '51999400204', 'Hola', 'Pedro Díaz'))
    await enviar(texto('wamid.CLIENTES_4B', '51999400204', '¿Atienden hoy?', 'Pedro Díaz'))
    expect(await clientes('0204')).toHaveLength(1)
  })

  it('un pedido posterior le pone su nombre real al cliente creado desde WhatsApp (y queda confirmado)', async () => {
    await enviar(texto('wamid.CLIENTES_5', '51999400205', 'Hola', 'Pedro_D'))
    const antes = (await clientes('0205'))[0]
    expect(antes).toMatchObject({ nombre: 'Pedro_D', nombre_confirmado: false })
    const id = await findOrCreateCustomer(client, tenantId, { nombre: 'Pedro Díaz Ríos', telefono: '+51999400205' })
    expect(id).toBe(antes.id)
    expect((await clientes('0205'))[0]).toMatchObject({ nombre: 'Pedro Díaz Ríos', nombre_confirmado: true })
    // y el pedido siguiente con otro nombre NO lo pisa (ya está confirmado)
    await findOrCreateCustomer(client, tenantId, { nombre: 'Otro Nombre', telefono: '999400205' })
    expect((await clientes('0205'))[0].nombre).toBe('Pedro Díaz Ríos')
  })

  // ——— Rechazo de teléfonos inválidos en las dos entradas de pedidos
  it('POST /api/orders rechaza un teléfono inválido con 400 y un mensaje claro', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        cliente: { nombre: 'Ana', telefono: '812944096' },
        tipoEntrega: 'tienda',
        fechaEntrega: '2026-12-01',
        items: [{ productoId: 'carrot-cake', cantidad: 1 }],
      },
    })
    expect(r.statusCode).toBe(400)
    expect(JSON.stringify(r.json())).toMatch(/Teléfono no válido/)
  })

  it('crearPedido (bot) devuelve TELEFONO_INVALIDO antes de tocar nada, para que el modelo lo vuelva a pedir', async () => {
    const antes = (await client.query(`select count(*)::int n from customers where telefono ${MIOS}`)).rows[0].n
    const r = await crearPedido(client, tenantId, 'whatsapp', {
      cliente: { nombre: 'Ana', telefono: '12345' },
      tipoEntrega: 'tienda',
      fechaEntregaISO: '2099-01-01',
      items: [{ tipo: 'producto', busqueda: 'carrot cake', cantidad: 1 }],
      metodoPago: 'contraentrega',
    } as never)
    expect(r).toMatchObject({ ok: false, error: 'TELEFONO_INVALIDO' })
    expect((await client.query(`select count(*)::int n from customers where telefono ${MIOS}`)).rows[0].n).toBe(antes)
  })
})

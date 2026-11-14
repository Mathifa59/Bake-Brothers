// Reglas que el cliente pidió el 2026-11-13: mayoristas (el bot no les cotiza ni toma pedidos), tarjeta (lo hace una persona),
// delivery sin montos y la lista de «lo que el bot NUNCA hace». SIN Claude real: SDK mockeado. Lo que se prueba es lo que el
// SERVIDOR le dice al modelo y lo que hace cumplir. Necesita Postgres con el esquema hasta la 0047.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal = !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER
process.env.ANTHROPIC_API_KEY ||= 'dummy-para-test-mockeado-nunca-sale-un-request-real'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({ messages: { create: mockCreate } })),
}))

const { evaluarTurno, textoContextoCliente } = await import('../src/bot/cerebro.js')
const { linkWhatsAppMayoristas } = await import('../src/mayoristas.js')

const LINK = 'https://wa.me/51986639228'
const mediodia = new Date('2026-11-13T12:00:00-05:00')
const sistema = (n = 0) => String(mockCreate.mock.calls[n][0].system)
const texto = (t: string) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn' })

describe('mayoristas: el link de atención directa', () => {
  it('por defecto es el WhatsApp real (+51 986 639 228) con link wa.me', () => {
    expect(linkWhatsAppMayoristas()).toBe(LINK)
  })

  it('el bloque de contexto del cliente mayorista le dice al modelo que no cotice ni tome pedido', () => {
    const t = textoContextoCliente({ customerId: 'c', nombre: 'Café Lima', nombreConfirmado: true, aceptaMarketing: false, esMayorista: true })
    expect(t).toContain('MAYORISTA: este cliente es mayorista registrado')
    expect(t).toContain(LINK)
    expect(textoContextoCliente({ customerId: 'c', nombre: 'Ana', nombreConfirmado: true, aceptaMarketing: false, esMayorista: false })).not.toContain('MAYORISTA')
  })
})

describe.skipIf(!hayBaseDeDatosReal)('el prompt y el servidor con las reglas del cliente', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let tenantId: string
  const telefonos = ['+51999000471', '+51999000472']

  beforeAll(async () => {
    client = await pool.connect()
    tenantId = (await client.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
  })
  afterAll(async () => {
    await client.query(`delete from conversaciones where external_id = any($1)`, [telefonos.map((t) => t.slice(3))])
    await client.query(`delete from customers where telefono = any($1)`, [telefonos])
    client.release()
    await pool.end()
  })
  beforeEach(() => mockCreate.mockReset())

  async function conversacionDe(telefono: string, nombre: string, esMayorista: boolean) {
    await client.query(`delete from conversaciones where external_id = $1`, [telefono.slice(3)])
    await client.query(`delete from customers where telefono = $1`, [telefono])
    const c = await client.query(
      `insert into customers (tenant_id, nombre, telefono, nombre_confirmado, es_mayorista) values ($1, $2, $3, true, $4) returning id`,
      [tenantId, nombre, telefono, esMayorista]
    )
    const cv = await client.query(
      `insert into conversaciones (tenant_id, canal, external_id, estado, customer_id) values ($1, 'whatsapp', $2, 'activa', $3) returning id`,
      [tenantId, telefono.slice(3), c.rows[0].id]
    )
    return { conversacionId: cv.rows[0].id as string, customerId: c.rows[0].id as string }
  }
  const turno = (conversacionId: string | undefined, mensaje: string) =>
    evaluarTurno(client, tenantId, [], mensaje, 'activa', 'whatsapp', undefined, { ahora: mediodia, conversacionId })

  it('el prompt trae la regla de mayoristas con el link y la lista completa de lo que el bot NUNCA hace', async () => {
    mockCreate.mockResolvedValue(texto('Hola'))
    await turno(undefined, 'hola')
    const s = sistema()
    expect(s).toContain(`12. Mayoristas`)
    expect(s).toContain(LINK)
    expect(s).toContain('MAYORISTA_ATENCION_DIRECTA')
    // 13. Los nueve límites del cliente.
    expect(s).toContain('13. Lo que NUNCA haces')
    for (const frase of [
      /No prometas disponibilidad inmediata de stock/,
      /No des tiempos exactos de entrega ni de recojo/,
      /No confirmes reservas por tu cuenta/,
      /No presentes un precio como permanente/,
      /No ofrezcas descuentos, promociones ni cortesías que no estén aprobados/,
      /No aceptes ni prometas devoluciones ni reembolsos/,
      /No confirmes pedidos personalizados/,
      /No afirmes como absoluta la información de alérgenos o de seguridad alimentaria/,
      /nunca respondas de forma agresiva, irónica ni sin empatía/,
      /Siempre claro y amable, y deja dicho cuando algo depende de la validación del equipo de Bake Brothers/,
    ]) {
      expect(s).toMatch(frase)
    }
  })

  it('tarjeta y delivery: el bot no genera link ni da montos de envío', async () => {
    mockCreate.mockResolvedValue(texto('Hola'))
    await turno(undefined, 'hola')
    const s = sistema()
    expect(s).toMatch(/TARJETA: tú NUNCA generas ni ofreces un link de pago/)
    expect(s).toMatch(/una persona del equipo le envía el link de pago/)
    expect(s).toMatch(/El envío se cotiza al momento y una persona del equipo confirma el costo/)
    expect(s).toMatch(/NUNCA das un monto/)
  })

  it('una conversación de un mayorista recibe el bloque MAYORISTA; la de un cliente común, no', async () => {
    const may = await conversacionDe('+51999000471', 'Café Prueba', true)
    mockCreate.mockResolvedValue(texto('Para mayoristas escríbenos directo'))
    await turno(may.conversacionId, 'Quiero 200 empanadas para mi negocio')
    expect(sistema()).toContain('MAYORISTA: este cliente es mayorista registrado')

    const comun = await conversacionDe('+51999000472', 'Ana Prueba', false)
    mockCreate.mockReset()
    mockCreate.mockResolvedValue(texto('Hola Ana'))
    await turno(comun.conversacionId, 'Hola')
    expect(sistema()).not.toContain('MAYORISTA: este cliente es mayorista registrado')
  })

  it('aunque el modelo intente tomar el pedido de un mayorista, el SERVIDOR lo rechaza: no se crea nada y el modelo recibe el link', async () => {
    const may = await conversacionDe('+51999000471', 'Café Prueba', true)
    mockCreate
      .mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            id: 't-pedido-mayorista',
            name: 'crearPedido',
            input: {
              clienteNombre: 'Café Prueba',
              clienteTelefono: '999000471',
              tipoEntrega: 'tienda',
              sedeRecojo: 'Cedros',
              fechaEntregaISO: '2026-11-20',
              horario: '8am',
              items: [{ tipo: 'producto', busqueda: 'empanada de pollo', cantidad: 100 }],
              metodoPago: 'yape',
              pagoPorAdelantado: false,
            },
          },
        ],
        stop_reason: 'tool_use',
      })
      .mockResolvedValueOnce(texto(`La atención de mayoristas es directa: ${LINK}`))
    const antes = (await client.query(`select count(*)::int n from orders`)).rows[0].n
    const r = await turno(may.conversacionId, 'Quiero 100 empanadas de pollo')
    expect(r.pedidosCreados ?? []).toHaveLength(0)
    expect((await client.query(`select count(*)::int n from orders`)).rows[0].n).toBe(antes)
    const resultadoTool = String(mockCreate.mock.calls[1][0].messages.at(-1).content[0].content)
    expect(resultadoTool).toContain('MAYORISTA_ATENCION_DIRECTA')
    expect(resultadoTool).toContain(LINK)
    expect(r.textoRespuesta).toContain(LINK)
  })
})

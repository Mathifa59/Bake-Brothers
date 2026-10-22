// Simulador del bot (POST /api/dashboard/simulador/mensaje): solo admin, el
// cerebro real corre turno a turno, NO envía nada por WhatsApp, no toca la
// tabla `conversaciones`, y los pedidos que crea van marcados como prueba.
//
// Lo que se mockea: (1) el SDK de Anthropic — para controlar qué "dice" el
// modelo en cada vuelta sin gastar tokens ni depender de una key real — y
// (2) la verificación del JWT (verificarJwtOperador), que necesita el JWKS
// real de Supabase por red; su propio comportamiento ya lo prueban
// dashboardOrders/dashboardConversaciones con JWT reales. Todo lo demás corre
// real: la ruta, el rol admin, las tools del cerebro, crearPedido y la base.
//
// Necesita Postgres con el esquema (DATABASE_URL real); sin eso se salta.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

const KEY_ORIGINAL = process.env.ANTHROPIC_API_KEY
process.env.ANTHROPIC_API_KEY = 'dummy-para-test-mockeado-nunca-sale-un-request-real'

const mockCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}))

// El rol sale de un header de prueba (nunca del navegador real): sin header =
// sin sesión (401), igual que el middleware verdadero sin token.
vi.mock('../src/auth/verificarJwtOperador.js', async (importOriginal) => ({
  // Se conserva el resto del módulo (p. ej. `exigirAdmin`, que usan otras rutas de la app) y solo se
  // reemplaza la verificación del JWT.
  ...(await importOriginal<typeof import('../src/auth/verificarJwtOperador.js')>()),
  verificarJwtOperador: async (
    req: { headers: Record<string, string | undefined>; operador?: unknown },
    reply: { code: (n: number) => { send: (b: unknown) => unknown } }
  ) => {
    const rol = req.headers['x-test-rol']
    if (!rol) return reply.code(401).send({ error: 'NO_AUTORIZADO' })
    req.operador = { id: 'admin-de-prueba', rol, sedeId: null }
  },
}))

const { buildApp } = await import('../src/app.js')
const { MARCA_PRUEBA } = await import('../src/services/crearPedido.js')

const TEL_PRUEBA = '999000777'

describe.skipIf(!hayBaseDeDatosReal)('POST /api/dashboard/simulador/mensaje', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let app: Awaited<ReturnType<typeof buildApp>>
  let sedeId: string
  let fetchSpy: ReturnType<typeof vi.spyOn>

  const limpiar = async () => {
    await pool.query(`delete from order_items where order_id in (select o.id from orders o join customers c on c.id = o.customer_id where c.telefono = $1)`, [TEL_PRUEBA])
    await pool.query(`delete from orders where customer_id in (select id from customers where telefono = $1)`, [TEL_PRUEBA])
    await pool.query(`delete from customers where telefono = $1`, [TEL_PRUEBA])
  }

  const enviar = (body: unknown, rol: string | null = 'admin') =>
    app.inject({
      method: 'POST',
      url: '/api/dashboard/simulador/mensaje',
      headers: rol ? { 'x-test-rol': rol } : {},
      payload: body as Record<string, unknown>,
    })

  beforeEach(async () => {
    mockCreate.mockReset()
    process.env.ANTHROPIC_API_KEY = 'dummy-para-test-mockeado-nunca-sale-un-request-real'
    app = await buildApp()
    const { rows } = await pool.query(`select id from sedes where nombre = 'Cedros'`)
    sedeId = rows[0].id
    await limpiar()
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(async () => {
    fetchSpy.mockRestore()
    await limpiar()
  })

  afterAll(async () => {
    if (KEY_ORIGINAL === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = KEY_ORIGINAL
    await pool.end()
  })

  it('sin sesión → 401, y nunca llama al modelo', async () => {
    const res = await enviar({ mensaje: 'hola', sedeId }, null)
    expect(res.statusCode).toBe(401)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('un operador (no admin) → 403 SOLO_ADMIN, y nunca llama al modelo', async () => {
    const res = await enviar({ mensaje: 'hola', sedeId }, 'operador')
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('SOLO_ADMIN')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('valida el cuerpo: mensaje vacío o sede que no es uuid → 400', async () => {
    expect((await enviar({ mensaje: '   ', sedeId })).statusCode).toBe(400)
    expect((await enviar({ mensaje: 'hola', sedeId: 'no-es-uuid' })).statusCode).toBe(400)
  })

  it('sede inexistente → 404 SEDE_NO_ENCONTRADA', async () => {
    const res = await enviar({ mensaje: 'hola', sedeId: '00000000-0000-4000-8000-000000000000' })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('SEDE_NO_ENCONTRADA')
  })

  it('sin ANTHROPIC_API_KEY en el servidor → 503 con mensaje claro, no un 500', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const res = await enviar({ mensaje: 'hola', sedeId })
    expect(res.statusCode).toBe(503)
    expect(res.json().error).toBe('SIMULADOR_NO_CONFIGURADO')
  })

  it('un fallo del modelo (clave inválida, sobrecarga) → 502 MODELO_NO_DISPONIBLE', async () => {
    mockCreate.mockRejectedValueOnce(new Error('401 invalid x-api-key'))
    const res = await enviar({ mensaje: 'hola', sedeId })
    expect(res.statusCode).toBe(502)
    expect(res.json().error).toBe('MODELO_NO_DISPONIBLE')
  })

  it('admin: el cerebro real consulta el precio real del catálogo, responde y devuelve el historial; no manda nada por WhatsApp ni toca conversaciones', async () => {
    const { rows: antes } = await pool.query(`select count(*)::int as n from conversaciones`)

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'toolu_p1', name: 'consultarPrecio', input: { busqueda: 'alfajor mix' } }],
    })
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'El Alfajor Mix: Caja x10 S/ 12.90 y Caja x18 S/ 22.90 😊' }],
    })

    const res = await enviar({ mensaje: 'quiero 1 caja de alfajores mix para recoger hoy', sedeId })
    expect(res.statusCode).toBe(200)
    const cuerpo = res.json()
    expect(cuerpo.respuesta).toMatch(/12\.90/)
    expect(cuerpo.botSilenciado).toBe(false)
    expect(cuerpo.estado).toBe('activa')
    expect(cuerpo.herramientasUsadas).toEqual(['consultarPrecio'])
    expect(cuerpo.pedidosCreados).toEqual([])
    expect(cuerpo.historial.map((h: { rol: string }) => h.rol)).toEqual(['cliente', 'bot'])

    // El resultado de la tool que recibió el modelo es el precio REAL de la base, no algo de memoria.
    const segundaLlamada = mockCreate.mock.calls[1][0]
    const resultadoTool = segundaLlamada.messages.at(-1).content[0].content as string
    expect(resultadoTool).toMatch(/12\.9/)
    expect(resultadoTool).toMatch(/22\.9/)

    // El modelo recibe la fecha/hora de Lima para entender "hoy".
    expect(mockCreate.mock.calls[0][0].system).toMatch(/FECHA Y HORA ACTUALES/)

    // No envía nada por WhatsApp ni a ningún servicio externo.
    expect(fetchSpy).not.toHaveBeenCalled()
    // Y no deja ninguna conversación en la bandeja real.
    const { rows: despues } = await pool.query(`select count(*)::int as n from conversaciones`)
    expect(despues[0].n).toBe(antes[0].n)
  })

  it('admin: un pedido que cree el bot es real pero va marcado como prueba, queda en la sede elegida y se reporta en la respuesta', async () => {
    const mañana = (() => {
      const d = new Date(Date.now() + 36 * 3600_000)
      return d.toISOString().slice(0, 10)
    })()
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'toolu_ped',
          name: 'crearPedido',
          input: {
            clienteNombre: 'Ana Demo',
            clienteTelefono: TEL_PRUEBA,
            tipoEntrega: 'tienda',
            fechaEntregaISO: mañana,
            horario: '4pm',
            items: [{ tipo: 'producto', busqueda: 'alfajor mix', tamano: 'Caja x10', cantidad: 1 }],
            metodoPago: 'yape',
            pagoPorAdelantado: false,
          },
        },
      ],
    })
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '¡Listo Ana! Tu pedido quedó registrado 🎉' }],
    })

    const res = await enviar({ mensaje: 'sí, confírmalo', sedeId })
    expect(res.statusCode).toBe(200)
    const cuerpo = res.json()
    expect(cuerpo.pedidosCreados).toHaveLength(1)
    const { numero, estado, total } = cuerpo.pedidosCreados[0]
    expect(estado).toBe('confirmed')
    expect(total).toBe(12.9)

    const { rows } = await pool.query(
      `select o.estado, o.sede_id, o.nota, o.canal, c.nombre, (select count(*)::int from order_items i where i.order_id = o.id) as lineas
       from orders o join customers c on c.id = o.customer_id where o.numero = $1`,
      [numero]
    )
    expect(rows[0].sede_id).toBe(sedeId)
    expect(rows[0].nota.startsWith(MARCA_PRUEBA)).toBe(true)
    expect(rows[0].nombre).toBe(`${MARCA_PRUEBA} Ana Demo`)
    expect(rows[0].lineas).toBe(1)
    expect(rows[0].canal).toBe('whatsapp')
  })

  it('el cerebro expone listarCatalogo y le devuelve al modelo las opciones reales ("quiero alfajores")', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'toolu_l1', name: 'listarCatalogo', input: { busqueda: 'alfajores' } }],
    })
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Tenemos Alfajor Mix, con Manjar, Nutella, Pistacho y Lúcuma 😊 ¿Cuál te gusta?' }],
    })

    const res = await enviar({ mensaje: 'quiero alfajores', sedeId })
    expect(res.statusCode).toBe(200)
    expect(res.json().herramientasUsadas).toEqual(['listarCatalogo'])

    // La tool está declarada para el modelo, la regla 7 está en el prompt, y el modelo recibió la lista real.
    const primera = mockCreate.mock.calls[0][0]
    expect(primera.tools.map((t: { name: string }) => t.name)).toContain('listarCatalogo')
    expect(primera.system).toMatch(/listarCatalogo/)
    const resultado = mockCreate.mock.calls[1][0].messages.at(-1).content[0].content as string
    for (const nombre of ['Alfajor Mix', 'Alfajor con Manjar', 'Alfajor con Nutella']) expect(resultado).toContain(nombre)
  })

  it('una conversación ya escalada no vuelve a pasar por el bot (igual que en producción)', async () => {
    const historial = [
      { rol: 'cliente', texto: 'quiero un reembolso', en: '2026-10-13T10:00:00.000Z' },
      { rol: 'bot', texto: 'Te conecto con el equipo', en: '2026-10-13T10:00:05.000Z' },
    ]
    const res = await enviar({ mensaje: '¿hola? ¿alguien?', sedeId, estado: 'escalada', historial })
    expect(res.statusCode).toBe(200)
    const cuerpo = res.json()
    expect(cuerpo.botSilenciado).toBe(true)
    expect(cuerpo.respuesta).toBeNull()
    expect(cuerpo.estado).toBe('escalada')
    expect(cuerpo.historial).toHaveLength(3)
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

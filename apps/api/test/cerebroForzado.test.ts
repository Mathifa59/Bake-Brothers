// Prueba las dos garantías de cerebro.ts que NO deben depender de que el
// modelo se comporte de cierta forma:
//   1. decidirEscaladaForzadaPorTool — función pura, sin I/O, siempre corre.
//   2. El loop de evaluarTurno realmente aplica esa decisión aunque el
//      modelo NUNCA llame a escalarAHumano — se mockea el SDK de Anthropic
//      (no la lógica de negocio) para controlar exactamente qué "dice" el
//      modelo en cada vuelta, sin depender del comportamiento real del LLM.
//      El tool evaluarSemaforoCateringPedido sí corre real contra la DB —
//      solo el modelo está mockeado.
//   3. El límite duro de vueltas del loop de tool-use — se mockea el modelo
//      para que SIEMPRE pida una tool (nunca da una respuesta final), y se
//      confirma que el loop corta en MAX_VUELTAS_TOOL_USE, no antes ni
//      loopea indefinido.
//
// (1) corre siempre. (2) y (3) necesitan Postgres real (para el tool real de
// consultarPrecio/evaluarSemaforoCateringPedido) pero NO necesitan
// ANTHROPIC_API_KEY real — el SDK está mockeado, nunca sale un request real.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

// obtenerApiKey() de cerebro.ts exige que la variable exista — no hace falta
// que sea una key real porque el SDK está mockeado más abajo, nunca sale un
// request de verdad.
process.env.ANTHROPIC_API_KEY ||= 'dummy-para-test-mockeado-nunca-sale-un-request-real'

const mockCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}))

// vi.mock se hoistea arriba de este import, así que cerebro.ts ya recibe el
// SDK mockeado cuando se importa acá.
const { evaluarTurno, decidirEscaladaForzadaPorTool, MAX_VUELTAS_TOOL_USE, RESPUESTA_ESCALADA_FORZADA_FIJA } =
  await import('../src/bot/cerebro.js')

describe('decidirEscaladaForzadaPorTool (pura, sin I/O)', () => {
  it('fuerza escalada cuando el semáforo da amarillo', () => {
    const r = decidirEscaladaForzadaPorTool('evaluarSemaforoCateringPedido', 'amarillo')
    expect(r.forzar).toBe(true)
    expect(r.motivo).toMatch(/amarillo/)
  })

  it('fuerza escalada cuando el semáforo da rojo', () => {
    const r = decidirEscaladaForzadaPorTool('evaluarSemaforoCateringPedido', 'rojo')
    expect(r.forzar).toBe(true)
    expect(r.motivo).toMatch(/rojo/)
  })

  it('NO fuerza nada cuando el semáforo da verde', () => {
    const r = decidirEscaladaForzadaPorTool('evaluarSemaforoCateringPedido', 'verde')
    expect(r.forzar).toBe(false)
  })

  it('NO fuerza nada para otra tool aunque el resultado sea el string "amarillo" de casualidad', () => {
    const r = decidirEscaladaForzadaPorTool('consultarPrecio', 'amarillo')
    expect(r.forzar).toBe(false)
  })
})

describe.skipIf(!hayBaseDeDatosReal)('evaluarTurno — garantías forzadas por código (SDK mockeado)', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let tenantId: string

  beforeEach(async () => {
    mockCreate.mockReset()
    client = await pool.connect()
    const { rows } = await client.query(`select id from tenants where slug = 'bake-brothers'`)
    tenantId = rows[0].id
  })

  afterEach(() => {
    client.release()
  })

  it('escala aunque el modelo NUNCA llame a escalarAHumano, porque el semáforo real dio amarillo', async () => {
    // Próximo domingo real — mismo criterio de fecha en tiempo de ejecución
    // que el resto de los tests (no un literal que se vuelva viejo).
    let d = new Date()
    while (d.getDay() !== 0) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
    const fechaDomingo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    // Vuelta 1: el modelo pide el tool real del semáforo (corre contra la DB
    // real — Tequeños + domingo = amarillo de verdad, no simulado).
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'toolu_01',
          name: 'evaluarSemaforoCateringPedido',
          input: { busquedaItem: 'tequeños', cantidadSolicitada: 30, fechaEntregaISO: fechaDomingo },
        },
      ],
    })
    // Vuelta 2: el modelo NO llama a escalarAHumano — confirma como si todo
    // estuviera bien. Este es justo el caso que preocupa: el modelo "no se
    // da cuenta" o decide no escalar por su cuenta.
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: '¡Perfecto! Tu pedido de 30 tequeños queda confirmado para el domingo 😊',
        },
      ],
    })

    const r = await evaluarTurno(
      client,
      tenantId,
      [],
      `Quiero 30 tequeños para el domingo ${fechaDomingo}`,
      'activa'
    )

    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(r.herramientasUsadas).toEqual(['evaluarSemaforoCateringPedido'])
    expect(r.herramientasUsadas).not.toContain('escalarAHumano')
    // El modelo confirmó como si nada — pero el código igual fuerza la escalada.
    expect(r.nuevoEstado).toBe('escalada')
    expect(r.motivoEscalacion).toMatch(/amarillo/)

    // Lo que importa acá: el texto que queda registrado (y que eventualmente
    // se le manda al cliente) NO puede ser la confirmación indebida que
    // escribió el modelo — tiene que ser el mensaje fijo de "pendiente de
    // revisión". No alcanza con que el estado diga 'escalada' si el texto
    // real sigue diciendo "confirmado".
    expect(r.textoRespuesta).toBe(RESPUESTA_ESCALADA_FORZADA_FIJA)
    expect(r.textoRespuesta).not.toMatch(/confirmad/i)
  })

  it('regresión: si el modelo SÍ llama a escalarAHumano por su cuenta, su propio texto final NO se reemplaza', async () => {
    // Vuelta 1: el modelo decide escalar por su cuenta (ej. un reclamo).
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'toolu_02',
          name: 'escalarAHumano',
          input: { motivo: 'Reclamo por producto dañado' },
        },
      ],
    })
    // Vuelta 2: el modelo ya sabe que escaló — su texto es confiable, no hay
    // que pisarlo con el mensaje fijo genérico.
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: 'Ya quedó registrado tu reclamo, en breve te escribe alguien del equipo para ayudarte 🙏',
        },
      ],
    })

    const r = await evaluarTurno(client, tenantId, [], 'Llegó todo roto, quiero un reembolso', 'activa')

    expect(r.herramientasUsadas).toContain('escalarAHumano')
    expect(r.nuevoEstado).toBe('escalada')
    expect(r.textoRespuesta).toBe('Ya quedó registrado tu reclamo, en breve te escribe alguien del equipo para ayudarte 🙏')
    expect(r.textoRespuesta).not.toBe(RESPUESTA_ESCALADA_FORZADA_FIJA)
  })

  it('corta el loop de tool-use en MAX_VUELTAS_TOOL_USE si el modelo nunca da una respuesta final', async () => {
    // El modelo SIEMPRE pide una tool (nunca conforme, nunca responde texto
    // final) — consultarPrecio corre real contra la DB en cada vuelta, un
    // producto real no cambia el resultado de la prueba.
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          id: 'toolu_loop',
          name: 'consultarPrecio',
          input: { busqueda: 'carrot cake' },
        },
      ],
    })

    const r = await evaluarTurno(client, tenantId, [], '¿Cuánto cuesta?', 'activa')

    expect(MAX_VUELTAS_TOOL_USE).toBe(6)
    expect(mockCreate).toHaveBeenCalledTimes(MAX_VUELTAS_TOOL_USE)
    expect(r.nuevoEstado).toBe('escalada')
    expect(r.textoRespuesta).toMatch(/confirmar bien esto con el equipo/)
    expect(r.motivoEscalacion).toMatch(/límite de iteraciones/)
  })
})

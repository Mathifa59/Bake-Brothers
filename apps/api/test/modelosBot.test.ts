// El modelo de Claude del bot se configura por variable de entorno (BOT_MODELO para la conversación y
// BOT_MODELO_CAPTURAS para la lectura de capturas de pago; ver bot/modelos.ts), con Sonnet por defecto. SIN Claude
// real: el SDK de Anthropic está mockeado y lo único que se comprueba es QUÉ modelo se le pide. No necesita base de
// datos (el cliente de pg es un doble mínimo). Cada caso importa los módulos de cero para que env.ts lea la variable
// que corresponde (env.ts valida process.env al importarse).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

process.env.ANTHROPIC_API_KEY ||= 'dummy-para-test-mockeado-nunca-sale-un-request-real'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({ messages: { create: mockCreate } })),
}))

const clienteSinBase = { query: async () => ({ rows: [], rowCount: 0 }) }

async function cargar(variables: Record<string, string | undefined>) {
  vi.resetModules()
  for (const [k, v] of Object.entries(variables)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  const cerebro = await import('../src/bot/cerebro.js')
  const capturas = await import('../src/bot/capturaPago.js')
  return { evaluarTurno: cerebro.evaluarTurno, leerComprobanteDePago: capturas.leerComprobanteDePago }
}

const conversar = (evaluarTurno: Awaited<ReturnType<typeof cargar>>['evaluarTurno']) =>
  evaluarTurno(clienteSinBase as never, 'tenant', [], 'Hola, ¿qué tortas tienen?', 'activa', 'whatsapp')

describe('modelo del bot configurable', () => {
  beforeEach(() => {
    mockCreate.mockReset()
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '¡Hola! ¿En qué te ayudo?' }], stop_reason: 'end_turn' })
  })
  afterEach(() => {
    delete process.env.BOT_MODELO
    delete process.env.BOT_MODELO_CAPTURAS
  })

  describe('resolverModelo', () => {
    it('vacío, ausente o solo espacios = Sonnet; un valor se respeta (sin espacios)', async () => {
      const { resolverModelo, MODELO_POR_DEFECTO } = await import('../src/bot/modelos.js')
      expect(MODELO_POR_DEFECTO).toBe('claude-sonnet-5')
      for (const v of [undefined, null, '', '   ']) expect(resolverModelo(v)).toBe('claude-sonnet-5')
      expect(resolverModelo(' claude-haiku-5-5 ')).toBe('claude-haiku-5-5')
    })
  })

  it('sin variable, la conversación usa Sonnet (nada cambia respecto a hoy)', async () => {
    const { evaluarTurno } = await cargar({ BOT_MODELO: undefined, BOT_MODELO_CAPTURAS: undefined })
    const r = await conversar(evaluarTurno)
    expect(r.textoRespuesta).toBe('¡Hola! ¿En qué te ayudo?')
    expect(mockCreate.mock.calls[0][0].model).toBe('claude-sonnet-5')
  })

  it('con BOT_MODELO=claude-haiku-5-5 la conversación le pide Haiku al SDK', async () => {
    const { evaluarTurno } = await cargar({ BOT_MODELO: 'claude-haiku-5-5', BOT_MODELO_CAPTURAS: undefined })
    const r = await conversar(evaluarTurno)
    expect(r.textoRespuesta).toBe('¡Hola! ¿En qué te ayudo?')
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate.mock.calls[0][0].model).toBe('claude-haiku-5-5')
  })

  it('cambiar la conversación a Haiku NO cambia el modelo de las capturas de pago (se queda en Sonnet)', async () => {
    const { leerComprobanteDePago } = await cargar({ BOT_MODELO: 'claude-haiku-5-5', BOT_MODELO_CAPTURAS: undefined })
    mockCreate.mockReset()
    mockCreate.mockResolvedValue({ content: [{ type: 'tool_use', id: 't', name: 'registrar_lectura_del_comprobante', input: { esComprobante: false } }] })
    await leerComprobanteDePago({ bytes: Buffer.from('x'), mimeType: 'image/png' })
    expect(mockCreate.mock.calls[0][0].model).toBe('claude-sonnet-5')
  })

  it('las capturas tienen su propia variable (BOT_MODELO_CAPTURAS)', async () => {
    const { leerComprobanteDePago } = await cargar({ BOT_MODELO: undefined, BOT_MODELO_CAPTURAS: 'claude-haiku-5-5' })
    mockCreate.mockReset()
    mockCreate.mockResolvedValue({ content: [{ type: 'tool_use', id: 't', name: 'registrar_lectura_del_comprobante', input: { esComprobante: false } }] })
    await leerComprobanteDePago({ bytes: Buffer.from('x'), mimeType: 'image/png' })
    expect(mockCreate.mock.calls[0][0].model).toBe('claude-haiku-5-5')
  })
})

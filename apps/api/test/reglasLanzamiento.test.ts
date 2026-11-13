// Reglas de lanzamiento decididas con el negocio (2026-10-29), hechas cumplir por el SERVIDOR y no por la
// memoria del modelo:
//   - Pago 100 % adelantado: todo pedido del bot nace `payment_pending`; no existe contraentrega.
//   - Datos de pago (env DATOS_PAGO): si están, el bot los da; si no, una persona los envía y la
//     conversación pasa al equipo.
//   - Catering: SIEMPRE lo atiende una persona; crearPedido lo rechaza y fuerza la escalada.
//   - Delivery: solo a los distritos con cobertura; lo cotiza y coordina una persona (no se dan datos de pago
//     hasta tener el total final).
//   - El bot conoce los locales, sus horarios y la cobertura de delivery.
// Corre contra Postgres real (se salta sin DATABASE_URL) con el SDK de Anthropic mockeado: nunca sale un
// request real. Cada caso va en una transacción que se deshace.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { fechaLimaISO, sumarDiasISO } from '@bakebrothers/domain'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

process.env.ANTHROPIC_API_KEY ||= 'dummy-para-test-mockeado-nunca-sale-un-request-real'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({ messages: { create: mockCreate } })),
}))

const { env } = await import('../src/env.js')
const { crearPedido } = await import('../src/services/crearPedido.js')
const { evaluarTurno, textoContextoLocales, decidirEscaladaForzadaPorTool, RESPUESTA_ESCALADA_FORZADA_FIJA } =
  await import('../src/bot/cerebro.js')

const DATOS_PAGO_DE_PRUEBA = 'Yape 999 999 999 a nombre de Bake Brothers'

/** Próxima fecha (a 10 días) que no sea domingo. */
function fechaValida(): string {
  let f = sumarDiasISO(fechaLimaISO(), 10)
  while (new Date(`${f}T12:00:00-05:00`).getUTCDay() === 0) f = sumarDiasISO(f, 1)
  return f
}

describe('textoContextoLocales (pura)', () => {
  it('lista cada local con su dirección y horario, y la cobertura de delivery', () => {
    const t = textoContextoLocales(
      [
        { nombre: 'Cedros', direccion: 'Av. Alameda 820', horario: 'lunes a viernes 7:30 a. m. a 8:30 p. m.; sábado por confirmar' },
        { nombre: 'Santa Marina', direccion: null, horario: null },
      ],
      ['Chorrillos', 'Surco']
    )
    expect(t).toContain('- Cedros (Av. Alameda 820; horario: lunes a viernes 7:30 a. m. a 8:30 p. m.; sábado por confirmar)')
    expect(t).toContain('- Santa Marina')
    expect(t).toContain('Delivery de tienda solo a: Chorrillos, Surco.')
    expect(t).toMatch(/por confirmar/)
  })

  it('sin lista de distritos, el delivery no tiene restricción', () => {
    expect(textoContextoLocales([], [])).toContain('Delivery sin restricción de distrito.')
  })
})

describe('decidirEscaladaForzadaPorTool — reglas de lanzamiento (pura)', () => {
  it('catering: crearPedido rechazado fuerza la escalada', () => {
    const d = decidirEscaladaForzadaPorTool('crearPedido', { ok: false, error: 'CATERING_REQUIERE_PERSONA' })
    expect(d.forzar).toBe(true)
    expect(d.motivo).toMatch(/catering.*persona/i)
    expect(d.textoConfiable).toBeUndefined()
  })

  it('pedido registrado con atencionHumana: fuerza la escalada y el texto del modelo es confiable', () => {
    const d = decidirEscaladaForzadaPorTool('crearPedido', { ok: true, numero: 'BB-1', atencionHumana: 'Pedido BB-1: enviar los datos de pago al cliente.' })
    expect(d).toEqual({ forzar: true, motivo: 'Pedido BB-1: enviar los datos de pago al cliente.', textoConfiable: true })
  })

  it('pedido registrado sin atencionHumana: no escala', () => {
    expect(decidirEscaladaForzadaPorTool('crearPedido', { ok: true, numero: 'BB-1' }).forzar).toBe(false)
  })
})

describe.skipIf(!hayBaseDeDatosReal)('crearPedido — reglas de lanzamiento (Postgres real)', () => {
  // Fuera del horario de las personas (10:00 p. m.–7:30 a. m., Lima) el bot agrega «te escribimos a primera hora» a lo
  // que deriva, y pasado el corte de las 8:00 p. m. no toma pedidos «para hoy»: la hora se fija a mediodía para que la
  // prueba no dependa de cuándo se corra.
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-13T12:00:00-05:00') })
  })
  afterAll(() => {
    vi.useRealTimers()
  })
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let tenantId: string
  let sedeCedrosId: string
  const datosPagoOriginal = env.DATOS_PAGO
  const distritosOriginal = env.DISTRITOS_DELIVERY

  beforeAll(async () => {
    client = await pool.connect()
    tenantId = (await client.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
    sedeCedrosId = (await client.query(`select id from sedes where nombre = 'Cedros'`)).rows[0].id
  })
  afterAll(async () => {
    client.release()
    await pool.end()
  })
  afterEach(() => {
    env.DATOS_PAGO = datosPagoOriginal
    env.DISTRITOS_DELIVERY = distritosOriginal
    mockCreate.mockReset()
  })

  async function enTransaccion<T>(fn: () => Promise<T>): Promise<T> {
    await client.query('begin')
    try {
      return await fn()
    } finally {
      await client.query('rollback')
    }
  }

  const base = (extra: Record<string, unknown> = {}) =>
    ({
      cliente: { nombre: 'Cliente Lanzamiento', telefono: '999555111' },
      sedeId: sedeCedrosId,
      tipoEntrega: 'tienda',
      fechaEntregaISO: fechaValida(),
      horario: '4pm',
      items: [{ tipo: 'producto', busqueda: 'carrot cake', tamano: 'Individual', cantidad: 1 }],
      metodoPago: 'yape',
      // Por defecto paga por adelantado; los casos de "paga al recoger" lo ponen en false explícitamente.
      pagoPorAdelantado: true,
      ...extra,
    }) as Parameters<typeof crearPedido>[3]

  const pedidos = async () => (await client.query(`select count(*)::int as n from orders`)).rows[0].n as number

  it('recojo pagando por adelantado: el pedido nace pendiente de pago', async () => {
    await enTransaccion(async () => {
      env.DATOS_PAGO = undefined
      const r = await crearPedido(client, tenantId, 'whatsapp', base({ pagoPorAdelantado: true }))
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.estado).toBe('payment_pending')
    })
  })

  it('recojo pagando al recoger ("Canceló en tienda"): nace confirmado, se registra como contraentrega y no pide datos de pago', async () => {
    await enTransaccion(async () => {
      env.DATOS_PAGO = undefined
      const r = await crearPedido(client, tenantId, 'whatsapp', base({ pagoPorAdelantado: false, metodoPago: 'yape' }))
      expect(r.ok).toBe(true)
      if (r.ok) {
        expect(r.estado).toBe('confirmed')
        expect(r.datosPago).toBeNull()
        expect(r.atencionHumana).toBeUndefined() // nadie tiene que mandarle datos de pago
        const { rows } = await client.query(`select metodo_pago from orders where numero = $1`, [r.numero])
        expect(rows[0].metodo_pago).toBe('contraentrega')
      }
    })
  })

  it('delivery: SIEMPRE por adelantado, aunque el modelo diga que paga al recoger', async () => {
    await enTransaccion(async () => {
      const r = await crearPedido(
        client,
        tenantId,
        'whatsapp',
        base({ tipoEntrega: 'delivery', direccion: 'Av. Prueba 1', distrito: 'Surco', pagoPorAdelantado: false })
      )
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.estado).toBe('payment_pending')
    })
  })

  it('sin DATOS_PAGO: no hay datos que dar y el pedido pasa a una persona para enviarlos', async () => {
    await enTransaccion(async () => {
      env.DATOS_PAGO = undefined
      const r = await crearPedido(client, tenantId, 'whatsapp', base())
      expect(r.ok).toBe(true)
      if (r.ok) {
        expect(r.datosPago).toBeNull()
        expect(r.atencionHumana).toMatch(/enviar los datos de pago/)
      }
    })
  })

  it('con DATOS_PAGO: se los da al cliente de recojo y no hace falta una persona', async () => {
    await enTransaccion(async () => {
      env.DATOS_PAGO = DATOS_PAGO_DE_PRUEBA
      const r = await crearPedido(client, tenantId, 'whatsapp', base())
      expect(r.ok).toBe(true)
      if (r.ok) {
        expect(r.datosPago).toBe(DATOS_PAGO_DE_PRUEBA)
        expect(r.atencionHumana).toBeUndefined()
      }
    })
  })

  it('delivery con contraentrega: PAGO_ADELANTADO_REQUERIDO y no se crea nada', async () => {
    await enTransaccion(async () => {
      const antes = await pedidos()
      const r = await crearPedido(
        client,
        tenantId,
        'whatsapp',
        base({ tipoEntrega: 'delivery', direccion: 'Av. Prueba 1', distrito: 'Surco', metodoPago: 'contraentrega' })
      )
      expect(r).toMatchObject({ ok: false, error: 'PAGO_ADELANTADO_REQUERIDO' })
      expect(await pedidos()).toBe(antes)
    })
  })

  it('catering: CATERING_REQUIERE_PERSONA aunque cumpla las reglas, y no se crea nada', async () => {
    await enTransaccion(async () => {
      const antes = await pedidos()
      const r = await crearPedido(
        client,
        tenantId,
        'whatsapp',
        base({ items: [{ tipo: 'catering', busqueda: 'tequeños', cantidad: 50 }], fechaEntregaISO: sumarDiasISO(fechaLimaISO(), 20) })
      )
      expect(r).toMatchObject({ ok: false, error: 'CATERING_REQUIERE_PERSONA' })
      expect(await pedidos()).toBe(antes)
    })
  })

  it('delivery a un distrito sin cobertura: DISTRITO_SIN_COBERTURA con la lista, y no se crea nada', async () => {
    await enTransaccion(async () => {
      const antes = await pedidos()
      const r = await crearPedido(client, tenantId, 'whatsapp', base({ tipoEntrega: 'delivery', direccion: 'Av. Prueba 1', distrito: 'Barranco' }))
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.error).toBe('DISTRITO_SIN_COBERTURA')
        expect(JSON.stringify(r.detalle)).toContain('Chorrillos')
      }
      expect(await pedidos()).toBe(antes)
    })
  })

  it('delivery a un distrito de la ficha (sin importar tildes): se registra y lo coordina una persona, sin datos de pago todavía', async () => {
    await enTransaccion(async () => {
      env.DATOS_PAGO = DATOS_PAGO_DE_PRUEBA
      const r = await crearPedido(
        client,
        tenantId,
        'whatsapp',
        base({ tipoEntrega: 'delivery', direccion: 'Av. Prueba 1', distrito: 'jesus maria' })
      )
      expect(r.ok).toBe(true)
      if (r.ok) {
        expect(r.estado).toBe('payment_pending')
        expect(r.datosPago).toBeNull() // el total final lo da la persona que cotiza el envío
        expect(r.atencionHumana).toMatch(/cotizar el delivery y coordinar la entrega/)
      }
    })
  })

  it('delivery sin dirección o distrito sigue pidiendo DIRECCION_REQUERIDA', async () => {
    await enTransaccion(async () => {
      const r = await crearPedido(client, tenantId, 'whatsapp', base({ tipoEntrega: 'delivery', direccion: null, distrito: null }))
      expect(r).toMatchObject({ ok: false, error: 'DIRECCION_REQUERIDA' })
    })
  })

  it('la cobertura sale de la configuración: con otra lista, otro distrito entra', async () => {
    await enTransaccion(async () => {
      env.DISTRITOS_DELIVERY = 'Barranco'
      const r = await crearPedido(client, tenantId, 'whatsapp', base({ tipoEntrega: 'delivery', direccion: 'Av. Prueba 1', distrito: 'Barranco' }))
      expect(r.ok).toBe(true)
    })
  })

  // --- de punta a punta por el cerebro, con el modelo mockeado ---

  const pedidoDelModelo = (extra: Record<string, unknown> = {}) => ({
    type: 'tool_use',
    id: 'toolu_lanzamiento',
    name: 'crearPedido',
    input: {
      clienteNombre: 'Cliente Lanzamiento',
      clienteTelefono: '999555111',
      tipoEntrega: 'tienda',
      fechaEntregaISO: fechaValida(),
      horario: '4pm',
      items: [{ tipo: 'producto', busqueda: 'carrot cake', tamano: 'Individual', cantidad: 1 }],
      metodoPago: 'yape',
      pagoPorAdelantado: true,
      ...extra,
    },
  })

  it('bot, recojo SIN datos de pago configurados: queda escalada para que una persona los envíe, y se conserva el texto del modelo', async () => {
    await enTransaccion(async () => {
      env.DATOS_PAGO = undefined
      mockCreate
        .mockResolvedValueOnce({ content: [pedidoDelModelo()] })
        .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Pedido registrado. Una persona te escribe con los datos de pago 😊' }] })
      const r = await evaluarTurno(client, tenantId, [], 'Quiero un carrot cake individual', 'activa', 'whatsapp', sedeCedrosId)
      expect(r.pedidosCreados?.[0]).toMatchObject({ estado: 'payment_pending' })
      expect(r.nuevoEstado).toBe('escalada')
      expect(r.motivoEscalacion).toMatch(/datos de pago/)
      // El pedido SÍ existe: el texto del modelo (con lo que sigue) no se pisa con el mensaje fijo.
      expect(r.textoRespuesta).toBe('Pedido registrado. Una persona te escribe con los datos de pago 😊')
      expect(r.textoRespuesta).not.toBe(RESPUESTA_ESCALADA_FORZADA_FIJA)
    })
  })

  it('bot, recojo CON datos de pago configurados: no escala y el modelo recibe los datos en el resultado', async () => {
    await enTransaccion(async () => {
      env.DATOS_PAGO = DATOS_PAGO_DE_PRUEBA
      mockCreate
        .mockResolvedValueOnce({ content: [pedidoDelModelo()] })
        .mockResolvedValueOnce({ content: [{ type: 'text', text: `Listo, paga a: ${DATOS_PAGO_DE_PRUEBA}` }] })
      const r = await evaluarTurno(client, tenantId, [], 'Quiero un carrot cake individual', 'activa', 'whatsapp', sedeCedrosId)
      expect(r.nuevoEstado).toBe('activa')
      const resultadoTool = JSON.stringify(mockCreate.mock.calls[1][0].messages)
      expect(resultadoTool).toContain(DATOS_PAGO_DE_PRUEBA)
    })
  })

  it('bot, catering: el modelo salta directo a crearPedido, se rechaza, se escala y el cliente no recibe una confirmación falsa', async () => {
    await enTransaccion(async () => {
      mockCreate
        .mockResolvedValueOnce({
          content: [pedidoDelModelo({ items: [{ tipo: 'catering', busqueda: 'tequeños', cantidad: 50 }], fechaEntregaISO: sumarDiasISO(fechaLimaISO(), 20) })],
        })
        .mockResolvedValueOnce({ content: [{ type: 'text', text: '¡Listo! Tu pedido de catering quedó confirmado 😊' }] })
      const r = await evaluarTurno(client, tenantId, [], 'Quiero 50 tequeños', 'activa', 'whatsapp', sedeCedrosId)
      expect(r.pedidosCreados ?? []).toHaveLength(0)
      expect(r.nuevoEstado).toBe('escalada')
      expect(r.textoRespuesta).toBe(RESPUESTA_ESCALADA_FORZADA_FIJA)
    })
  })

  it('bot: el prompt incluye los locales con su horario real (sábado de Cedros por confirmar) y la cobertura de delivery', async () => {
    await enTransaccion(async () => {
      mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'Hola 😊' }] })
      await evaluarTurno(client, tenantId, [], 'hola', 'activa', 'whatsapp', sedeCedrosId)
      const system = mockCreate.mock.calls[0][0].system as string
      expect(system).toContain('LOCALES Y HORARIOS')
      expect(system).toMatch(/Cedros \(.*horario: lunes a viernes 7:30 a\. m\. a 8:30 p\. m\.; sábado por confirmar; domingo 10:00 a\. m\. a 8:30 p\. m\./)
      expect(system).toMatch(/Santa Marina \(.*horario: todos los días 12:00 p\. m\. a 10:00 p\. m\./)
      expect(system).toContain('Delivery de tienda solo a: Chorrillos, Surco, Miraflores')
      // Y las reglas nuevas del prompt.
      expect(system).toMatch(/delivery se paga SIEMPRE por adelantado/)
      expect(system).toMatch(/CAPTURAS DE PAGO/)
      expect(system).toMatch(/SIEMPRE lo atiende una persona/)
    })
  })
})

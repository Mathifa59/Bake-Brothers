// Corte del día (8:00 p. m. clientes, 11:00 p. m. mayoristas) y derivación fuera de horario del bot. SIN Claude real: el SDK
// de Anthropic está mockeado; lo que se prueba es lo que decide el servidor — qué se le dice al modelo, qué rechaza
// crearPedido y qué texto sale cuando se deriva a una persona de noche. Necesita Postgres con el esquema hasta la 0039.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal = !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER
process.env.ANTHROPIC_API_KEY ||= 'dummy-para-test-mockeado-nunca-sale-un-request-real'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({ messages: { create: mockCreate } })),
}))

const { evaluarTurno } = await import('../src/bot/cerebro.js')
const { crearPedido } = await import('../src/services/crearPedido.js')

const lima = (hhmm: string, dia = '2026-11-13') => new Date(`${dia}T${hhmm}:00-05:00`)
const sistemaDeLaLlamada = (n = 0) => String(mockCreate.mock.calls[n][0].system)

describe.skipIf(!hayBaseDeDatosReal)('corte del día y atención fuera de horario', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let tenantId: string

  beforeAll(async () => {
    client = await pool.connect()
    tenantId = (await client.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
  })
  afterAll(async () => {
    await client.query(`delete from customers where telefono like '+5199900044%' or telefono in ('999000445', '999000446', '999000447')`)
    client.release()
    await pool.end()
  })
  beforeEach(() => mockCreate.mockReset())

  const pedidoPara = (fechaEntregaISO: string, telefono: string, ahora: Date) =>
    crearPedido(client, tenantId, 'whatsapp', {
      cliente: { nombre: 'Cliente de prueba', telefono },
      sedeElegida: 'Cedros',
      tipoEntrega: 'recojo',
      fechaEntregaISO,
      horario: '9:00 a. m.',
      // Un producto que no existe: si el corte NO rechaza, el pedido se cae aquí (PRODUCTO_NO_ENCONTRADO) y no crea nada.
      items: [{ tipo: 'producto', busqueda: 'producto-que-no-existe-xyz', cantidad: 1 }],
      metodoPago: 'yape',
      pagoPorAdelantado: false,
      ahora,
    } as never)

  describe('crearPedido (el servidor hace cumplir el corte de las 11:00 p. m.)', () => {
    it('para MAÑANA a las 11:00 p. m. ya no se toma: se rechaza con la fecha mínima (pasado mañana) y no deja rastro', async () => {
      const r = await pedidoPara('2026-11-14', '999000445', lima('23:00'))
      expect(r).toMatchObject({ ok: false, error: 'CORTE_DEL_DIA', detalle: { fechaMinima: '2026-11-15' } })
      const { rows } = await client.query(`select count(*)::int n from customers where telefono = '+51999000445'`)
      expect(rows[0].n).toBe(0)
    })

    it('para mañana a las 10:59 p. m. todavía pasa el corte (y se cae después por el producto inexistente); a las 8:30 p. m. también', async () => {
      expect(await pedidoPara('2026-11-14', '999000445', lima('22:59'))).toMatchObject({ error: 'PRODUCTO_NO_ENCONTRADO' })
      expect(await pedidoPara('2026-11-14', '999000445', lima('20:30'))).toMatchObject({ error: 'PRODUCTO_NO_ENCONTRADO' })
    })

    it('«para hoy» ya NO lo rechaza el corte (el servidor aplica las validaciones de pedido para hoy)', async () => {
      expect(await pedidoPara('2026-11-13', '999000445', lima('15:00'))).toMatchObject({ error: 'PRODUCTO_NO_ENCONTRADO' })
      expect(await pedidoPara('2026-11-13', '999000445', lima('21:00'))).toMatchObject({ error: 'PRODUCTO_NO_ENCONTRADO' })
    })

    it('un mayorista NO pasa por el bot (lo atiende una persona por un WhatsApp directo); un cliente común sí, con su corte', async () => {
      await client.query(
        `insert into customers (tenant_id, nombre, telefono, es_mayorista) values ($1, '[PRUEBA] Mayorista', '+51999000446', true), ($1, '[PRUEBA] Normal', '+51999000447', false)`,
        [tenantId]
      )
      // El mayorista se rechaza antes de cualquier otra regla (a cualquier hora), con el link de atención directa.
      for (const hora of ['15:00', '21:00', '23:05']) {
        expect(await pedidoPara('2026-11-14', '999000446', lima(hora))).toMatchObject({
          ok: false,
          error: 'MAYORISTA_ATENCION_DIRECTA',
          detalle: { whatsapp: 'https://wa.me/51986639228' },
        })
      }
      expect(await pedidoPara('2026-11-14', '999000447', lima('23:05'))).toMatchObject({ error: 'CORTE_DEL_DIA' })
    })
  })

  describe('lo que se le dice al modelo y lo que sale cuando se deriva', () => {
    const turno = (ahora: Date, mensaje = 'Hola, quiero una torta para hoy') =>
      evaluarTurno(client, tenantId, [], mensaje, 'activa', 'whatsapp', undefined, { ahora })

    const respuestaTexto = (texto: string) => ({ content: [{ type: 'text', text: texto }], stop_reason: 'end_turn' })
    const respuestaEscalar = () => ({
      content: [{ type: 'tool_use', id: 't1', name: 'escalarAHumano', input: { motivo: 'cotizar el delivery' } }],
      stop_reason: 'tool_use',
    })

    it('después de las 11:00 p. m. el contexto dice que mañana ya no se toma y que la fecha más cercana es pasado mañana', async () => {
      mockCreate.mockResolvedValue(respuestaTexto('Para mañana ya no alcanza, ¿te lo agendo para el domingo?'))
      await turno(lima('23:30'))
      const sistema = sistemaDeLaLlamada()
      expect(sistema).toContain('ya pasaron las 11:00 p. m.')
      expect(sistema).toContain('2026-11-15')
      expect(sistema).toContain('CORTE_DEL_DIA') // la regla 10 del prompt
      // Y el horario de HOY de cada local (estructurado, sedes_horarios): viernes.
      expect(sistema).toContain('HORARIO DE HOY (viernes) PARA RECOJO')
      expect(sistema).toMatch(/Cedros 7:30 a\. m\.–8:30 p\. m\./)
      expect(sistema).toMatch(/Santa Marina 12:00 p\. m\.–10:00 p\. m\./)
    })

    it('de día el contexto dice el corte de mañana, que hoy SÍ se toma con validaciones y que hay equipo atendiendo', async () => {
      mockCreate.mockResolvedValue(respuestaTexto('¡Hola! ¿Qué te preparo?'))
      await turno(lima('12:00'))
      const sistema = sistemaDeLaLlamada()
      expect(sistema).toContain('los pedidos para mañana se toman hasta las 11:00 p. m. de hoy')
      expect(sistema).toContain('PEDIDOS PARA HOY: SÍ los puedes tomar')
      expect(sistema).not.toContain('ya pasaron las 11:00 p. m.')
      expect(sistema).toContain('ahora hay equipo atendiendo')
    })

    it('de noche el contexto avisa que no hay equipo y, si el modelo deriva sin decirlo, el servidor agrega «te escribimos a primera hora»', async () => {
      mockCreate.mockResolvedValueOnce(respuestaEscalar()).mockResolvedValueOnce(respuestaTexto('Una persona del equipo te confirma el envío.'))
      const r = await turno(lima('23:30'), 'Quiero delivery a Surco')
      expect(sistemaDeLaLlamada()).toContain('ahora NO hay equipo atendiendo')
      expect(r.nuevoEstado).toBe('escalada')
      expect(r.textoRespuesta).toContain('Una persona del equipo te confirma el envío.')
      expect(r.textoRespuesta).toContain('te escribimos a primera hora')
    })

    it('en horario la derivación NO agrega el aviso; si el modelo ya lo dijo tampoco se duplica', async () => {
      mockCreate.mockResolvedValueOnce(respuestaEscalar()).mockResolvedValueOnce(respuestaTexto('Una persona del equipo te confirma el envío.'))
      const dia = await turno(lima('11:00'), 'Quiero delivery a Surco')
      expect(dia.textoRespuesta).not.toContain('primera hora')

      mockCreate.mockReset()
      mockCreate.mockResolvedValueOnce(respuestaEscalar()).mockResolvedValueOnce(respuestaTexto('Te escribimos a primera hora, ¡gracias!'))
      const noche = await turno(lima('23:30'), 'Quiero delivery a Surco')
      expect(noche.textoRespuesta.match(/primera hora/gi)).toHaveLength(1)
    })

    it('la respuesta fija de alergias (sin modelo) también avisa de noche y no llama al modelo', async () => {
      const r = await turno(lima('23:45'), 'Soy alérgico al maní, ¿tienen algo sin maní?')
      expect(mockCreate).not.toHaveBeenCalled()
      expect(r.nuevoEstado).toBe('escalada')
      expect(r.textoRespuesta).toContain('te escribimos a primera hora')
    })
  })
})

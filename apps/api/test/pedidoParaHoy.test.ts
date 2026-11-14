// Pedido PARA HOY y corte de las 11:00 p. m. (decisión del cliente, 2026-11-13). Contra Postgres real (esquema hasta la 0050) con
// la hora fijada: viernes 13 de noviembre de 2026, 12:00 p. m. de Lima. Cada caso corre en una transacción que se deshace.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'
import { crearPedido, type CrearPedidoInput } from '../src/services/crearPedido.js'
import { crearPedidoDashboard } from '../src/services/crearPedidoDashboard.js'
import { decidirEscaladaForzadaPorTool } from '../src/bot/cerebro.js'

const hayBaseDeDatosReal = !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER
process.env.ANTHROPIC_API_KEY ||= 'dummy-para-test-mockeado-nunca-sale-un-request-real'

const lima = (hhmm: string, dia = '2026-11-13') => new Date(`${dia}T${hhmm}:00-05:00`)
const AHORA = lima('12:00')
const HOY = '2026-11-13' // viernes
const MANANA = '2026-11-14' // sábado
const DOMINGO = '2026-11-15'

describe.skipIf(!hayBaseDeDatosReal)('pedido para hoy y corte', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let tenantId: string
  let cedros: string
  let santaMarina: string

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: AHORA })
    client = await pool.connect()
    tenantId = (await client.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
    cedros = (await client.query(`select id from sedes where nombre = 'Cedros'`)).rows[0].id
    santaMarina = (await client.query(`select id from sedes where nombre = 'Santa Marina'`)).rows[0].id
  })
  afterAll(async () => {
    vi.useRealTimers()
    client.release()
    await pool.end()
  })
  afterEach(() => vi.setSystemTime(AHORA))

  async function enTransaccion<T>(fn: () => Promise<T>): Promise<T> {
    await client.query('begin')
    try {
      return await fn()
    } finally {
      await client.query('rollback')
    }
  }

  const base = (extra: Partial<CrearPedidoInput> & Record<string, unknown> = {}): CrearPedidoInput =>
    ({
      cliente: { nombre: 'Cliente Para Hoy', telefono: '999555777' },
      sedeId: cedros,
      tipoEntrega: 'tienda',
      fechaEntregaISO: HOY,
      horario: '4:30 pm',
      // Carrot Cake Individual: se hace en vitrina (el tamaño individual pisa al «por pedido» del producto).
      items: [{ tipo: 'producto', busqueda: 'carrot cake', tamano: 'Individual', cantidad: 1 }],
      metodoPago: 'yape',
      pagoPorAdelantado: false,
      ahora: AHORA,
      ...extra,
    }) as CrearPedidoInput

  const pedidos = async () => (await client.query(`select count(*)::int n from orders`)).rows[0].n as number

  // ————————————————————————————————————————————————————— 1. hoy, disponible ————
  it('para HOY, producto disponible en el local y hora dentro de su horario → se crea, queda marcado «para hoy» con su resumen', async () => {
    await enTransaccion(async () => {
      const r = await crearPedido(client, tenantId, 'whatsapp', base())
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r).toMatchObject({ estado: 'confirmed', paraHoy: true, sedeId: cedros })
      expect(r.resumen).toContain('Cliente Para Hoy')
      expect(r.resumen).toContain('recojo en Cedros')
      expect(r.resumen).toContain(`${HOY} 4:30 pm`)
      expect(r.resumen).toContain('carrot cake (Individual)')
      expect(r.atencionHumana).toBeUndefined() // recojo: se paga en la tienda, no hay nada que hacer a mano
    })
  })

  it('un pedido para otro día (aunque sea mañana) NO está marcado «para hoy»', async () => {
    await enTransaccion(async () => {
      const r = await crearPedido(client, tenantId, 'whatsapp', base({ fechaEntregaISO: MANANA }))
      expect(r).toMatchObject({ ok: true, paraHoy: false })
    })
  })

  // ——————————————————————————— 2. agotado en un local, disponible en el otro ————
  it('agotado en Cedros: no se crea, avisa en qué local sí hay (Santa Marina); y en Santa Marina el mismo pedido se crea', async () => {
    await enTransaccion(async () => {
      const prod = (await client.query(`select p.id as pid, ps.id as sid from products p join product_sizes ps on ps.product_id = p.id where p.slug = 'torta-carrot-cake' and ps.tamano = 'Individual'`)).rows[0]
      await client.query(`insert into stock (sede_id, product_id, product_size_id, disponible) values ($1, $2, $3, false)`, [cedros, prod.pid, prod.sid])
      const antes = await pedidos()
      const r = await crearPedido(client, tenantId, 'whatsapp', base())
      expect(r).toMatchObject({ ok: false, error: 'PRODUCTO_AGOTADO' })
      if (!r.ok) {
        const detalle = r.detalle as { productos: { producto: string; disponibleEn: { nombre?: string }[] | string[] }[] }
        expect(JSON.stringify(detalle.productos[0].disponibleEn)).toContain('Santa Marina')
      }
      expect(await pedidos()).toBe(antes)
      // El otro local sí lo tiene: el mismo pedido, en Santa Marina, se crea (a las 4:30 p. m. está abierto).
      const otro = await crearPedido(client, tenantId, 'whatsapp', base({ sedeId: santaMarina }))
      expect(otro).toMatchObject({ ok: true, paraHoy: true, sedeId: santaMarina })
    })
  })

  it('con conteo exacto en el stock: 0 unidades no se vende para hoy', async () => {
    await enTransaccion(async () => {
      const prod = (await client.query(`select p.id as pid, ps.id as sid from products p join product_sizes ps on ps.product_id = p.id where p.slug = 'torta-carrot-cake' and ps.tamano = 'Individual'`)).rows[0]
      await client.query(`insert into stock (sede_id, product_id, product_size_id, disponible, cantidad) values ($1, $2, $3, true, 0)`, [cedros, prod.pid, prod.sid])
      expect(await crearPedido(client, tenantId, 'whatsapp', base())).toMatchObject({ ok: false, error: 'PRODUCTO_AGOTADO' })
    })
  })

  // ————————————————————————————————————————————— 3. la hora contra el horario ————
  it('hora de recojo FUERA del horario del local: se rechaza con el horario de ese día y el otro local', async () => {
    await enTransaccion(async () => {
      const antes = await pedidos()
      const r = await crearPedido(client, tenantId, 'whatsapp', base({ horario: '9 pm' })) // Cedros cierra a las 8:30 p. m.
      expect(r).toMatchObject({
        ok: false,
        error: 'HORA_FUERA_DE_HORARIO',
        detalle: { local: 'Cedros', abre: '7:30 a. m.', cierra: '8:30 p. m.' },
      })
      if (!r.ok) {
        const otros = (r.detalle as { otrosLocales: { nombre: string; abre: string; cierra: string }[] }).otrosLocales
        expect(otros).toEqual([{ nombre: 'Santa Marina', abre: '12:00 p. m.', cierra: '10:00 p. m.' }]) // viernes
      }
      expect(await pedidos()).toBe(antes)
    })
  })

  it('para hoy, una hora que ya pasó se rechaza (HORA_PASADA); y una que no se entiende pide una concreta', async () => {
    await enTransaccion(async () => {
      expect(await crearPedido(client, tenantId, 'whatsapp', base({ horario: '11:00 am' }))).toMatchObject({ ok: false, error: 'HORA_PASADA' })
      expect(await crearPedido(client, tenantId, 'whatsapp', base({ horario: 'por la tarde' }))).toMatchObject({ ok: false, error: 'HORA_NO_ENTENDIDA' })
    })
  })

  it('el horario depende del día y del local: Cedros abre a las 10:30 el domingo; Santa Marina abre a las 12:00', async () => {
    await enTransaccion(async () => {
      expect(await crearPedido(client, tenantId, 'whatsapp', base({ fechaEntregaISO: DOMINGO, horario: '10:00 am' }))).toMatchObject({
        ok: false,
        error: 'HORA_FUERA_DE_HORARIO',
        detalle: { abre: '10:30 a. m.' },
      })
      expect(await crearPedido(client, tenantId, 'whatsapp', base({ fechaEntregaISO: DOMINGO, horario: '10:30 am' }))).toMatchObject({ ok: true })
      expect(await crearPedido(client, tenantId, 'whatsapp', base({ sedeId: santaMarina, fechaEntregaISO: MANANA, horario: '11:30 am' }))).toMatchObject({
        ok: false,
        error: 'HORA_FUERA_DE_HORARIO',
        detalle: { abre: '12:00 p. m.' },
      })
    })
  })

  it('un local cerrado ese día (sin fila de horario) → LOCAL_CERRADO', async () => {
    await enTransaccion(async () => {
      await client.query(`delete from sedes_horarios where sede_id = $1 and dia_semana = 0`, [cedros])
      expect(await crearPedido(client, tenantId, 'whatsapp', base({ fechaEntregaISO: DOMINGO, horario: '12:00' }))).toMatchObject({ ok: false, error: 'LOCAL_CERRADO' })
    })
  })

  it('el delivery NO valida la hora de recojo (lo coordina una persona)', async () => {
    await enTransaccion(async () => {
      const r = await crearPedido(client, tenantId, 'whatsapp', base({ tipoEntrega: 'delivery', direccion: 'Av. Prueba 1', distrito: 'Surco', horario: 'por la tarde', pagoPorAdelantado: true, sedeId: undefined }))
      expect(r).toMatchObject({ ok: true, paraHoy: true })
    })
  })

  // ———————————————————————————————————————————— 4. producto solo por encargo ————
  it('un producto solo por encargo NO se puede para hoy: se rechaza con la fecha desde la que se agenda (mañana)', async () => {
    await enTransaccion(async () => {
      const antes = await pedidos()
      const r = await crearPedido(client, tenantId, 'whatsapp', base({ items: [{ tipo: 'producto', busqueda: 'pionono familiar', cantidad: 1 }] }))
      expect(r).toMatchObject({ ok: false, error: 'SOLO_POR_ENCARGO', detalle: { fechaMinima: MANANA } })
      expect(await pedidos()).toBe(antes)
      // El mismo producto agendado para mañana sí se toma.
      expect(await crearPedido(client, tenantId, 'whatsapp', base({ fechaEntregaISO: MANANA, items: [{ tipo: 'producto', busqueda: 'pionono familiar', cantidad: 1 }] }))).toMatchObject({ ok: true, paraHoy: false })
    })
  })

  it('el tamaño manda: la torta de chocolate individual (vitrina) sí sale hoy; la familiar (por encargo) no', async () => {
    await enTransaccion(async () => {
      expect(await crearPedido(client, tenantId, 'whatsapp', base({ items: [{ tipo: 'producto', busqueda: 'torta de chocolate con manjar', tamano: 'Individual', cantidad: 1 }] }))).toMatchObject({ ok: true })
      expect(await crearPedido(client, tenantId, 'whatsapp', base({ items: [{ tipo: 'producto', busqueda: 'torta de chocolate con manjar', tamano: 'Familiar', cantidad: 1 }] }))).toMatchObject({ ok: false, error: 'SOLO_POR_ENCARGO' })
    })
  })

  it('la empanada (se hace en vitrina y por pedido) y las bebidas sí salen hoy', async () => {
    await enTransaccion(async () => {
      expect(await crearPedido(client, tenantId, 'whatsapp', base({ items: [{ tipo: 'producto', busqueda: 'empanada de carne', cantidad: 2 }] }))).toMatchObject({ ok: true })
      expect(await crearPedido(client, tenantId, 'whatsapp', base({ items: [{ tipo: 'producto', busqueda: 'agua mineral', cantidad: 1 }] }))).toMatchObject({ ok: true })
    })
  })

  // —————————————————————————————— 5. lo que no se puede validar → una persona ————
  it('un local SIN horario cargado no se puede validar: se deriva a una persona', async () => {
    await enTransaccion(async () => {
      const sedeNueva = (await client.query(`insert into sedes (nombre) values ('TEST sin horario') returning id`)).rows[0].id
      const antes = await pedidos()
      const r = await crearPedido(client, tenantId, 'whatsapp', base({ sedeId: sedeNueva }))
      expect(r).toMatchObject({ ok: false, error: 'NO_SE_PUDO_VALIDAR' })
      expect(await pedidos()).toBe(antes)
      // El pedido NO se crea y la conversación se deriva a una persona con un resumen listo para confirmar.
      const decision = decidirEscaladaForzadaPorTool('crearPedido', r)
      expect(decision.forzar).toBe(true)
      expect(decision.motivo).toContain('Resumen para confirmar')
      expect(decision.motivo).toContain('Cliente Para Hoy')
      expect(decision.motivo).toContain('carrot cake')
      expect(decision.motivo).toContain('no tiene su horario cargado')
    })
  })

  // ————————————————————————————————————————————————————————— 6. el corte ————
  it('para mañana: a las 10:59 p. m. se crea; a las 11:00 p. m. se rechaza y la fecha más cercana es pasado mañana', async () => {
    await enTransaccion(async () => {
      expect(await crearPedido(client, tenantId, 'whatsapp', base({ fechaEntregaISO: MANANA, ahora: lima('22:59') }))).toMatchObject({ ok: true })
      const antes = await pedidos()
      expect(await crearPedido(client, tenantId, 'whatsapp', base({ fechaEntregaISO: MANANA, ahora: lima('23:00') }))).toMatchObject({
        ok: false,
        error: 'CORTE_DEL_DIA',
        detalle: { fechaMinima: DOMINGO },
      })
      expect(await pedidos()).toBe(antes)
      // Y pasado mañana, a las 11:30 p. m., sí.
      expect(await crearPedido(client, tenantId, 'whatsapp', base({ fechaEntregaISO: DOMINGO, horario: '1 pm', ahora: lima('23:30') }))).toMatchObject({ ok: true })
    })
  })

  // ——————————————————————————————— 7. «Nuevo pedido» de operadores: sin bloqueo ————
  describe('«Nuevo pedido» (operadores): nunca se bloquea, solo se MARCA fuera de corte', () => {
    const entrada = (fechaEntregaISO: string, ahora: Date) => ({
      cliente: { nombre: 'Cliente Operador', telefono: '999555888' },
      tipoEntrega: 'tienda' as const,
      fechaEntregaISO,
      horario: '4pm',
      items: [{ tipo: 'producto' as const, productoId: 'carrot cake', tamano: 'Individual', cantidad: 1 }],
      metodoPago: 'yape' as const,
      yaPago: false,
      sedeId: cedros,
      ahora,
    })
    const fuera = async (numero: string) => (await client.query(`select fuera_de_corte from orders where numero = $1`, [numero])).rows[0].fuera_de_corte as boolean

    it('para mañana desde las 11:00 p. m.: se registra igual, marcado fuera de corte', async () => {
      await enTransaccion(async () => {
        const r = await crearPedidoDashboard(client, tenantId, entrada(MANANA, lima('23:30')))
        expect(r.ok).toBe(true)
        if (r.ok) expect(await fuera(r.numero)).toBe(true)
      })
    })

    it('para mañana antes de las 11:00 p. m. y para hoy: sin marca', async () => {
      await enTransaccion(async () => {
        const a = await crearPedidoDashboard(client, tenantId, entrada(MANANA, lima('21:00')))
        const b = await crearPedidoDashboard(client, tenantId, entrada(HOY, lima('21:00')))
        expect(a.ok && b.ok).toBe(true)
        if (a.ok && b.ok) {
          expect(await fuera(a.numero)).toBe(false)
          expect(await fuera(b.numero)).toBe(false)
        }
      })
    })
  })
})

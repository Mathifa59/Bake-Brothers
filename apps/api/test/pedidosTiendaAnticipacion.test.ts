// Regresión: un pedido "para hoy" de un producto SIN anticipación mínima se
// rechazaba siempre (la regla de dominio mide hasta las 00:00 del día de
// entrega, que hoy ya pasó). Sin mínimo documentado vale hoy (hora de Lima) y
// cualquier día futuro; nunca el pasado. Con un mínimo real la regla sigue igual.
//
// Corre contra Postgres real dentro de una transacción que se revierte: no deja
// nada en la base (ni siquiera el cambio temporal de anticipacion_horas).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { fechaLimaISO, sumarDiasISO } from '@bakebrothers/domain'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'
import { validarYValorizarItemsTienda } from '../src/services/pedidosTienda.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

describe.skipIf(!hayBaseDeDatosReal)('validarYValorizarItemsTienda — anticipación', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let tenantId: string
  const hoy = fechaLimaISO()
  const item = [{ productoId: 'alfajor-mix', tamano: 'Caja x10', cantidad: 1 }]

  beforeAll(async () => {
    client = await pool.connect()
    tenantId = (await client.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
    await client.query('begin')
    // Producto sin mínimo (null), como el catálogo real de tienda.
    await client.query(`update products set anticipacion_horas = null where slug = 'alfajor-mix'`)
  })

  afterAll(async () => {
    await client.query('rollback')
    client.release()
    await pool.end()
  })

  it('sin anticipación mínima: "para hoy" ya NO se rechaza', async () => {
    const r = await validarYValorizarItemsTienda(client, tenantId, item, hoy)
    expect(r.ok).toBe(true)
  })

  it('sin anticipación mínima: mañana también vale', async () => {
    const r = await validarYValorizarItemsTienda(client, tenantId, item, sumarDiasISO(hoy, 1))
    expect(r.ok).toBe(true)
  })

  it('sin anticipación mínima: una fecha pasada se sigue rechazando', async () => {
    const r = await validarYValorizarItemsTienda(client, tenantId, item, sumarDiasISO(hoy, -1))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('ANTICIPACION_INSUFICIENTE')
  })

  it('una fecha inválida se rechaza', async () => {
    const r = await validarYValorizarItemsTienda(client, tenantId, item, 'mañana')
    expect(r.ok).toBe(false)
  })

  it('con anticipación mínima real (48 h): hoy y mañana siguen rechazados, la regla de dominio no cambió', async () => {
    await client.query(`update products set anticipacion_horas = 48 where slug = 'alfajor-mix'`)
    const paraHoy = await validarYValorizarItemsTienda(client, tenantId, item, hoy)
    const paraManana = await validarYValorizarItemsTienda(client, tenantId, item, sumarDiasISO(hoy, 1))
    expect(paraHoy.ok).toBe(false)
    expect(paraManana.ok).toBe(false)
    const dentroDeUnaSemana = await validarYValorizarItemsTienda(client, tenantId, item, sumarDiasISO(hoy, 7))
    expect(dentroDeUnaSemana.ok).toBe(true)
  })
})

// Búsqueda tolerante de productos/combos/catering para lo que escribe un cliente real.
// Caso real que la motivó (simulador del bot, 2026-10-13): "1 caja de alfajores mix"
// no encontraba "Alfajor Mix" porque la frase entera tenía que estar dentro del nombre.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'
import { construirBusqueda } from '../src/repositories/busquedaTexto.js'
import { consultarPrecio, consultarDisponibilidad, consultarCombo, consultarReglasCatering } from '../src/bot/tools.js'
import { productoParaPedidoPorBusqueda } from '../src/repositories/productsRepo.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

describe('construirBusqueda (pura)', () => {
  it('quita relleno, pasa a singular y sin tildes: "1 caja de alfajores mix"', () => {
    const b = construirBusqueda('1 caja de alfajores mix')
    expect(b.estrictos).toEqual(['%1%', '%caja%', '%alfajor%', '%mix%'])
    // sin la cantidad ni el empaque, para cuando el nombre no los trae
    expect(b.flexibles).toEqual(['%alfajor%', '%mix%'])
  })

  it('no hay patrones flexibles si no aportan nada distinto', () => {
    expect(construirBusqueda('carrot cake').flexibles).toEqual([])
  })

  it('ignora tildes y mayúsculas', () => {
    expect(construirBusqueda('Cheesecake de Maracuyá').estrictos).toEqual(['%cheesecake%', '%maracuya%'])
  })

  it('una búsqueda sin palabras útiles cae a la frase tal cual', () => {
    expect(construirBusqueda('de la').estrictos).toEqual(['%de la%'])
  })

  it('un intento de inyección de comodines no agrega % ni _ propios', () => {
    const b = construirBusqueda("100%_'; drop table products;--")
    for (const p of [...b.estrictos, ...b.flexibles]) expect(p.slice(1, -1)).toMatch(/^[a-z0-9 ]*$/)
  })
})

describe.skipIf(!hayBaseDeDatosReal)('búsqueda real contra el catálogo', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let tenantId: string

  beforeAll(async () => {
    client = await pool.connect()
    tenantId = (await client.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
  })
  afterAll(async () => {
    client.release()
    await pool.end()
  })

  it.each([
    'caja de alfajores mix',
    '1 caja de alfajores mix',
    'alfajores mix',
    'Alfajor Mix',
    'alfajor-mix',
    'quiero una caja de alfajor mix por favor',
  ])('consultarPrecio("%s") encuentra el Alfajor Mix con su precio real', async (texto) => {
    const r = await consultarPrecio(client, tenantId, texto)
    expect(r?.slug).toBe('alfajor-mix')
    expect(r?.tamanos.map((t) => t.tamano)).toEqual(['Caja x10', 'Caja x18'])
  })

  it('lo que ya funcionaba sigue funcionando (carrot cake, tildes, mayúsculas)', async () => {
    expect((await consultarPrecio(client, tenantId, 'carrot cake'))?.slug).toBe('torta-carrot-cake')
    expect((await consultarPrecio(client, tenantId, 'CHEESECAKE DE MARACUYA'))?.slug).toBe('cheesecake-maracuya')
    expect((await consultarPrecio(client, tenantId, 'cheesecake de maracuyá'))?.slug).toBe('cheesecake-maracuya')
  })

  it('no inventa: un producto que no existe sigue devolviendo null', async () => {
    expect(await consultarPrecio(client, tenantId, 'pizza hawaiana')).toBeNull()
    expect(await consultarDisponibilidad(client, tenantId, 'pizza hawaiana')).toBeNull()
  })

  it('consultarDisponibilidad y el pedido usan la misma búsqueda', async () => {
    expect((await consultarDisponibilidad(client, tenantId, '1 caja de alfajores mix'))?.slug).toBe('alfajor-mix')
    expect((await productoParaPedidoPorBusqueda(client, tenantId, '1 caja de alfajores mix'))?.slug).toBe('alfajor-mix')
  })

  it('combos: la cantidad del nombre distingue "Pack 12 empanadas" de "Pack 6 empanadas"', async () => {
    expect((await consultarCombo(client, 'pack 12 empanadas'))?.nombre).toMatch(/12/)
    expect((await consultarCombo(client, 'pack 6 empanadas'))?.nombre).toMatch(/6/)
    expect(await consultarCombo(client, 'combo que no existe jamas')).toBeNull()
  })

  it('catering: tolera plural y tildes ("tequeños")', async () => {
    expect((await consultarReglasCatering(client, 'tequeños'))?.itemNombre).toMatch(/tequ/i)
    expect((await consultarReglasCatering(client, 'tequenos'))?.itemNombre).toMatch(/tequ/i)
  })
})

// Búsqueda tolerante de productos/combos/catering para lo que escribe un cliente real.
// Caso real que la motivó (simulador del bot, 2026-10-13): "1 caja de alfajores mix"
// no encontraba "Alfajor Mix" porque la frase entera tenía que estar dentro del nombre.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'
import { construirBusqueda } from '../src/repositories/busquedaTexto.js'
import {
  consultarPrecio,
  consultarDisponibilidad,
  consultarCombo,
  consultarReglasCatering,
  listarCatalogo,
} from '../src/bot/tools.js'
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
  // Pedidos genéricos: "quiero alfajores", "¿qué empanadas hay?", "un postre dulce".
  describe('listarCatalogo', () => {
    const nombres = (r: Awaited<ReturnType<typeof listarCatalogo>>) => r.grupos.flatMap((g) => g.productos.map((p) => p.nombre))

    it('"alfajores" lista todos los alfajores disponibles, no solo uno', async () => {
      const r = await listarCatalogo(client, tenantId, 'alfajores')
      expect(nombres(r)).toEqual(expect.arrayContaining(['Alfajor Mix', 'Alfajor con Manjar', 'Alfajor con Nutella', 'Alfajor con Pistacho', 'Alfajor con Lúcuma']))
      expect(r.total).toBeGreaterThanOrEqual(5)
    })

    it('"¿qué tipo de empanadas hay?" lista las empanadas con su precio y ninguna otra cosa', async () => {
      const r = await listarCatalogo(client, tenantId, 'qué tipo de empanadas hay')
      const lista = nombres(r)
      expect(lista.length).toBeGreaterThanOrEqual(10)
      expect(lista.every((n) => /empanada/i.test(n))).toBe(true)
      expect(r.grupos.flatMap((g) => g.productos).every((p) => p.precioDesde > 0)).toBe(true)
    })

    it('"un postre dulce" trae postres (por categoría y rubro) y no empanadas ni sándwiches', async () => {
      const r = await listarCatalogo(client, tenantId, 'un postre dulce')
      const lista = nombres(r)
      expect(lista).toEqual(expect.arrayContaining(['Cheesecake de Fresa', 'Crema Volteada']))
      expect(lista.some((n) => /empanada|croissant|ciabatta/i.test(n))).toBe(false)
    })

    it('un producto con varios tamaños lo avisa y da el precio desde del más barato', async () => {
      const r = await listarCatalogo(client, tenantId, 'alfajor mix')
      const mix = r.grupos.flatMap((g) => g.productos).find((p) => p.nombre === 'Alfajor Mix')
      expect(mix).toEqual({ nombre: 'Alfajor Mix', precioDesde: 12.9, variosTamanos: true })
    })

    it('un rubro amplio ("dulces") se acota al tope y avisa que hay más', async () => {
      const r = await listarCatalogo(client, tenantId, 'dulces')
      expect(r.truncado).toBe(true)
      expect(nombres(r).length).toBe(24)
      expect(r.total).toBeGreaterThan(24)
    })

    it('sin texto, o sin coincidencias, devuelve las categorías que existen y no inventa productos', async () => {
      for (const texto of ['', 'pizza hawaiana']) {
        const r = await listarCatalogo(client, tenantId, texto)
        expect(r.grupos).toEqual([])
        expect(r.total).toBe(0)
        expect(r.categoriasDisponibles?.map((c) => c.categoria)).toEqual(expect.arrayContaining(['Alfajores', 'Empanadas', 'Postres']))
      }
    })

    it('no lista productos no disponibles', async () => {
      await client.query('begin')
      try {
        await client.query(`update products set disponible = false where slug = 'alfajor-mix'`)
        const r = await listarCatalogo(client, tenantId, 'alfajores')
        expect(nombres(r)).not.toContain('Alfajor Mix')
      } finally {
        await client.query('rollback')
      }
    })
  })
})

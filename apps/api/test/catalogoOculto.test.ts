// 0042: «oculto» (products.disponible = false) y los tamaños inactivos (product_sizes.activo = false) no los ve ni el
// bot ni los pedidos ni el catálogo público; no se borran y al reactivarlos vuelven. Todo dentro de una transacción que
// se revierte. Necesita Postgres con el esquema hasta la 0042; sin DATABASE_URL real se salta.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal = !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

const { consultarPrecio, listarCatalogo } = await import('../src/bot/tools.js')
const { buscarProductosPorTexto, listarProductos, productoPorSlug } = await import('../src/repositories/productsRepo.js')

describe.skipIf(!hayBaseDeDatosReal)('catálogo: lo oculto no se ve (0042)', () => {
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

  const dentroDeTransaccion = async <T>(fn: () => Promise<T>): Promise<T> => {
    await client.query('begin')
    try {
      return await fn()
    } finally {
      await client.query('rollback')
    }
  }

  it('un producto oculto no lo encuentra el bot (precio, búsqueda y listado), ni el catálogo público; al reactivarlo vuelve', async () => {
    await dentroDeTransaccion(async () => {
      expect((await consultarPrecio(client, tenantId, 'pie de manzana'))?.nombre).toBe('Pie de Manzana')
      expect((await productoPorSlug(client, tenantId, 'pie-manzana'))?.nombre).toBe('Pie de Manzana')

      await client.query(`update products set disponible = false where slug = 'pie-manzana'`)
      expect(await consultarPrecio(client, tenantId, 'pie de manzana')).toBeNull()
      expect((await buscarProductosPorTexto(client, tenantId, 'pie-manzana')).mejor).toBeNull() // ni por slug exacto
      expect(await productoPorSlug(client, tenantId, 'pie-manzana')).toBeNull()
      expect((await listarProductos(client, tenantId)).some((p) => p.id === 'pie-manzana')).toBe(false)
      const listado = await listarCatalogo(client, tenantId, 'pie de manzana')
      expect(listado.grupos.flatMap((g) => g.productos.map((p) => p.nombre))).not.toContain('Pie de Manzana')

      await client.query(`update products set disponible = true where slug = 'pie-manzana'`)
      expect((await consultarPrecio(client, tenantId, 'pie de manzana'))?.nombre).toBe('Pie de Manzana')
    })
  })

  it('un tamaño inactivo no se ofrece ni se puede pedir; los demás siguen', async () => {
    await dentroDeTransaccion(async () => {
      const antes = await consultarPrecio(client, tenantId, 'carrot cake')
      expect(antes?.tamanos.map((t) => t.tamano)).toEqual(['Individual', 'Mini 16cm', 'Familiar 24cm'])

      await client.query(
        `update product_sizes set activo = false where tamano = 'Mini 16cm' and product_id = (select id from products where slug = 'torta-carrot-cake')`
      )
      const despues = await consultarPrecio(client, tenantId, 'carrot cake')
      expect(despues?.tamanos.map((t) => t.tamano)).toEqual(['Individual', 'Familiar 24cm'])
      const pedido = await consultarPrecio(client, tenantId, 'carrot cake mini')
      expect(pedido?.tamanoSolicitado?.encontrado).toBe(false) // el producto existe, pero ya no viene en ese tamaño
    })
  })
})

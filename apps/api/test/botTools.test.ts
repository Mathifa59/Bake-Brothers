// Corre contra un Postgres real con la cadena de migraciones completa ya
// aplicada (mismo catálogo real que usa la app) — no contra mocks. Se salta
// automáticamente si no hay DATABASE_URL en el entorno (pnpm test normal, sin
// Docker levantado); para correrlo de verdad:
//   DATABASE_URL=postgresql://postgres:postgres@localhost:PUERTO/postgres pnpm --filter @bakebrothers/api test
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import {
  consultarPrecio,
  consultarDisponibilidad,
  consultarCombo,
  consultarReglasCatering,
  evaluarSemaforoCateringPedido,
} from '../src/bot/tools.js'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

describe.skipIf(!hayBaseDeDatosReal)('bot tools (contra el catálogo real migrado)', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let tenantId: string

  beforeAll(async () => {
    client = await pool.connect()
    const { rows } = await client.query(`select id from tenants where slug = 'bake-brothers'`)
    tenantId = rows[0].id
  })

  afterAll(async () => {
    client.release()
    await pool.end()
  })

  describe('consultarPrecio', () => {
    it('devuelve el precio real de un producto buscado por slug exacto', async () => {
      const real = await client.query(
        `select slug, nombre, precio_base, disponible from products where tenant_id = $1 and slug = 'torta-carrot-cake'`,
        [tenantId]
      )
      const resultado = await consultarPrecio(client, tenantId, 'torta-carrot-cake')
      expect(resultado).not.toBeNull()
      expect(resultado?.nombre).toBe(real.rows[0].nombre)
      expect(resultado?.precioBase).toBe(Number(real.rows[0].precio_base))
      expect(resultado?.disponible).toBe(real.rows[0].disponible)
    })

    it('encuentra el mismo producto por un nombre aproximado', async () => {
      const resultado = await consultarPrecio(client, tenantId, 'carrot cake')
      expect(resultado?.slug).toBe('torta-carrot-cake')
    })

    it('los tamaños devueltos coinciden con product_sizes real (si el producto tiene)', async () => {
      const resultado = await consultarPrecio(client, tenantId, 'torta-carrot-cake')
      const real = await client.query(
        `select tamano, precio from product_sizes
         where product_id = (select id from products where tenant_id = $1 and slug = 'torta-carrot-cake')
           and precio is not null
         order by precio`,
        [tenantId]
      )
      expect(resultado?.tamanos).toEqual(
        real.rows.map((r) => ({ tamano: r.tamano, precio: Number(r.precio) }))
      )
    })

    it('devuelve null para un producto que no existe — nunca inventa un valor', async () => {
      const resultado = await consultarPrecio(client, tenantId, 'producto-que-no-existe-xyz')
      expect(resultado).toBeNull()
    })
  })

  describe('consultarDisponibilidad', () => {
    it('devuelve disponibleGlobal igual a products.disponible', async () => {
      const real = await client.query(
        `select disponible from products where tenant_id = $1 and slug = 'torta-carrot-cake'`,
        [tenantId]
      )
      const resultado = await consultarDisponibilidad(client, tenantId, 'torta-carrot-cake')
      expect(resultado?.disponibleGlobal).toBe(real.rows[0].disponible)
    })

    it('devuelve null para un producto que no existe', async () => {
      const resultado = await consultarDisponibilidad(client, tenantId, 'producto-que-no-existe-xyz')
      expect(resultado).toBeNull()
    })

    it('stockPorSede coincide con la tabla stock real, con y sin filtro de sede', async () => {
      const sede = await client.query(`select id from sedes limit 1`)
      const sedeId = sede.rows[0]?.id as string | undefined
      const resultado = await consultarDisponibilidad(client, tenantId, 'torta-carrot-cake', sedeId)
      const real = await client.query(
        `select se.id as sede_id, se.nombre as sede_nombre, s.disponible, s.cantidad
         from stock s join sedes se on se.id = s.sede_id
         where s.product_id = (select id from products where tenant_id = $1 and slug = 'torta-carrot-cake')
           and se.activo ${sedeId ? 'and se.id = $2' : ''}
         order by se.nombre`,
        sedeId ? [tenantId, sedeId] : [tenantId]
      )
      expect(resultado?.stockPorSede.length).toBe(real.rows.length)
      if (real.rows.length > 0) {
        expect(resultado?.stockPorSede[0]).toEqual({
          sedeId: real.rows[0].sede_id,
          sedeNombre: real.rows[0].sede_nombre,
          disponible: real.rows[0].disponible,
          cantidad: real.rows[0].cantidad === null ? null : Number(real.rows[0].cantidad),
        })
      }
    })
  })

  describe('consultarCombo', () => {
    it('devuelve un combo real con sus items reales', async () => {
      const realCombo = await client.query(`select id, nombre, precio_promo from combos where activo limit 1`)
      const nombreReal = realCombo.rows[0].nombre as string
      const resultado = await consultarCombo(client, nombreReal)
      expect(resultado).not.toBeNull()
      expect(resultado?.nombre).toBe(nombreReal)
      expect(resultado?.precioPromo).toBe(Number(realCombo.rows[0].precio_promo))

      const realItems = await client.query(
        `select count(*)::int as total from combo_items where combo_id = $1`,
        [realCombo.rows[0].id]
      )
      expect(resultado?.items.length).toBe(realItems.rows[0].total)
    })

    it('devuelve null para un combo que no existe', async () => {
      const resultado = await consultarCombo(client, 'combo-que-no-existe-xyz')
      expect(resultado).toBeNull()
    })
  })

  describe('consultarReglasCatering', () => {
    it('devuelve la regla real de un ítem de catering conocido', async () => {
      const real = await client.query(
        `select ci.nombre, r.unidades_minimas, r.necesita_ticket, r.admite_corte_noche_anterior
         from catering_items ci join reglas_catering r on r.catering_item_id = ci.id
         where ci.nombre ilike '%tequeños%'`
      )
      expect(real.rows.length).toBeGreaterThan(0) // confirma que el fixture de la búsqueda existe de verdad
      const resultado = await consultarReglasCatering(client, 'tequeños')
      expect(resultado?.itemNombre).toBe(real.rows[0].nombre)
      expect(resultado?.unidadesMinimas).toBe(Number(real.rows[0].unidades_minimas))
      expect(resultado?.necesitaTicket).toBe(real.rows[0].necesita_ticket)
      expect(resultado?.admiteCorteNocheAnterior).toBe(real.rows[0].admite_corte_noche_anterior)
    })

    it('devuelve null para un ítem de catering que no existe', async () => {
      const resultado = await consultarReglasCatering(client, 'ítem-que-no-existe-xyz')
      expect(resultado).toBeNull()
    })
  })

  describe('evaluarSemaforoCateringPedido (semáforo real, DB + packages/domain)', () => {
    // Fechas calculadas en tiempo de ejecución (no literales) — el test
    // corre en cualquier momento, no solo hoy. Tequeños: mínimo real 25
    // unidades (confirmado en el describe de arriba).
    const fechaFuturaNoDomingo = (diasMinimos: number): string => {
      let d = new Date()
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diasMinimos)
      while (d.getDay() === 0) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    const proximoDomingoDesde = (diasMinimos: number): string => {
      let d = new Date()
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diasMinimos)
      while (d.getDay() !== 0) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }

    it('verde: cantidad de sobra + fecha lejana (ni domingo ni hoy) contra el ítem real', async () => {
      const resultado = await evaluarSemaforoCateringPedido(client, 'tequeños', {
        cantidadSolicitada: 100,
        fechaEntregaISO: fechaFuturaNoDomingo(30),
      })
      expect(resultado).toBe('verde')
    })

    it('rojo: por debajo del mínimo real del ítem (25), aunque la fecha sea perfecta', async () => {
      const resultado = await evaluarSemaforoCateringPedido(client, 'tequeños', {
        cantidadSolicitada: 5,
        fechaEntregaISO: fechaFuturaNoDomingo(30),
      })
      expect(resultado).toBe('rojo')
    })

    it('amarillo: domingo manda, sin importar que la cantidad sea de sobra', async () => {
      const resultado = await evaluarSemaforoCateringPedido(client, 'tequeños', {
        cantidadSolicitada: 100,
        fechaEntregaISO: proximoDomingoDesde(7),
      })
      expect(resultado).toBe('amarillo')
    })

    it('devuelve null para un ítem que no existe — nunca inventa un semáforo', async () => {
      const resultado = await evaluarSemaforoCateringPedido(client, 'ítem-que-no-existe-xyz', {
        cantidadSolicitada: 100,
        fechaEntregaISO: fechaFuturaNoDomingo(30),
      })
      expect(resultado).toBeNull()
    })
  })
})

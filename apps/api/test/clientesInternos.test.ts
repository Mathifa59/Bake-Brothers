// Clientes internos (customers.es_interno, migración 0045): los envíos a un local propio («TIENDA CEDROS», «TIENDA S.
// MARINA») se importan como cualquier mayorista, pero NO son clientes ni ventas. Las 4 funciones de Métricas los dejan
// fuera (probado con roles reales: admin con claims de Supabase) y el importador los marca.
// Todo dentro de una transacción que se revierte. Necesita Postgres con el esquema hasta la 0045 y un rol que pueda
// hacer `set role authenticated` (en local, `postgres`); sin eso se salta.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { importarMayoristas } from '../src/services/importarMayoristas.js'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal = !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

describe.skipIf(!hayBaseDeDatosReal)('clientes internos', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let tenantId: string
  let puede = false
  const ADMIN = '44444444-0000-0000-0000-000000000001'

  beforeAll(async () => {
    client = await pool.connect()
    try {
      await client.query('begin')
      await client.query('set local role authenticated')
      await client.query('reset role')
      await client.query('rollback')
      puede = true
    } catch {
      await client.query('rollback').catch(() => {})
    }
    tenantId = (await client.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
  })
  afterAll(async () => {
    client.release()
    await pool.end()
  })

  const enTransaccion = async (fn: () => Promise<void>) => {
    await client.query('begin')
    try {
      await fn()
    } finally {
      await client.query('rollback')
    }
  }

  async function comoAdmin<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    await client.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [
      JSON.stringify({ sub: ADMIN, role: 'authenticated' }),
      ADMIN,
    ])
    await client.query('set local role authenticated')
    try {
      return (await client.query(sql, params)).rows as T[]
    } finally {
      await client.query('reset role')
    }
  }

  it('las 4 funciones de Métricas dejan fuera los pedidos de clientes internos (y cuentan los demás)', async (ctx) => {
    if (!puede) return ctx.skip()
    await enTransaccion(async () => {
      await client.query(`insert into auth.users (id) values ($1)`, [ADMIN])
      await client.query(`insert into usuarios_dashboard (id, rol, sede_id) values ($1, 'admin', null)`, [ADMIN])
      const sede = (await client.query(`insert into sedes (nombre) values ('TEST internos') returning id`)).rows[0].id
      const producto = (await client.query(`select id, nombre from products where disponible limit 1`)).rows[0]
      const interno = (await client.query(`insert into customers (tenant_id, nombre, es_mayorista, es_interno) values ($1, 'TEST TIENDA PROPIA', true, true) returning id`, [tenantId])).rows[0].id
      const normal = (await client.query(`insert into customers (tenant_id, nombre, telefono) values ($1, 'TEST Cliente Normal', '+51999400701') returning id`, [tenantId])).rows[0].id

      const pedido = async (numero: string, cliente: string, total: number, sedeId: string | null) => {
        const id = (
          await client.query(
            `insert into orders (tenant_id, numero, customer_id, canal, estado, tipo_entrega, sede_id, fecha_entrega, horario_entrega, metodo_pago, subtotal, total)
             values ($1, $2, $3, 'whatsapp', 'confirmed', 'tienda', $4, current_date + 3, '4pm', 'yape', $5, $5) returning id`,
            [tenantId, numero, cliente, sedeId, total]
          )
        ).rows[0].id
        await client.query(
          `insert into order_items (tenant_id, order_id, product_id, nombre_producto, precio_unitario, cantidad) values ($1, $2, $3, $4, $5, 1)`,
          [tenantId, id, producto.id, producto.nombre, total]
        )
      }
      // Con sede: uno interno (100) y uno normal (25). Sin sede: uno interno (50) y uno normal (10).
      await pedido('INT-1', interno, 100, sede)
      await pedido('INT-2', normal, 25, sede)
      await pedido('INT-3', interno, 50, null)
      await pedido('INT-4', normal, 10, null)

      const hoy = `(now() at time zone 'America/Lima')::date`
      const [kpis] = await comoAdmin<{ pedidos: string; ingresos: string }>(`select * from metricas_kpis(${hoy}, ${hoy}, null)`)
      // Solo los dos pedidos normales (25 + 10); los internos (100 + 50) no son ventas.
      expect(Number(kpis.pedidos)).toBe(2)
      expect(Number(kpis.ingresos)).toBe(35)

      const [deLaSede] = await comoAdmin<{ pedidos: string; ingresos: string }>(`select * from metricas_kpis(${hoy}, ${hoy}, $1)`, [sede])
      expect(Number(deLaSede.pedidos)).toBe(1)
      expect(Number(deLaSede.ingresos)).toBe(25)

      const [sinAsignar] = await comoAdmin<{ pedidos: string; ingresos: string }>(`select * from metricas_sin_asignar(${hoy}, ${hoy})`)
      expect(Number(sinAsignar.pedidos)).toBe(1)
      expect(Number(sinAsignar.ingresos)).toBe(10)

      const productos = await comoAdmin<{ cantidad: string; ingresos: string }>(`select * from metricas_productos_vendidos(${hoy}, ${hoy}, null)`)
      expect(productos.reduce((a, p) => a + Number(p.cantidad), 0)).toBe(2) // 2 líneas normales, no las 4
      expect(productos.reduce((a, p) => a + Number(p.ingresos), 0)).toBe(35)

      const dias = await comoAdmin<{ pedidos: string; ingresos: string }>(`select * from metricas_tendencia_diaria(${hoy}, ${hoy}, null)`)
      expect(dias.map((d) => [Number(d.pedidos), Number(d.ingresos)])).toEqual([[2, 35]])
    })
  })

  it('un cliente que NO es interno sigue contando como siempre', async (ctx) => {
    if (!puede) return ctx.skip()
    await enTransaccion(async () => {
      await client.query(`insert into auth.users (id) values ($1)`, [ADMIN])
      await client.query(`insert into usuarios_dashboard (id, rol, sede_id) values ($1, 'admin', null)`, [ADMIN])
      const mayorista = (await client.query(`insert into customers (tenant_id, nombre, es_mayorista) values ($1, 'TEST Mayorista Real', true) returning id`, [tenantId])).rows[0].id
      await client.query(
        `insert into orders (tenant_id, numero, customer_id, canal, estado, tipo_entrega, fecha_entrega, horario_entrega, metodo_pago, subtotal, total)
         values ($1, 'INT-5', $2, 'mayorista', 'confirmed', 'tienda', current_date + 3, '4pm', 'yape', 80, 80)`,
        [tenantId, mayorista]
      )
      const hoy = `(now() at time zone 'America/Lima')::date`
      const [kpis] = await comoAdmin<{ pedidos: string; ingresos: string }>(`select * from metricas_kpis(${hoy}, ${hoy}, null)`)
      expect(Number(kpis.pedidos)).toBe(1)
      expect(Number(kpis.ingresos)).toBe(80)
    })
  })

  it('el importador marca como internos los nombres que se le indican (nuevos y ya existentes), sin tocar a los demás', async () => {
    await enTransaccion(async () => {
      await client.query(`insert into customers (tenant_id, nombre, es_mayorista, tamano_habitual) values ($1, 'TEST TIENDA YA EXISTIA', true, 'Grande')`, [tenantId])
      const filas = [
        { nombre: 'TEST TIENDA NUEVA', tamano: 'GR' },
        { nombre: 'TEST Tienda ya existia', tamano: 'GR' },
        { nombre: 'TEST MAYORISTA COMUN', tamano: 'MED' },
      ]
      const r = await importarMayoristas(client, tenantId, filas, { aplicar: true, internos: ['TEST TIENDA NUEVA', 'TEST TIENDA YA EXISTIA'] })
      expect(r.internos.sort()).toEqual(['TEST TIENDA NUEVA', 'TEST TIENDA YA EXISTIA'])
      const { rows } = await client.query(`select nombre, es_interno from customers where nombre like 'TEST %' order by nombre`)
      expect(rows).toEqual([
        { nombre: 'TEST MAYORISTA COMUN', es_interno: false },
        { nombre: 'TEST TIENDA NUEVA', es_interno: true },
        { nombre: 'TEST TIENDA YA EXISTIA', es_interno: true },
      ])
      // y es idempotente: otra pasada no cambia nada
      const otra = await importarMayoristas(client, tenantId, filas, { aplicar: true, internos: ['TEST TIENDA NUEVA', 'TEST TIENDA YA EXISTIA'] })
      expect(otra.creados).toHaveLength(0)
    })
  })

  it('sin la opción `internos`, nadie se marca (el comportamiento de antes no cambia)', async () => {
    await enTransaccion(async () => {
      await importarMayoristas(client, tenantId, [{ nombre: 'TEST TIENDA SIN OPCION', tamano: 'GR' }], { aplicar: true })
      const { rows } = await client.query(`select es_interno from customers where nombre = 'TEST TIENDA SIN OPCION'`)
      expect(rows).toEqual([{ es_interno: false }])
    })
  })
})

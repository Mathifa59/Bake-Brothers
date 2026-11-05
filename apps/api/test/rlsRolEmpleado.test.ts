// Rol «empleado» (en la base: rol = 'operador'), migración 0038. Se prueba con el rol real `authenticated` y los
// claims del JWT, igual que PostgREST, dentro de una transacción que se deshace — la misma técnica de
// rlsPedidosSinSede.test.ts. Verifica que lo que el panel esconde también esté BLOQUEADO EN LOS DATOS:
//   - las 4 funciones de métricas (RPC) dan «permission denied» a un empleado y funcionan para el admin;
//   - mifact_codigos solo la lee el admin;
//   - las respuestas rápidas las lee todo el personal pero solo las escribe el admin;
//   - lo que el empleado SÍ necesita (pedidos de su sede, stock) sigue funcionando y sigue filtrado por sede.
// Necesita un rol que pueda hacer `set role authenticated` y escribir en auth.users (en local, `postgres`);
// si no puede, el archivo se salta.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

describe.skipIf(!hayBaseDeDatosReal)('rol empleado: bloqueado también en los datos', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let puede = false
  let tenantId: string

  const ADMIN = '33333333-0000-0000-0000-000000000001'
  const EMP_A = '33333333-0000-0000-0000-000000000002'
  const EMP_B = '33333333-0000-0000-0000-000000000003'

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

  async function sembrar() {
    const sedeA = (await client.query(`insert into sedes (nombre) values ('Emp Sede A') returning id`)).rows[0].id
    const sedeB = (await client.query(`insert into sedes (nombre) values ('Emp Sede B') returning id`)).rows[0].id
    for (const id of [ADMIN, EMP_A, EMP_B]) await client.query(`insert into auth.users (id) values ($1)`, [id])
    await client.query(
      `insert into usuarios_dashboard (id, rol, sede_id) values ($1, 'admin', null), ($2, 'operador', $4), ($3, 'operador', $5)`,
      [ADMIN, EMP_A, EMP_B, sedeA, sedeB]
    )
    for (const [clave, sede] of [['A', sedeA], ['B', sedeB]] as const) {
      const cliente = (
        await client.query(`insert into customers (tenant_id, nombre, telefono) values ($1, $2, $3) returning id`, [tenantId, `Emp ${clave}`, `91111${clave.charCodeAt(0)}`])
      ).rows[0].id
      await client.query(
        `insert into orders (tenant_id, numero, customer_id, canal, estado, tipo_entrega, sede_id, fecha_entrega, horario_entrega, metodo_pago, subtotal, total)
         values ($1, $2, $3, 'whatsapp', 'confirmed', 'tienda', $4, current_date + 3, '4pm', 'yape', 10, 10)`,
        [tenantId, `EMP-${clave}`, cliente, sede]
      )
    }
    return { sedeA, sedeB }
  }

  async function como<T>(uid: string, fn: () => Promise<T>): Promise<T> {
    await client.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [
      JSON.stringify({ sub: uid, role: 'authenticated' }),
      uid,
    ])
    await client.query('set local role authenticated')
    try {
      return await fn()
    } finally {
      await client.query('reset role')
    }
  }

  /** Corre una consulta y devuelve las filas o el código de error de Postgres (en un savepoint, para no abortar la transacción). */
  async function probar(uid: string, sql: string, params: unknown[] = []): Promise<{ filas: unknown[] } | { error: string }> {
    return como(uid, async () => {
      await client.query('savepoint p')
      try {
        const r = await client.query(sql, params)
        await client.query('release savepoint p')
        return { filas: r.rows }
      } catch (e) {
        await client.query('rollback to savepoint p')
        return { error: (e as { code?: string }).code ?? String(e) }
      }
    })
  }

  const enTransaccion = async (ctx: { skip: () => void }, fn: () => Promise<void>) => {
    if (!puede) return ctx.skip()
    await client.query('begin')
    try {
      await fn()
    } finally {
      await client.query('rollback')
    }
  }

  const METRICAS = [
    `select * from metricas_kpis(current_date, current_date, null)`,
    `select * from metricas_productos_vendidos(current_date, current_date, null)`,
    `select * from metricas_tendencia_diaria(current_date, current_date, null)`,
    `select * from metricas_sin_asignar(current_date, current_date)`,
  ]

  it('métricas: un empleado recibe «permission denied» en las 4 funciones, aunque pida solo su sede; el admin sí las usa', async (ctx) => {
    await enTransaccion(ctx, async () => {
      const { sedeA } = await sembrar()
      for (const sql of METRICAS) {
        expect(await probar(EMP_A, sql)).toEqual({ error: '42501' })
        expect(await probar(EMP_B, sql)).toEqual({ error: '42501' })
        expect('filas' in (await probar(ADMIN, sql))).toBe(true)
      }
      expect(await probar(EMP_A, `select * from metricas_kpis(current_date, current_date, $1)`, [sedeA])).toEqual({ error: '42501' })
      // quien no es del panel (sin fila en usuarios_dashboard) tampoco
      await client.query(`insert into auth.users (id) values ('33333333-0000-0000-0000-0000000000ff')`)
      expect(await probar('33333333-0000-0000-0000-0000000000ff', METRICAS[0])).toEqual({ error: '42501' })
    })
  })

  it('códigos de Mifact: el empleado no ve ninguna fila; el admin sí', async (ctx) => {
    await enTransaccion(ctx, async () => {
      await sembrar()
      const producto = (await client.query(`select id from products where tenant_id = $1 limit 1`, [tenantId])).rows[0].id
      await client.query(`insert into mifact_codigos (product_id, almacen, codigo) values ($1, 'CENTRAL', 'EMP-TEST-1')`, [producto])
      expect(await probar(EMP_A, `select codigo from mifact_codigos where codigo = 'EMP-TEST-1'`)).toEqual({ filas: [] })
      expect(await probar(ADMIN, `select codigo from mifact_codigos where codigo = 'EMP-TEST-1'`)).toEqual({ filas: [{ codigo: 'EMP-TEST-1' }] })
    })
  })

  it('respuestas rápidas: todo el personal las lee, solo el admin crea / edita / borra', async (ctx) => {
    await enTransaccion(ctx, async () => {
      await sembrar()
      const lectura = await probar(EMP_A, `select titulo from respuestas_rapidas`)
      expect('filas' in lectura && lectura.filas.length >= 1).toBe(true)

      // el empleado no puede escribir: el INSERT lo frena el WITH CHECK, el UPDATE/DELETE no encuentran filas visibles para él
      const insertar = await probar(EMP_A, `insert into respuestas_rapidas (titulo, texto) values ('Mía', 'hola')`)
      expect('error' in insertar).toBe(true)
      expect(await probar(EMP_A, `update respuestas_rapidas set texto = 'cambiado' returning id`)).toEqual({ filas: [] })
      expect(await probar(EMP_A, `delete from respuestas_rapidas returning id`)).toEqual({ filas: [] })

      // el admin sí
      const creada = await probar(ADMIN, `insert into respuestas_rapidas (titulo, texto) values ('Admin', 'hola') returning id`)
      expect('filas' in creada && creada.filas.length === 1).toBe(true)
      const editada = await probar(ADMIN, `update respuestas_rapidas set texto = 'editado' where titulo = 'Admin' returning texto`)
      expect(editada).toEqual({ filas: [{ texto: 'editado' }] })
      const borrada = await probar(ADMIN, `delete from respuestas_rapidas where titulo = 'Admin' returning titulo`)
      expect(borrada).toEqual({ filas: [{ titulo: 'Admin' }] })
    })
  })

  it('lo que el empleado SÍ usa sigue funcionando y filtrado por su sede: pedidos y stock', async (ctx) => {
    await enTransaccion(ctx, async () => {
      const { sedeA } = await sembrar()
      expect(await probar(EMP_A, `select numero from orders where numero like 'EMP-%' order by 1`)).toEqual({ filas: [{ numero: 'EMP-A' }] })
      expect(await probar(EMP_B, `select numero from orders where numero like 'EMP-%' order by 1`)).toEqual({ filas: [{ numero: 'EMP-B' }] })
      expect(await probar(ADMIN, `select numero from orders where numero like 'EMP-%' order by 1`)).toEqual({ filas: [{ numero: 'EMP-A' }, { numero: 'EMP-B' }] })

      const producto = (await client.query(`select id from products where tenant_id = $1 limit 1`, [tenantId])).rows[0].id
      await client.query(`insert into stock (sede_id, product_id, disponible) values ($1, $2, true)`, [sedeA, producto])
      const propio = await probar(EMP_A, `update stock set disponible = false where sede_id = $1 returning disponible`, [sedeA])
      expect(propio).toEqual({ filas: [{ disponible: false }] })
      // el empleado de la otra sede no ve ni toca el stock ajeno
      expect(await probar(EMP_B, `update stock set disponible = true where sede_id = $1 returning disponible`, [sedeA])).toEqual({ filas: [] })
    })
  })
})

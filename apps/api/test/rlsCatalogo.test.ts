// 0032_rls_catalogo: RLS en products, product_sizes, catering_items, combo_items,
// combos y sedes. Se prueba con los roles REALES (SET ROLE), no solo mirando el
// catálogo de políticas:
//   - app_api (la API y el bot) sigue leyendo — y escribiendo donde ya podía —,
//   - authenticated del personal (está en usuarios_dashboard) lee,
//   - authenticated que NO es del personal (cualquier sesión) ve 0 filas,
//   - nadie escribe desde el navegador, y anon no entra.
// Corre contra un Postgres con el esquema y el fixture local de auth (Docker); todo
// dentro de una transacción que se revierte, no deja nada.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

const TABLAS = ['products', 'product_sizes', 'catering_items', 'combo_items', 'combos', 'sedes'] as const

describe.skipIf(!hayBaseDeDatosReal)('0032 — RLS del catálogo con roles reales', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  const personalAdmin = randomUUID()
  const personalOperador = randomUUID()
  const sesionSinPanel = randomUUID() // tiene cuenta (authenticated) pero NO está en usuarios_dashboard

  beforeAll(async () => {
    client = await pool.connect()
    await client.query('begin')
    const sedeId = (await client.query(`select id from sedes where nombre = 'Cedros'`)).rows[0].id
    await client.query(`insert into auth.users (id, email) values ($1, 'admin-rls@test.local'), ($2, 'op-rls@test.local'), ($3, 'sin-panel-rls@test.local')`, [
      personalAdmin, personalOperador, sesionSinPanel,
    ])
    await client.query(`insert into usuarios_dashboard (id, rol, sede_id) values ($1, 'admin', null), ($2, 'operador', $3)`, [
      personalAdmin, personalOperador, sedeId,
    ])
  })

  afterAll(async () => {
    await client.query('rollback')
    client.release()
    await pool.end()
  })

  /** Ejecuta `fn` como el rol dado (con claims de JWT si es authenticated) y vuelve a postgres. */
  async function como<T>(rol: 'app_api' | 'authenticated' | 'anon', uid: string | null, fn: () => Promise<T>): Promise<T> {
    await client.query('savepoint s')
    try {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid, role: rol } : {})])
      await client.query(`set local role ${rol}`)
      return await fn()
    } finally {
      // Primero el rollback (si la consulta falló, la transacción quedó abortada y ni "reset role" correría).
      await client.query('rollback to savepoint s')
      await client.query('reset role')
    }
  }
  const contar = async (tabla: string) => Number((await client.query(`select count(*) from ${tabla}`)).rows[0].count)

  it('RLS está activa en las 6 tablas, cada una con su política de app_api y la de lectura del personal', async () => {
    for (const t of TABLAS) {
      const { rows } = await client.query(
        `select c.relrowsecurity, (select array_agg(polname::text order by polname::text) from pg_policy p where p.polrelid = c.oid) as politicas
         from pg_class c where c.relname = $1`,
        [t]
      )
      expect(rows[0].relrowsecurity, t).toBe(true)
      expect(rows[0].politicas, t).toEqual([`app_api_${t}`, `personal_lee_${t}`])
    }
  })

  it.each(TABLAS)('app_api (la API y el bot) sigue leyendo %s', async (t) => {
    expect(await como('app_api', null, () => contar(t))).toBeGreaterThan(0)
  })

  it('app_api sigue escribiendo donde ya podía (UPDATE de products, INSERT de combos)', async () => {
    const r = await como('app_api', null, async () => {
      const upd = await client.query(`update products set orden = orden where slug = 'alfajor-mix'`)
      const ins = await client.query(`insert into combos (nombre, precio_normal, precio_promo, canal_permitido, permite_cambios, activo) values ('rls-test', 1, 1, 'ambos', false, false)`)
      return { upd: upd.rowCount, ins: ins.rowCount }
    })
    expect(r).toEqual({ upd: 1, ins: 1 })
  })

  it.each(TABLAS)('el personal del panel (admin y operador) lee %s', async (t) => {
    const total = await contar(t)
    expect(await como('authenticated', personalAdmin, () => contar(t))).toBe(total)
    expect(await como('authenticated', personalOperador, () => contar(t))).toBe(total)
  })

  it.each(TABLAS)('una sesión que NO es del personal ve 0 filas de %s', async (t) => {
    expect(await como('authenticated', sesionSinPanel, () => contar(t))).toBe(0)
  })

  it('las consultas reales del dashboard siguen funcionando para el personal (joins con sedes, productos y tamaños)', async () => {
    const r = await como('authenticated', personalOperador, async () => {
      const prod = await client.query(`select p.slug, count(ps.id)::int as tamanos from products p left join product_sizes ps on ps.product_id = p.id where p.slug = 'alfajor-mix' group by p.slug`)
      const sedes = await client.query(`select u.rol, s.nombre from usuarios_dashboard u left join sedes s on s.id = u.sede_id where u.id = $1`, [personalOperador])
      const combos = await client.query(`select c.nombre, count(ci.id)::int as items from combos c left join combo_items ci on ci.combo_id = c.id where c.activo group by c.nombre`)
      return { prod: prod.rows[0], sede: sedes.rows[0], combos: combos.rows.length }
    })
    expect(r.prod).toEqual({ slug: 'alfajor-mix', tamanos: 2 })
    expect(r.sede).toEqual({ rol: 'operador', nombre: 'Cedros' })
    expect(r.combos).toBeGreaterThan(0)
  })

  it.each(TABLAS)('nadie escribe %s desde el navegador (authenticated no tiene INSERT/UPDATE/DELETE)', async (t) => {
    for (const sql of [`delete from ${t}`, `update ${t} set id = id`]) {
      await expect(como('authenticated', personalAdmin, () => client.query(sql)), sql).rejects.toThrow(/permission denied/)
    }
  })

  it.each(TABLAS)('anon (sin sesión) no entra a %s', async (t) => {
    await expect(como('anon', null, () => contar(t))).rejects.toThrow(/permission denied/)
  })

  // 0033: tabla nueva con los códigos de Mifact — misma regla que el catálogo (0032).
  it('mifact_codigos: RLS activa; app_api y el personal leen; una sesión sin panel ve 0; anon no entra; nadie escribe desde el navegador', async () => {
    const prod = (await client.query(`select id from products limit 1`)).rows[0].id
    await client.query(`insert into mifact_codigos (product_id, almacen, codigo) values ($1, 'central', 'RLS-TEST-MIFACT')`, [prod])
    expect((await client.query(`select relrowsecurity from pg_class where relname = 'mifact_codigos'`)).rows[0].relrowsecurity).toBe(true)
    expect(await como('app_api', null, () => contar('mifact_codigos'))).toBeGreaterThan(0)
    expect(await como('authenticated', personalAdmin, () => contar('mifact_codigos'))).toBeGreaterThan(0)
    expect(await como('authenticated', sesionSinPanel, () => contar('mifact_codigos'))).toBe(0)
    await expect(como('anon', null, () => contar('mifact_codigos'))).rejects.toThrow(/permission denied/)
    for (const sql of ['delete from mifact_codigos', `update mifact_codigos set almacen = 'x'`]) {
      await expect(como('authenticated', personalAdmin, () => client.query(sql)), sql).rejects.toThrow(/permission denied/)
    }
  })
})

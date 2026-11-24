// Reglas de porcionado (migración 0057) con el rol REAL `authenticated` y los claims del JWT (como PostgREST), dentro de
// transacciones que se deshacen: solo Administración las edita; las leen Administración y quien trabaja con Stock; el
// historial de porcionados no lo toca el panel. Necesita un rol que pueda hacer `set role authenticated` (en local,
// `postgres`); si no puede, el archivo se salta.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal = !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

const U = {
  admin: '99999999-0057-0000-0000-000000000001',
  adminInactivo: '99999999-0057-0000-0000-000000000002',
  caja: '99999999-0057-0000-0000-000000000003',
  ventas: '99999999-0057-0000-0000-000000000004',
  produccion: '99999999-0057-0000-0000-000000000005',
}

describe.skipIf(!hayBaseDeDatosReal)('porcionado en la base: quién lee y quién edita las reglas', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL })
  let client: pg.PoolClient
  let puede = false

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
  })
  afterAll(async () => {
    client.release()
    await pool.end()
  })

  async function sembrar() {
    for (const id of Object.values(U)) await client.query(`insert into auth.users (id) values ($1)`, [id])
    const sede = (await client.query(`insert into sedes (nombre) values ('Porcionado RLS') returning id`)).rows[0].id as string
    const cuentas: [string, string[], string | null, boolean][] = [
      [U.admin, ['administracion'], null, true],
      [U.adminInactivo, ['administracion'], null, false],
      [U.caja, ['caja'], sede, true],
      [U.ventas, ['venta_digital'], null, true],
      [U.produccion, ['produccion'], sede, true],
    ]
    for (const [id, perfiles, sedeId, activo] of cuentas)
      await client.query(`insert into usuarios_dashboard (id, rol, sede_id, perfiles, activo) values ($1, $2, $3, $4, $5)`, [id, perfiles.includes('administracion') ? 'admin' : 'operador', sedeId, perfiles, activo])
    const regla = (await client.query(`select id, product_id, size_entero_id, size_porcion_id from porcionado_reglas limit 1`)).rows[0]
    return { sede, regla }
  }

  async function probar(uid: string, sql: string, params: unknown[] = []): Promise<{ n: number } | { error: string }> {
    await client.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' }), uid])
    await client.query('set local role authenticated')
    try {
      await client.query('savepoint p')
      try {
        const r = await client.query(sql, params)
        await client.query('release savepoint p')
        return { n: r.rowCount ?? r.rows.length }
      } catch (e) {
        await client.query('rollback to savepoint p')
        return { error: (e as { code?: string }).code ?? String(e) }
      }
    } finally {
      await client.query('reset role')
    }
  }

  const enTransaccion = async (ctx: { skip: () => void }, fn: (m: Awaited<ReturnType<typeof sembrar>>) => Promise<void>) => {
    if (!puede) return ctx.skip()
    await client.query('begin')
    try {
      await fn(await sembrar())
    } finally {
      await client.query('rollback')
    }
  }

  it('las leen Administración y Caja; Ventas y Producción no ven ninguna', async (ctx) => {
    await enTransaccion(ctx, async () => {
      const todas = Number((await client.query(`select count(*) from porcionado_reglas`)).rows[0].count)
      expect(todas).toBeGreaterThan(0)
      expect(await probar(U.admin, `select 1 from porcionado_reglas`)).toEqual({ n: todas })
      expect(await probar(U.caja, `select 1 from porcionado_reglas`)).toEqual({ n: todas })
      expect(await probar(U.ventas, `select 1 from porcionado_reglas`)).toEqual({ n: 0 })
      expect(await probar(U.produccion, `select 1 from porcionado_reglas`)).toEqual({ n: 0 })
      expect(await probar(U.adminInactivo, `select 1 from porcionado_reglas`)).toEqual({ n: 0 })
    })
  })

  it('solo Administración activa edita: cambia el rendimiento y la base sella quién; Caja y los demás no', async (ctx) => {
    await enTransaccion(ctx, async ({ regla }) => {
      expect(await probar(U.admin, `update porcionado_reglas set porciones = 9 where id = '${regla.id}'`)).toEqual({ n: 1 })
      const { rows } = await client.query(`select porciones, actualizado_por from porcionado_reglas where id = $1`, [regla.id])
      expect(rows[0]).toMatchObject({ porciones: 9, actualizado_por: U.admin })
      for (const uid of [U.caja, U.ventas, U.produccion, U.adminInactivo]) {
        const r = await probar(uid, `update porcionado_reglas set porciones = 99 where id = '${regla.id}'`)
        expect('error' in r || r.n === 0, uid).toBe(true)
      }
      expect((await client.query(`select porciones from porcionado_reglas where id = $1`, [regla.id])).rows[0].porciones).toBe(9)
    })
  })

  it('nadie del panel crea una regla si no es Administración; y ninguna regla se borra desde el panel', async (ctx) => {
    await enTransaccion(ctx, async ({ regla }) => {
      const nueva = `insert into porcionado_reglas (product_id, size_entero_id, size_porcion_id, porciones) select product_id, size_porcion_id, size_entero_id, 3 from porcionado_reglas where id = '${regla.id}'`
      const deCaja = await probar(U.caja, nueva)
      expect('error' in deCaja).toBe(true)
      expect(await probar(U.admin, `delete from porcionado_reglas where id = '${regla.id}'`)).toEqual({ error: '42501' })
      expect(await probar(U.caja, `delete from porcionado_reglas where id = '${regla.id}'`)).toEqual({ error: '42501' })
    })
  })

  it('el historial de porcionados no lo lee ni lo escribe nadie del panel (ni Administración)', async (ctx) => {
    await enTransaccion(ctx, async () => {
      for (const uid of [U.admin, U.caja]) {
        expect(await probar(uid, `select 1 from porcionados`), uid).toEqual({ error: '42501' })
        expect(await probar(uid, `delete from porcionados`), uid).toEqual({ error: '42501' })
      }
    })
  })
})

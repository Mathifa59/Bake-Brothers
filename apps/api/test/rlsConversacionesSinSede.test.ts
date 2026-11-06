// RLS de `conversaciones` con el número del bot (migración 0030, sección 5): una conversación SIN sede
// la ven y la atienden todos los del personal; una CON sede sigue siendo solo del admin y de los
// operadores de esa sede (0017). Se prueba con el rol real `authenticated` y claims de JWT, igual que
// lo hace PostgREST — dentro de una transacción que se deshace.
//
// Necesita un rol que pueda hacer `set role authenticated` y escribir en auth.users (en local, el
// superusuario `postgres`; en CI/Supabase real NO se corre). Si no puede, el archivo se salta.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

describe.skipIf(!hayBaseDeDatosReal)('RLS de conversaciones — conversaciones sin sede (número del bot)', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let puede = false
  let tenantId: string

  // ids fijos de prueba
  const ADMIN = '11111111-0000-0000-0000-000000000001'
  const OP_A = '11111111-0000-0000-0000-000000000002'
  const OP_B = '11111111-0000-0000-0000-000000000003'

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

  /** Arma, dentro de la transacción, 2 sedes, 3 usuarios del panel y 3 conversaciones (A, B y sin sede). */
  async function sembrar() {
    const sedeA = (await client.query(`insert into sedes (nombre) values ('RLS Sede A') returning id`)).rows[0].id
    const sedeB = (await client.query(`insert into sedes (nombre) values ('RLS Sede B') returning id`)).rows[0].id
    for (const id of [ADMIN, OP_A, OP_B]) await client.query(`insert into auth.users (id) values ($1)`, [id])
    await client.query(
      `insert into usuarios_dashboard (id, rol, sede_id) values ($1, 'admin', null), ($2, 'operador', $4), ($3, 'operador', $5)`,
      [ADMIN, OP_A, OP_B, sedeA, sedeB]
    )
    const ins = async (ext: string, sede: string | null) =>
      (
        await client.query(
          `insert into conversaciones (tenant_id, canal, external_id, estado, historial, sede_id)
           values ($1, 'whatsapp', $2, 'escalada', '[]'::jsonb, $3) returning id`,
          [tenantId, ext, sede]
        )
      ).rows[0].id as string
    return { sedeA, sedeB, convA: await ins('rls-a', sedeA), convB: await ins('rls-b', sedeB), convSin: await ins('rls-sin', null) }
  }

  /** Corre `fn` como el usuario (rol authenticated + claim sub), igual que PostgREST. */
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

  const vistas = async () =>
    (await client.query(`select external_id from conversaciones where external_id like 'rls-%' order by 1`)).rows.map(
      (r) => r.external_id as string
    )

  it('cada quien ve lo suyo: admin todo; operador su sede + las sin sede', async (ctx) => {
    if (!puede) return ctx.skip()
    await client.query('begin')
    try {
      await sembrar()
      expect(await como(ADMIN, vistas)).toEqual(['rls-a', 'rls-b', 'rls-sin'])
      expect(await como(OP_A, vistas)).toEqual(['rls-a', 'rls-sin'])
      expect(await como(OP_B, vistas)).toEqual(['rls-b', 'rls-sin'])
    } finally {
      await client.query('rollback')
    }
  })

  it('un operador puede tomar una conversación sin sede, pero no la de otra sede', async (ctx) => {
    if (!puede) return ctx.skip()
    await client.query('begin')
    try {
      const { convA, convSin } = await sembrar()
      const tomar = (uid: string, id: string) =>
        como(uid, async () => {
          const r = await client.query(`update conversaciones set estado = 'atendida_por_operador' where id = $1`, [id])
          return r.rowCount
        })
      expect(await tomar(OP_B, convSin)).toBe(1)
      expect(await tomar(OP_B, convA)).toBe(0) // otra sede: ni la ve, no la actualiza
      expect(await tomar(OP_A, convA)).toBe(1)
    } finally {
      await client.query('rollback')
    }
  })
})

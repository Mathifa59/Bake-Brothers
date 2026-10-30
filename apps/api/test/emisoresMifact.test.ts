// Emisores de Mifact por sede (0037): cada sede con su razón social, RUC, series y token. La tabla es SOLO de la
// API (el token no llega nunca al panel) y el token se guarda cifrado. Postgres real, dentro de transacciones
// que se deshacen; el archivo se salta sin DATABASE_URL.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

const { guardarCredencialesEmisor, emisorDeSede, emisoresMifact, tokenDelEmisor, EmisorNoEncontradoError } = await import(
  '../src/repositories/emisoresMifactRepo.js'
)

describe.skipIf(!hayBaseDeDatosReal)('emisores_mifact (Postgres real)', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let cedrosId: string
  let santaMarinaId: string

  beforeAll(async () => {
    client = await pool.connect()
    cedrosId = (await client.query(`select id from sedes where nombre = 'Cedros'`)).rows[0].id
    santaMarinaId = (await client.query(`select id from sedes where nombre = 'Santa Marina'`)).rows[0].id
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

  it('cada sede ya tiene su razón social, y ningún dato inventado: RUC, series y token vacíos', async () => {
    const cedros = await emisorDeSede(pool, cedrosId)
    const santaMarina = await emisorDeSede(pool, santaMarinaId)
    expect(cedros).toMatchObject({ razonSocial: 'Corporación Hermanos Loarte S.A.C.', ruc: null, serieBoleta: null, serieFactura: null, tieneToken: false })
    expect(santaMarina).toMatchObject({ razonSocial: 'Baker Brothers E.I.R.L.', ruc: null, tieneToken: false })
    expect((await emisoresMifact(pool)).map((e) => e.razonSocial)).toEqual(
      expect.arrayContaining(['Corporación Hermanos Loarte S.A.C.', 'Baker Brothers E.I.R.L.'])
    )
  })

  it('guarda RUC y series por sede, y solo toca lo que se pasa', async () => {
    await enTransaccion(async () => {
      const a = await guardarCredencialesEmisor(client, cedrosId, { ruc: '20123456789', serieBoleta: 'B001' })
      expect(a).toMatchObject({ ruc: '20123456789', serieBoleta: 'B001', serieFactura: null })
      const b = await guardarCredencialesEmisor(client, cedrosId, { serieFactura: 'F001' })
      expect(b).toMatchObject({ ruc: '20123456789', serieBoleta: 'B001', serieFactura: 'F001' }) // lo anterior sigue
      // la otra sede no se tocó
      expect(await emisorDeSede(client, santaMarinaId)).toMatchObject({ ruc: null })
    })
  })

  it('el token se guarda CIFRADO (nunca en claro) y vuelve igual con tokenDelEmisor; el emisor solo dice si hay token', async () => {
    await enTransaccion(async () => {
      const e = await guardarCredencialesEmisor(client, cedrosId, { token: 'token-secreto-de-prueba' })
      expect(e.tieneToken).toBe(true)
      expect(JSON.stringify(e)).not.toContain('token-secreto-de-prueba')
      const { rows } = await client.query(`select token_cifrado from emisores_mifact where sede_id = $1`, [cedrosId])
      expect(rows[0].token_cifrado).not.toContain('token-secreto-de-prueba')
      expect(await tokenDelEmisor(client, cedrosId)).toBe('token-secreto-de-prueba')
    })
  })

  it('la base rechaza formatos inválidos y un RUC repetido en otra sede', async () => {
    await enTransaccion(async () => {
      await client.query('savepoint a')
      await expect(guardarCredencialesEmisor(client, cedrosId, { ruc: '123' })).rejects.toMatchObject({ code: '23514' })
      await client.query('rollback to savepoint a')
      await expect(guardarCredencialesEmisor(client, cedrosId, { serieBoleta: 'F001' })).rejects.toMatchObject({ code: '23514' })
      await client.query('rollback to savepoint a')
      await expect(guardarCredencialesEmisor(client, cedrosId, { serieFactura: 'B001' })).rejects.toMatchObject({ code: '23514' })
      await client.query('rollback to savepoint a')
      await guardarCredencialesEmisor(client, cedrosId, { ruc: '20123456789' })
      await expect(guardarCredencialesEmisor(client, santaMarinaId, { ruc: '20123456789' })).rejects.toMatchObject({ code: '23505' })
    })
  })

  it('una sede sin emisor falla con un error claro', async () => {
    await enTransaccion(async () => {
      await expect(guardarCredencialesEmisor(client, '00000000-0000-0000-0000-000000000000', { ruc: '20123456789' })).rejects.toBeInstanceOf(
        EmisorNoEncontradoError
      )
    })
  })

  it('anon y authenticated NO tienen ningún permiso sobre la tabla (tiene un token): solo la API', async () => {
    const { rows } = await client.query(
      `select grantee, privilege_type from information_schema.role_table_grants
       where table_schema = 'public' and table_name = 'emisores_mifact' and grantee in ('anon', 'authenticated', 'public')`
    )
    expect(rows).toEqual([])
    const api = await client.query(
      `select privilege_type from information_schema.role_table_grants
       where table_schema = 'public' and table_name = 'emisores_mifact' and grantee = 'app_api'`
    )
    expect(api.rows.map((r) => r.privilege_type).sort()).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE'])
  })
})

// whatsapp_conexiones contra Postgres real (migración 0030): el token se guarda
// CIFRADO, se descifra al enviar, cada número usa el suyo, y las reglas de
// "una conexión activa por sede / un número en una sola sede" las sostiene
// la base, no solo el código. Se salta si falta DATABASE_URL real, igual que
// el resto de tests contra Postgres. Necesita un rol miembro de app_api con
// select/insert/update en whatsapp_conexiones y sedes, más DELETE en esas dos
// tablas para limpiar lo que crea (mismo criterio que test/webhookWhatsApp.test.ts).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { registrarConexionWhatsApp, conexionActivaPorPhoneNumberId, SedeNoEncontradaError } = await import(
  '../src/repositories/whatsappConexionesRepo.js'
)
const { cifrarTokenWhatsApp, obtenerTokenWhatsApp, ConexionWhatsAppNoEncontradaError } = await import(
  '../src/bot/tokensWhatsApp.js'
)
const { enviarMensajeMeta } = await import('../src/bot/meta.js')
const { buildApp } = await import('../src/app.js')
const { exigirAdmin } = await import('../src/auth/verificarJwtOperador.js')

describe.skipIf(!hayBaseDeDatosReal)('whatsapp_conexiones — token cifrado por número (real)', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const PHONE_A = 'TEST_CONEX_PHONE_A'
  const PHONE_B = 'TEST_CONEX_PHONE_B'
  let sedeA: string
  let sedeB: string

  const registrar = async (datos: Parameters<typeof registrarConexionWhatsApp>[1]) => {
    const client = await pool.connect()
    try {
      await client.query('begin')
      const c = await registrarConexionWhatsApp(client, datos)
      await client.query('commit')
      return c
    } catch (e) {
      await client.query('rollback')
      throw e
    } finally {
      client.release()
    }
  }

  const limpiar = async () => {
    await pool.query(`delete from whatsapp_conexiones where phone_number_id in ($1, $2)`, [PHONE_A, PHONE_B])
    await pool.query(`update sedes set whatsapp_phone_number_id = null, whatsapp_waba_id = null where id = any($1)`, [
      [sedeA, sedeB],
    ])
  }

  beforeAll(async () => {
    sedeA = (await pool.query(`insert into sedes (nombre) values ('TEST conexiones A') returning id`)).rows[0].id
    sedeB = (await pool.query(`insert into sedes (nombre) values ('TEST conexiones B') returning id`)).rows[0].id
  })

  afterAll(async () => {
    await limpiar()
    await pool.query(`delete from sedes where id = any($1)`, [[sedeA, sedeB]])
    await pool.end()
  })

  beforeEach(limpiar)
  afterEach(() => mockFetch.mockReset())

  it('guarda el token CIFRADO (nunca en claro) y deja la sede apuntando al número', async () => {
    const token = 'EAAG-token-de-negocio-secreto-A'
    await registrar({
      sedeId: sedeA,
      wabaId: 'WABA_A',
      phoneNumberId: PHONE_A,
      tokenCifrado: cifrarTokenWhatsApp(token),
      tipoToken: 'negocio',
      origen: 'embedded_signup',
    })

    const { rows } = await pool.query(`select token_cifrado from whatsapp_conexiones where phone_number_id = $1`, [PHONE_A])
    expect(rows[0].token_cifrado).not.toContain(token)
    expect(rows[0].token_cifrado.startsWith('v1.')).toBe(true)

    const sede = (await pool.query(`select whatsapp_phone_number_id, whatsapp_waba_id from sedes where id = $1`, [sedeA])).rows[0]
    expect(sede).toEqual({ whatsapp_phone_number_id: PHONE_A, whatsapp_waba_id: 'WABA_A' })

    // ida y vuelta real: lo que sale de la base descifra al token original
    await expect(obtenerTokenWhatsApp(PHONE_A)).resolves.toBe(token)
  })

  it('enviarMensajeMeta usa el token real de ESE número, sacado de la base', async () => {
    await registrar({
      sedeId: sedeA, wabaId: 'WABA_A', phoneNumberId: PHONE_A,
      tokenCifrado: cifrarTokenWhatsApp('token-sede-A'), tipoToken: 'negocio', origen: 'embedded_signup',
    })
    await registrar({
      sedeId: sedeB, wabaId: 'WABA_B', phoneNumberId: PHONE_B,
      tokenCifrado: cifrarTokenWhatsApp('token-sede-B'), tipoToken: 'prueba', origen: 'manual',
    })
    mockFetch.mockResolvedValue({ ok: true, text: async () => '{"messages":[{"id":"wamid.X"}]}' })

    await enviarMensajeMeta('whatsapp', PHONE_A, '51900000001', 'hola A')
    const r = await enviarMensajeMeta('whatsapp', PHONE_B, '51900000002', 'hola B')

    const auth = mockFetch.mock.calls.map(([, o]) => (o as { headers: Record<string, string> }).headers.Authorization)
    expect(auth).toEqual(['Bearer token-sede-A', 'Bearer token-sede-B'])
    expect(r.wamid).toBe('wamid.X')
  })

  it('un número sin conexión NO envía y falla visible (fetch nunca se llama)', async () => {
    await expect(enviarMensajeMeta('whatsapp', 'NUMERO_SIN_CONEXION', '51900000001', 'hola')).rejects.toThrow(
      ConexionWhatsAppNoEncontradaError
    )
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('una conexión desconectada deja de servir para enviar', async () => {
    await registrar({
      sedeId: sedeA, wabaId: 'W', phoneNumberId: PHONE_A,
      tokenCifrado: cifrarTokenWhatsApp('t'), tipoToken: 'prueba', origen: 'manual',
    })
    await pool.query(`update whatsapp_conexiones set estado = 'desconectada' where phone_number_id = $1`, [PHONE_A])
    await expect(obtenerTokenWhatsApp(PHONE_A)).rejects.toThrow(ConexionWhatsAppNoEncontradaError)
    expect(await conexionActivaPorPhoneNumberId(pool, PHONE_A)).toBeNull()
  })

  it('volver a registrar el mismo número rota el token (no duplica la fila)', async () => {
    const base = { sedeId: sedeA, wabaId: 'W', phoneNumberId: PHONE_A, tipoToken: 'prueba' as const, origen: 'manual' as const }
    await registrar({ ...base, tokenCifrado: cifrarTokenWhatsApp('token-viejo') })
    await registrar({ ...base, tokenCifrado: cifrarTokenWhatsApp('token-nuevo') })

    expect((await pool.query(`select count(*)::int as n from whatsapp_conexiones where phone_number_id = $1`, [PHONE_A])).rows[0].n).toBe(1)
    await expect(obtenerTokenWhatsApp(PHONE_A)).resolves.toBe('token-nuevo')
  })

  it('una sola conexión ACTIVA por sede: conectar otro número a la misma sede desconecta el anterior', async () => {
    const comun = { sedeId: sedeA, wabaId: 'W', tipoToken: 'prueba' as const, origen: 'manual' as const }
    await registrar({ ...comun, phoneNumberId: PHONE_A, tokenCifrado: cifrarTokenWhatsApp('a') })
    await registrar({ ...comun, phoneNumberId: PHONE_B, tokenCifrado: cifrarTokenWhatsApp('b') })

    const estados = (await pool.query(`select phone_number_id, estado from whatsapp_conexiones where phone_number_id in ($1,$2) order by 1`, [PHONE_A, PHONE_B])).rows
    expect(estados).toEqual([
      { phone_number_id: PHONE_A, estado: 'desconectada' },
      { phone_number_id: PHONE_B, estado: 'activa' },
    ])
    expect((await pool.query(`select whatsapp_phone_number_id from sedes where id = $1`, [sedeA])).rows[0].whatsapp_phone_number_id).toBe(PHONE_B)
  })

  it('un número pertenece a una sola sede: moverlo deja a la sede anterior sin número', async () => {
    const comun = { wabaId: 'W', phoneNumberId: PHONE_A, tipoToken: 'prueba' as const, origen: 'manual' as const }
    await registrar({ ...comun, sedeId: sedeA, tokenCifrado: cifrarTokenWhatsApp('x') })
    await registrar({ ...comun, sedeId: sedeB, tokenCifrado: cifrarTokenWhatsApp('x') })

    const a = (await pool.query(`select whatsapp_phone_number_id from sedes where id = $1`, [sedeA])).rows[0]
    const b = (await pool.query(`select whatsapp_phone_number_id from sedes where id = $1`, [sedeB])).rows[0]
    expect(a.whatsapp_phone_number_id).toBeNull()
    expect(b.whatsapp_phone_number_id).toBe(PHONE_A)
    expect((await conexionActivaPorPhoneNumberId(pool, PHONE_A))?.sedeId).toBe(sedeB)
  })

  it('una sede inexistente se rechaza sin dejar nada a medias', async () => {
    await expect(
      registrar({
        sedeId: '00000000-0000-0000-0000-000000000000', wabaId: 'W', phoneNumberId: PHONE_A,
        tokenCifrado: cifrarTokenWhatsApp('x'), tipoToken: 'prueba', origen: 'manual',
      })
    ).rejects.toThrow(SedeNoEncontradaError)
    expect(await conexionActivaPorPhoneNumberId(pool, PHONE_A)).toBeNull()
  })

  it('POST /api/dashboard/whatsapp/conexiones/manual exige JWT (401 sin Authorization, nada se escribe)', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/dashboard/whatsapp/conexiones/manual',
      payload: { sedeId: sedeA, wabaId: 'W', phoneNumberId: PHONE_A, token: 'token-que-no-debe-guardarse' },
    })
    expect(res.statusCode).toBe(401)
    expect(await conexionActivaPorPhoneNumberId(pool, PHONE_A)).toBeNull()
    await app.close()
  })
})

// Sin base: el guard de rol es una función pura sobre el request ya autenticado.
describe('exigirAdmin', () => {
  const reply = () => {
    const r = { code: vi.fn(), send: vi.fn() }
    r.code.mockReturnValue(r)
    r.send.mockReturnValue(r)
    return r
  }

  it('un operador (no admin) recibe 403 SOLO_ADMIN', async () => {
    const r = reply()
    await exigirAdmin({ operador: { id: 'u', rol: 'operador', sedeId: 'x' } } as never, r as never)
    expect(r.code).toHaveBeenCalledWith(403)
    expect(r.send).toHaveBeenCalledWith({ error: 'SOLO_ADMIN' })
  })

  it('sin operador autenticado también se rechaza', async () => {
    const r = reply()
    await exigirAdmin({} as never, r as never)
    expect(r.code).toHaveBeenCalledWith(403)
  })

  it('un admin pasa sin respuesta de error', async () => {
    const r = reply()
    await exigirAdmin({ operador: { id: 'u', rol: 'admin', sedeId: null } } as never, r as never)
    expect(r.code).not.toHaveBeenCalled()
  })
})

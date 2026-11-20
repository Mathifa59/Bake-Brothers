// Cliente del API de administración de Supabase Auth: a qué dirección y con qué cabeceras llama, cómo traduce los
// errores y, sobre todo, que la llave de servicio nunca se filtre a un mensaje de error. `fetch` se reemplaza (no hay
// un GoTrue local); el entorno se fija con un mock de env.ts porque las variables se leen al importar.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const entorno = vi.hoisted(() => ({ SUPABASE_URL: undefined as string | undefined, SUPABASE_SERVICE_ROLE_KEY: undefined as string | undefined }))
vi.mock('../src/env.js', () => ({ env: entorno }))

const admin = await import('../src/auth/supabaseAdmin.js')

const LLAVE_JWT = 'eyJhbGciOiJIUzI1NiJ9.llave-de-servicio-de-prueba.firma'
const LLAVE_NUEVA = 'sb_secret_llave-nueva-de-prueba'

type Llamada = { url: string; init: RequestInit & { headers: Record<string, string> } }
let llamadas: Llamada[]
const responder = (estado: number, cuerpo: unknown) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    llamadas.push({ url: String(url), init: init as Llamada['init'] })
    return new Response(cuerpo === null ? '' : JSON.stringify(cuerpo), { status: estado })
  })

beforeEach(() => {
  llamadas = []
  entorno.SUPABASE_URL = undefined
  entorno.SUPABASE_SERVICE_ROLE_KEY = LLAVE_JWT
})
afterEach(() => vi.restoreAllMocks())

describe('cliente de Supabase Auth (administración)', () => {
  it('sin llave no llama a nadie y lo dice', async () => {
    entorno.SUPABASE_SERVICE_ROLE_KEY = undefined
    const f = responder(200, {})
    expect(admin.supabaseAdminConfigurado()).toBe(false)
    await expect(admin.crearUsuarioAuth({ email: 'a@b.pe', password: 'x'.repeat(12) })).rejects.toBeInstanceOf(admin.SupabaseAdminNoConfigurado)
    expect(f).not.toHaveBeenCalled()
  })

  it('crear: POST al proyecto, cuenta ya confirmada y llave en las dos cabeceras (llave clásica JWT)', async () => {
    responder(200, { id: 'u1', email: 'caja@equipo.bakebrothers.pe', email_confirmed_at: '2031-01-01T00:00:00Z', created_at: '2031-01-01T00:00:00Z' })
    const u = await admin.crearUsuarioAuth({ email: 'caja@equipo.bakebrothers.pe', password: 'una-clave-larga-1' })
    expect(u).toMatchObject({ id: 'u1', email: 'caja@equipo.bakebrothers.pe', confirmado: true })
    expect(llamadas[0].url).toBe('https://umyaytrojtbdvdzbrily.supabase.co/auth/v1/admin/users')
    expect(llamadas[0].init.method).toBe('POST')
    expect(JSON.parse(String(llamadas[0].init.body))).toEqual({ email: 'caja@equipo.bakebrothers.pe', password: 'una-clave-larga-1', email_confirm: true })
    expect(llamadas[0].init.headers.apikey).toBe(LLAVE_JWT)
    expect(llamadas[0].init.headers.Authorization).toBe(`Bearer ${LLAVE_JWT}`)
  })

  it('una llave nueva (sb_secret_…) va solo en `apikey` y SUPABASE_URL se respeta', async () => {
    entorno.SUPABASE_SERVICE_ROLE_KEY = LLAVE_NUEVA
    entorno.SUPABASE_URL = 'https://otro.supabase.co/'
    responder(200, { id: 'u1' })
    await admin.crearUsuarioAuth({ email: 'a@b.pe', password: 'x'.repeat(12) })
    expect(llamadas[0].url).toBe('https://otro.supabase.co/auth/v1/admin/users')
    expect(llamadas[0].init.headers.apikey).toBe(LLAVE_NUEVA)
    expect(llamadas[0].init.headers.Authorization).toBeUndefined()
  })

  it('bloquear / desbloquear / cambiar contraseña / invitar / borrar usan las rutas y cuerpos de GoTrue', async () => {
    responder(200, { id: 'u1' })
    await admin.bloquearUsuarioAuth('u1', true)
    await admin.bloquearUsuarioAuth('u1', false)
    await admin.cambiarContrasenaAuth('u1', 'nueva-clave-larga-1')
    await admin.invitarUsuarioAuth({ email: 'sara@bakebrothers.pe', redirectTo: 'https://dashboard.bakebrothers.pe' })
    await admin.borrarUsuarioAuth('u1')
    const resumen = llamadas.map((l) => `${l.init.method} ${l.url.replace('https://umyaytrojtbdvdzbrily.supabase.co', '')}`)
    expect(resumen).toEqual([
      'PUT /auth/v1/admin/users/u1',
      'PUT /auth/v1/admin/users/u1',
      'PUT /auth/v1/admin/users/u1',
      `POST /auth/v1/invite?redirect_to=${encodeURIComponent('https://dashboard.bakebrothers.pe')}`,
      'DELETE /auth/v1/admin/users/u1',
    ])
    expect(JSON.parse(String(llamadas[0].init.body))).toEqual({ ban_duration: '876000h' })
    expect(JSON.parse(String(llamadas[1].init.body))).toEqual({ ban_duration: 'none' })
    expect(JSON.parse(String(llamadas[2].init.body))).toEqual({ password: 'nueva-clave-larga-1' })
  })

  it('lista todas las cuentas paginando y trae el último ingreso', async () => {
    const pagina1 = Array.from({ length: 200 }, (_, i) => ({ id: `u${i}`, email: `u${i}@x.pe`, last_sign_in_at: '2031-02-02T00:00:00Z' }))
    let n = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      llamadas.push({ url: String(url), init: {} as Llamada['init'] })
      return new Response(JSON.stringify({ users: n++ === 0 ? pagina1 : [{ id: 'ultimo', email: 'z@x.pe' }] }), { status: 200 })
    })
    const todas = await admin.listarUsuariosAuth()
    expect(todas).toHaveLength(201)
    expect(todas[0].ultimoIngreso).toBe('2031-02-02T00:00:00Z')
    expect(llamadas.map((l) => l.url.split('?')[1])).toEqual(['page=1&per_page=200', 'page=2&per_page=200'])
  })

  it('traduce los errores de GoTrue a un código, sin arrastrar la llave', async () => {
    responder(422, { error_code: 'email_exists', msg: 'A user with this email address has already been registered' })
    const e1 = await admin.crearUsuarioAuth({ email: 'a@b.pe', password: 'x'.repeat(12) }).catch((e) => e)
    expect(e1).toBeInstanceOf(admin.ErrorSupabaseAuth)
    expect(e1).toMatchObject({ estado: 422, codigo: 'email_exists' })

    responder(401, { message: 'Invalid API key' })
    const e2 = await admin.bloquearUsuarioAuth('u1', true).catch((e) => e)
    expect(e2).toMatchObject({ estado: 401, codigo: 'http_401' })
    for (const e of [e1, e2]) {
      expect(String(e.message)).not.toContain(LLAVE_JWT)
      expect(JSON.stringify({ ...e, mensaje: e.message })).not.toContain(LLAVE_JWT)
    }
  })

  it('si Supabase no responde, un error propio (sin detalles internos de la red)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError(`fetch failed (apikey ${LLAVE_JWT})`))
    const e = await admin.listarUsuariosAuth().catch((x) => x)
    expect(e).toMatchObject({ estado: 503, codigo: 'auth_inalcanzable' })
    expect(String(e.message)).not.toContain(LLAVE_JWT)
  })
})

// Equipo (migración 0056): crear, editar, cambiar contraseña, desactivar y reactivar cuentas — solo Administración.
//
// Se mockean DOS cosas y nada más: la verificación del JWT (fija `req.operador` con los perfiles de la cabecera, porque
// lo que se prueba es la autorización de la ruta, no la firma de Supabase) y el cliente de Supabase Auth (no existe un
// GoTrue local; el mock imita su efecto sobre `auth.users`, que es lo que la FK de usuarios_dashboard necesita). La
// base es real: guardias, auditoría y permisos del rol de la API se prueban de verdad.
//
// Con DATABASE_URL de un rol miembro de app_api (no superusuario) se comprueban además los permisos reales de la API;
// DATABASE_URL_ADMIN es una conexión de superusuario solo para preparar y limpiar datos (si no está, se usa la misma).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'
import { PERFILES } from '@bakebrothers/domain'

const hayBaseDeDatosReal = !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

const auth = vi.hoisted(() => ({
  configurado: true,
  admin: null as null | { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  llamadas: [] as Array<{ fn: string; args: unknown[] }>,
  falla: {} as Record<string, unknown>,
}))

vi.mock('../src/auth/verificarJwtOperador.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/auth/verificarJwtOperador.js')>()),
  verificarJwtOperador: async (
    req: { headers: Record<string, string | undefined>; operador?: unknown },
    reply: { code: (n: number) => { send: (b: unknown) => unknown } }
  ) => {
    const perfiles = req.headers['x-test-perfiles']
    if (!perfiles) return reply.code(401).send({ error: 'NO_AUTORIZADO' })
    const lista = perfiles.split(',')
    req.operador = {
      id: req.headers['x-test-actor'] ?? '00000000-0000-0000-0000-0000000000bb',
      rol: lista.includes('administracion') ? 'admin' : 'operador',
      sedeId: null,
      perfiles: lista,
    }
  },
}))

vi.mock('../src/auth/supabaseAdmin.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/auth/supabaseAdmin.js')>()
  const registrar = (fn: string, args: unknown[]) => auth.llamadas.push({ fn, args })
  const fallar = (fn: string) => {
    const e = auth.falla[fn]
    if (e) throw e
  }
  return {
    ...real,
    supabaseAdminConfigurado: () => auth.configurado,
    crearUsuarioAuth: async (datos: { email: string; password: string }) => {
      registrar('crear', [datos])
      fallar('crear')
      const id = randomUUID()
      await auth.admin!.query(`insert into auth.users (id, email) values ($1, $2)`, [id, datos.email])
      return { id, email: datos.email, creadoEn: null, ultimoIngreso: null, confirmado: true, bloqueadoHasta: null }
    },
    invitarUsuarioAuth: async (datos: { email: string; redirectTo: string }) => {
      registrar('invitar', [datos])
      fallar('invitar')
      const id = randomUUID()
      await auth.admin!.query(`insert into auth.users (id, email) values ($1, $2)`, [id, datos.email])
      return { id, email: datos.email, creadoEn: null, ultimoIngreso: null, confirmado: false, bloqueadoHasta: null }
    },
    cambiarContrasenaAuth: async (id: string, password: string) => {
      registrar('password', [id, password])
      fallar('password')
    },
    bloquearUsuarioAuth: async (id: string, bloqueado: boolean) => {
      registrar('bloquear', [id, bloqueado])
      fallar('bloquear')
    },
    borrarUsuarioAuth: async (id: string) => {
      registrar('borrar', [id])
      await auth.admin!.query(`delete from auth.users where id = $1`, [id])
    },
    listarUsuariosAuth: async () => {
      const { rows } = await auth.admin!.query(`select id, email from auth.users`)
      return rows.map((r) => ({ id: r.id as string, email: r.email as string | null, creadoEn: null, ultimoIngreso: '2031-01-02T03:04:05.000Z', confirmado: true, bloqueadoHasta: null }))
    },
  }
})

const { buildApp } = await import('../src/app.js')
const { ErrorSupabaseAuth } = await import('../src/auth/supabaseAdmin.js')

let ip = 0
const otraIp = () => `10.${(ip >> 16) & 255}.${(ip >> 8) & 255}.${++ip & 255}`
const UUID = '00000000-0000-0000-0000-000000000000'

describe.skipIf(!hayBaseDeDatosReal)('Equipo: gestión de cuentas (solo Administración)', () => {
  const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL })
  auth.admin = admin
  let app: Awaited<ReturnType<typeof buildApp>>
  let sedeId: string
  let adminA: string
  let adminB: string
  const creados: string[] = []

  const sembrarCuenta = async (nombre: string, perfiles: string[], extra: { usuario?: string; activo?: boolean } = {}) => {
    const id = randomUUID()
    await admin.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${nombre.toLowerCase().replace(/\W+/g, '.')}.${id.slice(0, 6)}@prueba.test`])
    await admin.query(
      `insert into usuarios_dashboard (id, rol, perfiles, nombre, usuario, activo) values ($1, $2, $3, $4, $5, $6)`,
      [id, perfiles.includes('administracion') ? 'admin' : 'operador', perfiles, nombre, extra.usuario ?? null, extra.activo ?? true]
    )
    creados.push(id)
    return id
  }

  const llamar = (metodo: 'GET' | 'POST' | 'PATCH', url: string, perfiles: string[] | null, payload?: unknown, actor?: string) =>
    app.inject({
      method: metodo,
      url,
      remoteAddress: otraIp(),
      headers: { ...(perfiles ? { 'x-test-perfiles': perfiles.join(',') } : {}), ...(actor ? { 'x-test-actor': actor } : {}) },
      ...(payload === undefined ? {} : { payload: payload as object }),
    })
  const comoAdmin = (metodo: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown, actor = adminA) =>
    llamar(metodo, url, ['administracion'], payload, actor)

  const filaDe = async (id: string) => (await admin.query(`select * from usuarios_dashboard where id = $1`, [id])).rows[0]
  const auditoriaDe = async (id: string) => (await admin.query(`select accion, actor_id, actor_nombre, detalle from equipo_auditoria where objetivo_id = $1 order by id`, [id])).rows

  /** Deja como únicos administradores activos a estos (para probar «el último administrador»); devuelve cómo restaurar. */
  const soloEstosAdmins = async (ids: string[]) => {
    const { rows } = await admin.query(`select id from usuarios_dashboard where rol = 'admin' and activo and id <> all($1::uuid[])`, [ids])
    const otros = rows.map((r) => r.id as string)
    if (otros.length) await admin.query(`update usuarios_dashboard set activo = false where id = any($1::uuid[])`, [otros])
    return async () => {
      if (otros.length) await admin.query(`update usuarios_dashboard set activo = true where id = any($1::uuid[])`, [otros])
    }
  }

  beforeAll(async () => {
    sedeId = (await admin.query(`select id from sedes where activo order by nombre limit 1`)).rows[0].id
    app = await buildApp()
    adminA = await sembrarCuenta('Admin Prueba A', ['administracion'])
    adminB = await sembrarCuenta('Admin Prueba B', ['administracion'])
  })

  beforeEach(() => {
    auth.configurado = true
    auth.llamadas.length = 0
    for (const k of Object.keys(auth.falla)) delete auth.falla[k]
  })

  afterAll(async () => {
    // El registro de auditoría es inmutable a propósito; en la base de pruebas se apaga el bloqueo solo para limpiar.
    await admin.query(`alter table equipo_auditoria disable trigger equipo_auditoria_inmutable`)
    try {
      await admin.query(`update usuarios_dashboard set activo = true where id = any($1::uuid[])`, [creados])
      await admin.query(`delete from equipo_auditoria where objetivo_id = any($1::uuid[]) or actor_id = any($1::uuid[])`, [creados])
      await admin.query(`delete from auth.users where id = any($1::uuid[])`, [creados])
      await admin.query(`delete from auth.users where email like '%@equipo.bakebrothers.pe' or email like '%@bakebrothers.pe' and email like 'prueba.%'`)
    } finally {
      await admin.query(`alter table equipo_auditoria enable trigger equipo_auditoria_inmutable`)
      await admin.end()
    }
  })

  // ——— quién puede entrar ———
  describe('autorización: un no administrador recibe 403 en CADA ruta', () => {
    const RUTAS: Array<{ nombre: string; metodo: 'GET' | 'POST' | 'PATCH'; url: string }> = [
      { nombre: 'listar', metodo: 'GET', url: '/api/dashboard/equipo' },
      { nombre: 'crear', metodo: 'POST', url: '/api/dashboard/equipo' },
      { nombre: 'editar', metodo: 'PATCH', url: `/api/dashboard/equipo/${UUID}` },
      { nombre: 'cambiar contraseña', metodo: 'POST', url: `/api/dashboard/equipo/${UUID}/password` },
      { nombre: 'desactivar', metodo: 'POST', url: `/api/dashboard/equipo/${UUID}/desactivar` },
      { nombre: 'reactivar', metodo: 'POST', url: `/api/dashboard/equipo/${UUID}/reactivar` },
      { nombre: 'auditoría', metodo: 'GET', url: '/api/dashboard/equipo/auditoria' },
    ]
    for (const ruta of RUTAS) {
      it(`${ruta.nombre}: sin sesión 401; cualquier otro perfil 403 SOLO_ADMIN (con o sin la llave configurada)`, async () => {
        expect((await llamar(ruta.metodo, ruta.url, null, ruta.metodo === 'GET' ? undefined : {})).statusCode).toBe(401)
        for (const configurado of [true, false]) {
          auth.configurado = configurado
          for (const perfil of PERFILES.filter((p) => p !== 'administracion')) {
            const r = await llamar(ruta.metodo, ruta.url, [perfil], ruta.metodo === 'GET' ? undefined : {})
            expect(r.statusCode, `${perfil} en ${ruta.nombre}`).toBe(403)
            expect(JSON.parse(r.body).error).toBe('SOLO_ADMIN')
          }
          // Un perfil con varias cosas (todo menos Administración) tampoco entra.
          const r = await llamar(ruta.metodo, ruta.url, ['caja', 'venta_digital', 'ordenes', 'produccion'], ruta.metodo === 'GET' ? undefined : {})
          expect(r.statusCode).toBe(403)
        }
        expect(auth.llamadas).toHaveLength(0) // ni siquiera se tocó Supabase Auth
      })
    }
  })

  // ——— lista ———
  it('lista las cuentas con sus datos y el último ingreso que informa Auth', async () => {
    const r = await comoAdmin('GET', '/api/dashboard/equipo')
    expect(r.statusCode).toBe(200)
    const { cuentas, authDisponible } = JSON.parse(r.body)
    expect(authDisponible).toBe(true)
    const a = cuentas.find((c: { id: string }) => c.id === adminA)
    expect(a).toMatchObject({ nombre: 'Admin Prueba A', perfiles: ['administracion'], activo: true, esEncargado: false, ultimoIngreso: '2031-01-02T03:04:05.000Z' })
    expect(a.correo).toMatch(/@prueba\.test$/)
  })

  it('sin la llave la lista igual sirve (sin correo ni último ingreso) y lo avisa', async () => {
    auth.configurado = false
    const r = await comoAdmin('GET', '/api/dashboard/equipo')
    expect(r.statusCode).toBe(200)
    const { cuentas, authDisponible } = JSON.parse(r.body)
    expect(authDisponible).toBe(false)
    expect(cuentas.find((c: { id: string }) => c.id === adminA).correo).toBeNull()
  })

  // ——— crear ———
  describe('crear', () => {
    it('con usuario: correo interno confirmado, fila completa y auditoría del actor', async () => {
      const usuario = `caja.${randomUUID().slice(0, 6)}`
      const r = await comoAdmin('POST', '/api/dashboard/equipo', {
        nombre: 'Caja Prueba',
        usuario,
        password: 'una-clave-larga-1',
        perfiles: ['caja'],
        sedeId,
        avisaOrdenes: true,
        avisaPagos: false,
        esEncargado: true,
      })
      expect(r.statusCode).toBe(201)
      const { id, correo, invitada } = JSON.parse(r.body)
      creados.push(id)
      expect(correo).toBe(`${usuario}@equipo.bakebrothers.pe`)
      expect(invitada).toBe(false)
      expect(auth.llamadas[0]).toEqual({ fn: 'crear', args: [{ email: `${usuario}@equipo.bakebrothers.pe`, password: 'una-clave-larga-1' }] })

      const fila = await filaDe(id)
      expect(fila).toMatchObject({ rol: 'operador', perfiles: ['caja'], sede_id: sedeId, nombre: 'Caja Prueba', usuario, avisa_ordenes: true, avisa_pagos: false, es_encargado: true, activo: true })

      const aud = await auditoriaDe(id)
      expect(aud).toHaveLength(1)
      expect(aud[0]).toMatchObject({ accion: 'crear', actor_id: adminA, actor_nombre: 'Admin Prueba A' })
      expect(JSON.stringify(aud)).not.toContain('una-clave-larga-1') // la contraseña no se guarda en ningún lado
    })

    it('con correo real (Sara): cuenta de Administración, rol admin derivado', async () => {
      const correo = `prueba.${randomUUID().slice(0, 6)}@bakebrothers.pe`
      const r = await comoAdmin('POST', '/api/dashboard/equipo', { nombre: 'Sara Prueba', correo, password: 'otra-clave-larga-1', perfiles: ['administracion'], avisaPagos: true })
      expect(r.statusCode).toBe(201)
      const { id } = JSON.parse(r.body)
      creados.push(id)
      expect(auth.llamadas[0].args[0]).toMatchObject({ email: correo })
      expect(await filaDe(id)).toMatchObject({ rol: 'admin', usuario: null, avisa_pagos: true })
    })

    it('invitación por correo: solo para administradores, sin contraseña', async () => {
      const correo = `prueba.${randomUUID().slice(0, 6)}@bakebrothers.pe`
      const r = await comoAdmin('POST', '/api/dashboard/equipo', { nombre: 'Invitada', correo, invitar: true, perfiles: ['administracion'] })
      expect(r.statusCode).toBe(201)
      const { id, invitada } = JSON.parse(r.body)
      creados.push(id)
      expect(invitada).toBe(true)
      expect(auth.llamadas[0].fn).toBe('invitar')
      expect((await auditoriaDe(id)).map((a) => a.accion)).toEqual(['crear', 'invitar'])

      const noAdmin = await comoAdmin('POST', '/api/dashboard/equipo', { nombre: 'X', correo: `prueba.${randomUUID().slice(0, 6)}@bakebrothers.pe`, invitar: true, perfiles: ['caja'], sedeId })
      expect(noAdmin.statusCode).toBe(400)
      expect(JSON.parse(noAdmin.body).error).toBe('INVITAR_SOLO_ADMINISTRADORES')
    })

    it('rechaza datos inválidos sin tocar Supabase Auth', async () => {
      const base = { nombre: 'X', usuario: 'ok.usuario', password: 'una-clave-larga-1', perfiles: ['caja'], sedeId }
      const casos: Array<[string, Record<string, unknown>, string]> = [
        ['usuario con @', { usuario: 'a@b.pe' }, 'USUARIO_NO_VALIDO'],
        ['usuario con tilde', { usuario: 'cája' }, 'USUARIO_NO_VALIDO'],
        ['usuario y correo a la vez', { correo: 'x@y.pe' }, 'USUARIO_O_CORREO'],
        ['ni usuario ni correo', { usuario: undefined }, 'USUARIO_O_CORREO'],
        ['contraseña corta', { password: 'corta' }, 'CONTRASENA_NO_VALIDA'],
        ['sin perfiles', { perfiles: [] }, 'PERFILES_REQUERIDOS'],
        ['perfil inventado', { perfiles: ['jefe'] }, 'PERFIL_NO_VALIDO'],
        ['perfil transitorio en una cuenta nueva', { perfiles: ['empleado_temporal'] }, 'PERFIL_NO_VALIDO'],
        ['caja sin local', { sedeId: null }, 'SEDE_REQUERIDA'],
        ['local inexistente', { sedeId: UUID }, 'SEDE_NO_VALIDA'],
        ['correo con el dominio interno', { usuario: undefined, correo: 'x@equipo.bakebrothers.pe' }, 'CORREO_NO_VALIDO'],
      ]
      for (const [nombre, cambio, error] of casos) {
        const r = await comoAdmin('POST', '/api/dashboard/equipo', { ...base, ...cambio })
        expect(r.statusCode, nombre).toBe(400)
        expect(JSON.parse(r.body).error, nombre).toBe(error)
      }
      expect(auth.llamadas).toHaveLength(0)
    })

    it('usuario repetido → 409 sin crear nada en Auth', async () => {
      const usuario = `dup.${randomUUID().slice(0, 6)}`
      const datos = { nombre: 'Dup', usuario, password: 'una-clave-larga-1', perfiles: ['ordenes'] }
      const primera = await comoAdmin('POST', '/api/dashboard/equipo', datos)
      expect(primera.statusCode).toBe(201)
      creados.push(JSON.parse(primera.body).id)
      auth.llamadas.length = 0
      const segunda = await comoAdmin('POST', '/api/dashboard/equipo', datos)
      expect(segunda.statusCode).toBe(409)
      expect(JSON.parse(segunda.body).error).toBe('USUARIO_EN_USO')
      expect(auth.llamadas).toHaveLength(0)
    })

    it('errores de Supabase Auth se traducen (correo repetido, contraseña débil, caído)', async () => {
      const datos = () => ({ nombre: 'E', usuario: `err.${randomUUID().slice(0, 6)}`, password: 'una-clave-larga-1', perfiles: ['ordenes'] })
      auth.falla.crear = new ErrorSupabaseAuth(422, 'email_exists', 'ya existe')
      expect(JSON.parse((await comoAdmin('POST', '/api/dashboard/equipo', datos())).body).error).toBe('CORREO_EN_USO')
      auth.falla.crear = new ErrorSupabaseAuth(422, 'weak_password', 'débil')
      expect(JSON.parse((await comoAdmin('POST', '/api/dashboard/equipo', datos())).body).error).toBe('CONTRASENA_DEBIL')
      auth.falla.crear = new ErrorSupabaseAuth(503, 'auth_inalcanzable', 'caído')
      const r = await comoAdmin('POST', '/api/dashboard/equipo', datos())
      expect(r.statusCode).toBe(502)
      expect(JSON.parse(r.body).error).toBe('AUTH_ERROR')
    })

    it('si la fila no se puede guardar, la cuenta de Auth recién creada se deshace (no queda huérfana)', async () => {
      const antes = Number((await admin.query(`select count(*) from auth.users`)).rows[0].count)
      // Fuerza el fallo de la inserción: la tabla rechaza el valor, la API ya había creado la cuenta en Auth.
      await admin.query(`alter table usuarios_dashboard add constraint prueba_rechaza_nombre check (nombre is distinct from 'FALLA-A-PROPOSITO')`)
      try {
        const r = await comoAdmin('POST', '/api/dashboard/equipo', { nombre: 'FALLA-A-PROPOSITO', usuario: `huerfana.${randomUUID().slice(0, 6)}`, password: 'una-clave-larga-1', perfiles: ['ordenes'] })
        expect(r.statusCode).toBe(500)
      } finally {
        await admin.query(`alter table usuarios_dashboard drop constraint prueba_rechaza_nombre`)
      }
      expect(auth.llamadas.map((l) => l.fn)).toEqual(['crear', 'borrar'])
      expect(Number((await admin.query(`select count(*) from auth.users`)).rows[0].count)).toBe(antes)
    })

    it('sin SUPABASE_SERVICE_ROLE_KEY → 503 claro (a un administrador)', async () => {
      auth.configurado = false
      const r = await comoAdmin('POST', '/api/dashboard/equipo', { nombre: 'X', usuario: 'sin.llave', password: 'una-clave-larga-1', perfiles: ['ordenes'] })
      expect(r.statusCode).toBe(503)
      expect(JSON.parse(r.body).error).toBe('EQUIPO_NO_CONFIGURADO')
    })
  })

  // ——— editar ———
  describe('editar', () => {
    it('cambia perfiles, local, avisos y encargado, y lo deja en la auditoría con antes y después', async () => {
      const id = await sembrarCuenta('Editable', ['ordenes'])
      const r = await comoAdmin('PATCH', `/api/dashboard/equipo/${id}`, { perfiles: ['caja', 'venta_digital'], sedeId, avisaOrdenes: true, esEncargado: true, nombre: 'Editada' })
      expect(r.statusCode).toBe(200)
      expect(await filaDe(id)).toMatchObject({ perfiles: ['caja', 'venta_digital'], sede_id: sedeId, avisa_ordenes: true, es_encargado: true, nombre: 'Editada', rol: 'operador' })
      const aud = (await auditoriaDe(id)).filter((a) => a.accion === 'editar')
      expect(aud).toHaveLength(1)
      expect(aud[0].actor_id).toBe(adminA)
      expect(aud[0].detalle.perfiles).toEqual({ antes: ['ordenes'], despues: ['caja', 'venta_digital'] })
      expect(aud[0].detalle.es_encargado).toEqual({ antes: false, despues: true })
    })

    it('dar Administración vuelve admin a la cuenta; quitarla, la baja a operador', async () => {
      const id = await sembrarCuenta('Sube y baja', ['ordenes'])
      await comoAdmin('PATCH', `/api/dashboard/equipo/${id}`, { perfiles: ['administracion'] })
      expect(await filaDe(id)).toMatchObject({ rol: 'admin' })
      await comoAdmin('PATCH', `/api/dashboard/equipo/${id}`, { perfiles: ['ordenes'] })
      expect(await filaDe(id)).toMatchObject({ rol: 'operador' })
    })

    it('rechaza lo inválido; una cuenta que no existe da 404; un cuerpo vacío no hace nada', async () => {
      const id = await sembrarCuenta('Rechazos', ['ordenes'])
      const mal: Array<[Record<string, unknown>, string]> = [
        [{ perfiles: [] }, 'PERFILES_REQUERIDOS'],
        [{ perfiles: ['empleado_temporal'] }, 'PERFIL_NO_VALIDO'],
        [{ perfiles: ['caja'], sedeId: null }, 'SEDE_REQUERIDA'],
        [{ nombre: '   ' }, 'VALIDACION'],
      ]
      for (const [cuerpo, error] of mal) {
        const r = await comoAdmin('PATCH', `/api/dashboard/equipo/${id}`, cuerpo)
        expect(r.statusCode, error).toBe(400)
        expect(JSON.parse(r.body).error).toBe(error)
      }
      expect((await comoAdmin('PATCH', `/api/dashboard/equipo/${UUID}`, { nombre: 'x' })).statusCode).toBe(404)
      expect((await comoAdmin('PATCH', `/api/dashboard/equipo/${id}`, {})).statusCode).toBe(200)
      expect((await auditoriaDe(id)).filter((a) => a.accion === 'editar')).toHaveLength(0)
    })

    it('las cuentas viejas conservan «empleado_temporal» al editarlas, pero a nadie más se le puede dar', async () => {
      const id = await sembrarCuenta('Vieja', ['empleado_temporal'])
      expect((await comoAdmin('PATCH', `/api/dashboard/equipo/${id}`, { avisaPagos: true })).statusCode).toBe(200)
      expect((await comoAdmin('PATCH', `/api/dashboard/equipo/${id}`, { perfiles: ['empleado_temporal', 'ordenes'], sedeId })).statusCode).toBe(200)
    })

    it('nadie se quita a sí mismo Administración', async () => {
      const r = await comoAdmin('PATCH', `/api/dashboard/equipo/${adminA}`, { perfiles: ['caja'], sedeId }, adminA)
      expect(r.statusCode).toBe(409)
      expect(JSON.parse(r.body).error).toBe('NO_PUEDES_QUITARTE_ADMINISTRACION')
      expect(await filaDe(adminA)).toMatchObject({ rol: 'admin' })
      // Sí puede cambiar otras cosas de su propia cuenta.
      expect((await comoAdmin('PATCH', `/api/dashboard/equipo/${adminA}`, { avisaPagos: true }, adminA)).statusCode).toBe(200)
      await admin.query(`update usuarios_dashboard set avisa_pagos = false where id = $1`, [adminA])
    })

    it('no se puede dejar el sistema sin administradores (otro administrador intentando quitar al último)', async () => {
      const restaurar = await soloEstosAdmins([adminA, adminB])
      try {
        // A quita a B: queda A → bien.
        expect((await comoAdmin('PATCH', `/api/dashboard/equipo/${adminB}`, { perfiles: ['caja'], sedeId }, adminA)).statusCode).toBe(200)
        // B (ya sin Administración, pero su sesión simulada sigue) intenta quitar a A, el último → la base lo impide.
        const r = await comoAdmin('PATCH', `/api/dashboard/equipo/${adminA}`, { perfiles: ['caja'], sedeId }, adminB)
        expect(r.statusCode).toBe(409)
        expect(JSON.parse(r.body).error).toBe('ULTIMO_ADMINISTRADOR')
        expect(await filaDe(adminA)).toMatchObject({ rol: 'admin', activo: true })
      } finally {
        await admin.query(`update usuarios_dashboard set perfiles = array['administracion'] where id = $1`, [adminB])
        await restaurar()
      }
    })
  })

  // ——— contraseña ———
  describe('cambiar contraseña', () => {
    it('la cambia en Auth, deja constancia y NO guarda la contraseña', async () => {
      const id = await sembrarCuenta('Con clave', ['ordenes'])
      const r = await comoAdmin('POST', `/api/dashboard/equipo/${id}/password`, { password: 'nueva-clave-secreta-9' })
      expect(r.statusCode).toBe(200)
      expect(auth.llamadas).toEqual([{ fn: 'password', args: [id, 'nueva-clave-secreta-9'] }])
      const aud = await auditoriaDe(id)
      expect(aud.map((a) => a.accion)).toContain('cambiar_password')
      expect(JSON.stringify(aud)).not.toContain('nueva-clave-secreta-9')
    })

    it('rechaza contraseñas cortas y cuentas inexistentes', async () => {
      const id = await sembrarCuenta('Corta', ['ordenes'])
      const corta = await comoAdmin('POST', `/api/dashboard/equipo/${id}/password`, { password: 'corta' })
      expect(corta.statusCode).toBe(400)
      expect(JSON.parse(corta.body).error).toBe('CONTRASENA_NO_VALIDA')
      expect((await comoAdmin('POST', `/api/dashboard/equipo/${UUID}/password`, { password: 'una-clave-larga-1' })).statusCode).toBe(404)
      expect(auth.llamadas).toHaveLength(0)
    })
  })

  // ——— desactivar / reactivar ———
  describe('desactivar y reactivar (nunca se borra)', () => {
    it('desactiva en Bake OS y bloquea el ingreso en Auth; reactiva al revés; todo en la auditoría', async () => {
      const id = await sembrarCuenta('Va y vuelve', ['ordenes'])
      const d = await comoAdmin('POST', `/api/dashboard/equipo/${id}/desactivar`)
      expect(d.statusCode).toBe(200)
      expect(JSON.parse(d.body)).toMatchObject({ ok: true, sesionBloqueada: true })
      expect(auth.llamadas).toEqual([{ fn: 'bloquear', args: [id, true] }])
      const inactiva = await filaDe(id)
      expect(inactiva.activo).toBe(false)
      expect(inactiva.desactivado_en).not.toBeNull()

      auth.llamadas.length = 0
      expect((await comoAdmin('POST', `/api/dashboard/equipo/${id}/reactivar`)).statusCode).toBe(200)
      expect(auth.llamadas).toEqual([{ fn: 'bloquear', args: [id, false] }])
      const activa = await filaDe(id)
      expect(activa.activo).toBe(true)
      expect(activa.desactivado_en).toBeNull()

      expect((await auditoriaDe(id)).map((a) => a.accion)).toEqual(['crear', 'desactivar', 'reactivar'])
      expect((await auditoriaDe(id)).every((a) => a.actor_id === adminA || a.accion === 'crear')).toBe(true)
    })

    it('si Auth no puede bloquear el ingreso, la cuenta igual queda desactivada y se avisa', async () => {
      const id = await sembrarCuenta('Auth caído', ['ordenes'])
      auth.falla.bloquear = new ErrorSupabaseAuth(503, 'auth_inalcanzable', 'caído')
      const r = await comoAdmin('POST', `/api/dashboard/equipo/${id}/desactivar`)
      expect(r.statusCode).toBe(200)
      expect(JSON.parse(r.body).sesionBloqueada).toBe(false)
      expect((await filaDe(id)).activo).toBe(false)
    })

    it('nadie se desactiva a sí mismo; la cuenta no se borra nunca (no hay ruta ni permiso de borrado)', async () => {
      const r = await comoAdmin('POST', `/api/dashboard/equipo/${adminA}/desactivar`, undefined, adminA)
      expect(r.statusCode).toBe(409)
      expect(JSON.parse(r.body).error).toBe('NO_PUEDES_QUITARTE_ADMINISTRACION')
      expect((await filaDe(adminA)).activo).toBe(true)
      expect((await app.inject({ method: 'DELETE', url: `/api/dashboard/equipo/${adminA}`, remoteAddress: otraIp(), headers: { 'x-test-perfiles': 'administracion' } })).statusCode).toBe(404)
    })

    it('no se puede desactivar al último administrador activo', async () => {
      const restaurar = await soloEstosAdmins([adminA, adminB])
      try {
        expect((await comoAdmin('POST', `/api/dashboard/equipo/${adminB}/desactivar`, undefined, adminA)).statusCode).toBe(200)
        const r = await comoAdmin('POST', `/api/dashboard/equipo/${adminA}/desactivar`, undefined, adminB)
        expect(r.statusCode).toBe(409)
        expect(JSON.parse(r.body).error).toBe('ULTIMO_ADMINISTRADOR')
        expect((await filaDe(adminA)).activo).toBe(true)
      } finally {
        await admin.query(`update usuarios_dashboard set activo = true where id = $1`, [adminB])
        await restaurar()
      }
    })

    it('una cuenta que no existe da 404', async () => {
      expect((await comoAdmin('POST', `/api/dashboard/equipo/${UUID}/desactivar`)).statusCode).toBe(404)
      expect((await comoAdmin('POST', `/api/dashboard/equipo/${UUID}/reactivar`)).statusCode).toBe(404)
    })
  })

  // ——— auditoría ———
  it('la auditoría se lee por cuenta y en orden, con quién y cuándo', async () => {
    const id = await sembrarCuenta('Historial', ['ordenes'])
    await comoAdmin('PATCH', `/api/dashboard/equipo/${id}`, { avisaOrdenes: true })
    await comoAdmin('POST', `/api/dashboard/equipo/${id}/desactivar`)
    const r = await comoAdmin('GET', `/api/dashboard/equipo/auditoria?objetivoId=${id}`)
    expect(r.statusCode).toBe(200)
    const { registros } = JSON.parse(r.body)
    expect(registros.map((x: { accion: string }) => x.accion)).toEqual(['desactivar', 'editar', 'crear'])
    expect(registros[0]).toMatchObject({ actorId: adminA, actorNombre: 'Admin Prueba A', objetivoId: id })
    expect(new Date(registros[0].cuando).getTime()).toBeGreaterThan(Date.now() - 60_000)
    expect((await comoAdmin('GET', '/api/dashboard/equipo/auditoria?limite=0')).statusCode).toBe(400)
  })

  it('el registro de auditoría no se puede editar ni borrar, ni siquiera por la API', async () => {
    const id = await sembrarCuenta('Inmutable', ['ordenes'])
    const api = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    try {
      await expect(api.query(`update equipo_auditoria set accion = 'crear' where objetivo_id = $1`, [id])).rejects.toThrow()
      await expect(api.query(`delete from equipo_auditoria where objetivo_id = $1`, [id])).rejects.toThrow()
    } finally {
      await api.end()
    }
  })
})

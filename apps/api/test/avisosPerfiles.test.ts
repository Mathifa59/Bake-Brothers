// Avisos por perfil (migración 0054): cada tipo de aviso llega SOLO a quien corresponde, tanto a la campana como al
// push al celular. `web-push` está mockeado (se comprueba a qué dispositivos se manda); todo lo demás corre real
// contra Postgres.
//   - mensajes y «esperando persona»: Administración y Venta digital (los dos locales);
//   - orden nueva / pedido nuevo para hoy: solo cuentas con «aviso de órdenes», del local del aviso o sin local
//     (Venta digital, Órdenes y Administración, de cualquier local); a quien registró la orden no se le manda el push;
//   - pago reportado: solo cuentas con «aviso de pagos».
// Necesita Postgres con el esquema (DATABASE_URL real); sin eso se salta.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal = !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

process.env.ANTHROPIC_API_KEY ||= 'dummy-para-test-mockeado-nunca-sale-un-request-real'
vi.mock('@anthropic-ai/sdk', () => ({ default: vi.fn().mockImplementation(() => ({ messages: { create: vi.fn() } })) }))

const mockSend = vi.fn()
vi.mock('web-push', () => ({ sendNotification: (...a: unknown[]) => mockSend(...a), generateVAPIDKeys: vi.fn() }))

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
      id: req.headers['x-test-id'],
      rol: lista.includes('administracion') ? 'admin' : 'operador',
      sedeId: req.headers['x-test-sede'] ?? null,
      perfiles: lista,
    }
  },
}))

const { buildApp } = await import('../src/app.js')
const { avisarAlEquipo } = await import('../src/services/avisos.js')

const ID = (n: number) => `66666666-0000-0000-0000-00000000000${n}`
const SARA = ID(1) // Administración · aviso de órdenes y de pagos
const CAJA = ID(2) // Caja del local 1 · aviso de órdenes
const OPS = ID(3) // Venta digital + Órdenes · aviso de órdenes
const EMPAQUE = ID(4) // Producción del local 1 · aviso de órdenes
const DECORACION = ID(5) // Producción del local 1 · sin aviso
const CAJA_SM = ID(6) // Caja del local 2 · sin aviso
const NOMBRES: Record<string, string> = { [SARA]: 'Sara', [CAJA]: 'Caja', [OPS]: 'Operaciones', [EMPAQUE]: 'Empaque', [DECORACION]: 'Decoración', [CAJA_SM]: 'Caja SM' }
const EP = (id: string) => `https://push.ejemplo.test/${id}`
const logger = () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })

describe.skipIf(!hayBaseDeDatosReal)('avisos por perfil: cada tipo llega solo a quien corresponde', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let app: Awaited<ReturnType<typeof buildApp>>
  let sede1: string
  let sede2: string
  let producto: string
  const REF = 'RAPPI-TEST-PERFILES'

  const quienRecibioPush = () =>
    mockSend.mock.calls
      .map(([sub]) => Object.entries(NOMBRES).find(([id]) => (sub as { endpoint: string }).endpoint === EP(id))?.[1])
      .sort()
  const quienVeLaCampana = async (titulo: string) => {
    const r: string[] = []
    for (const id of Object.keys(NOMBRES)) {
      const c = await pool.connect()
      try {
        await c.query('begin')
        await c.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [JSON.stringify({ sub: id, role: 'authenticated' }), id])
        await c.query('set local role authenticated')
        const { rows } = await c.query(`select 1 from avisos where titulo = $1`, [titulo])
        if (rows.length > 0) r.push(NOMBRES[id])
      } finally {
        await c.query('rollback')
        c.release()
      }
    }
    return r.sort()
  }

  beforeAll(async () => {
    sede1 = (await pool.query(`insert into sedes (nombre) values ('TEST perfiles 1') returning id`)).rows[0].id
    sede2 = (await pool.query(`insert into sedes (nombre) values ('TEST perfiles 2') returning id`)).rows[0].id
    producto = (await pool.query(`select id from products where nombre ilike 'Empanada%' limit 1`)).rows[0].id
    for (const id of Object.keys(NOMBRES)) await pool.query(`insert into auth.users (id) values ($1) on conflict do nothing`, [id])
    const cuentas: [string, string[], string | null, boolean, boolean][] = [
      [SARA, ['administracion'], sede1, true, true],
      [CAJA, ['caja'], sede1, true, false],
      [OPS, ['venta_digital', 'ordenes'], null, true, false],
      [EMPAQUE, ['produccion'], sede1, true, false],
      [DECORACION, ['produccion'], sede1, false, false],
      [CAJA_SM, ['caja'], sede2, false, false],
    ]
    for (const [id, perfiles, sede, ordenes, pagos] of cuentas) {
      await pool.query(
        `insert into usuarios_dashboard (id, rol, sede_id, perfiles, avisa_ordenes, avisa_pagos) values ($1, 'operador', $2, $3, $4, $5)
         on conflict (id) do update set sede_id = excluded.sede_id, perfiles = excluded.perfiles, avisa_ordenes = excluded.avisa_ordenes, avisa_pagos = excluded.avisa_pagos`,
        [id, sede, perfiles, ordenes, pagos]
      )
      await pool.query(
        `insert into push_suscripciones (usuario_id, endpoint, p256dh, auth) values ($1, $2, 'p', 'a') on conflict (endpoint) do update set usuario_id = excluded.usuario_id`,
        [id, EP(id)]
      )
    }
    process.env.VAPID_PUBLIC_KEY = 'clave-publica-de-prueba'
    process.env.VAPID_PRIVATE_KEY = 'clave-privada-de-prueba'
    app = await buildApp()
  })

  afterAll(async () => {
    await app.close()
    const ids = Object.keys(NOMBRES)
    await pool.query(`delete from order_items where order_id in (select id from orders where referencia_externa = $1)`, [REF])
    await pool.query(`delete from orders where referencia_externa = $1`, [REF])
    await pool.query(`delete from avisos where titulo like 'TEST perfiles%' or titulo like 'Orden Rappi%' or sede_id in ($1, $2)`, [sede1, sede2])
    await pool.query(`delete from push_suscripciones where usuario_id = any($1::uuid[])`, [ids])
    await pool.query(`delete from usuarios_dashboard where id = any($1::uuid[])`, [ids])
    await pool.query(`delete from auth.users where id = any($1::uuid[])`, [ids])
    await pool.query(`delete from sedes where id in ($1, $2)`, [sede1, sede2])
    await pool.end()
  })

  beforeEach(() => {
    mockSend.mockReset()
    mockSend.mockResolvedValue({ statusCode: 201 })
  })

  const nuevoAviso = (tipo: 'mensaje_nuevo' | 'esperando_persona' | 'pedido_nuevo' | 'orden_nueva' | 'pago_reportado', sedeId: string | null, extra = {}) =>
    avisarAlEquipo(logger(), { tipo, titulo: `TEST perfiles ${tipo}`, cuerpo: 'x', conversacionId: null, sedeId, ...extra }, pool)

  it('mensajes y «esperando persona»: solo Administración y Venta digital, de cualquier local', async () => {
    for (const tipo of ['mensaje_nuevo', 'esperando_persona'] as const) {
      mockSend.mockClear()
      await nuevoAviso(tipo, sede2)
      expect(quienRecibioPush()).toEqual(['Operaciones', 'Sara'])
      expect(await quienVeLaCampana(`TEST perfiles ${tipo}`)).toEqual(['Operaciones', 'Sara'])
    }
  })

  it('pedido nuevo para hoy del bot: solo con «aviso de órdenes», del local del pedido (Venta digital/Órdenes/Administración, de cualquiera)', async () => {
    await nuevoAviso('pedido_nuevo', sede1)
    // Caja y Empaque del local 1 (sí) · Decoración (no tiene el aviso) · Caja del local 2 (ni local ni aviso)
    expect(quienRecibioPush()).toEqual(['Caja', 'Empaque', 'Operaciones', 'Sara'])
    expect(await quienVeLaCampana('TEST perfiles pedido_nuevo')).toEqual(['Caja', 'Empaque', 'Operaciones', 'Sara'])
  })

  it('un pedido para hoy sin local lo recibe todo el que tiene el aviso, sea del local que sea', async () => {
    await nuevoAviso('orden_nueva', null)
    expect(quienRecibioPush()).toEqual(['Caja', 'Empaque', 'Operaciones', 'Sara'])
  })

  it('pago reportado: solo quien tiene el «aviso de pagos» (Sara)', async () => {
    await nuevoAviso('pago_reportado', sede1)
    expect(quienRecibioPush()).toEqual(['Sara'])
    expect(await quienVeLaCampana('TEST perfiles pago_reportado')).toEqual(['Sara'])
    // Si otra cuenta con acceso a pedidos lo activa, también le llega; si no ve pedidos, aunque lo active, no.
    await pool.query(`update usuarios_dashboard set avisa_pagos = true where id in ($1, $2)`, [CAJA, DECORACION])
    mockSend.mockClear()
    await nuevoAviso('pago_reportado', sede1)
    expect(quienRecibioPush()).toEqual(['Caja', 'Sara'])
    await pool.query(`update usuarios_dashboard set avisa_pagos = false where id in ($1, $2)`, [CAJA, DECORACION])
  })

  it('a quien provoca la orden no se le manda el push de lo que acaba de hacer', async () => {
    await nuevoAviso('orden_nueva', sede1, { excluirUsuarioId: OPS })
    expect(quienRecibioPush()).toEqual(['Caja', 'Empaque', 'Sara'])
  })

  it('registrar una orden de Rappi desde Órdenes avisa de punta a punta, y Órdenes no se avisa a sí misma', async () => {
    const payload = {
      referenciaExterna: REF,
      fechaEntrega: '2031-06-02',
      hora: '10:00 am',
      items: [{ productoId: producto, cantidad: 2 }],
      total: 20,
    }
    const r = await app.inject({
      method: 'POST',
      url: '/api/dashboard/ordenes/rappi',
      remoteAddress: '10.9.9.9',
      headers: { 'x-test-perfiles': 'ordenes', 'x-test-id': OPS },
      payload,
    })
    expect(r.statusCode).toBe(201)
    const numero = JSON.parse(r.body).numero as string
    // Sin local (Órdenes no tiene local): llega a quien tiene el aviso de órdenes, menos a Operaciones, que la registró.
    expect(quienRecibioPush()).toEqual(['Caja', 'Empaque', 'Sara'])
    const { rows } = await pool.query(`select tipo, titulo, sede_id from avisos where titulo = $1`, [`Orden Rappi · ${numero}`])
    expect(rows).toEqual([{ tipo: 'orden_nueva', titulo: `Orden Rappi · ${numero}`, sede_id: null }])
    // La campana: Operaciones sí la ve en la campana (el aviso es de la orden, no solo del push)
    expect(await quienVeLaCampana(`Orden Rappi · ${numero}`)).toEqual(['Caja', 'Empaque', 'Operaciones', 'Sara'])
  })

  it('el push de «orden nueva» abre Órdenes y el de «pago reportado» abre Pedidos', async () => {
    await nuevoAviso('orden_nueva', null)
    expect(JSON.parse(mockSend.mock.calls[0][1] as string)).toMatchObject({ url: '/#/ordenes', tipo: 'orden_nueva' })
    mockSend.mockClear()
    await nuevoAviso('pago_reportado', null)
    expect(JSON.parse(mockSend.mock.calls[0][1] as string)).toMatchObject({ url: '/#/pedidos', tipo: 'pago_reportado' })
  })
})

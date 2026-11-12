// Avisos al equipo (campana + notificaciones push, migración 0041). Sin servicios externos: `web-push` está mockeado
// (se comprueba a QUIÉN se manda, qué dice y qué pasa cuando el servicio de push responde 410/500), el SDK de
// Anthropic y el envío por WhatsApp también, y la verificación del JWT del panel se reemplaza por cabeceras de
// prueba (la real necesita el JWKS de Supabase por red). Todo lo demás corre real contra Postgres:
//   - avisarAlEquipo: guarda el aviso y manda el push a dirección + el local del aviso (todos si no tiene local);
//     un 404/410 borra la suscripción muerta; un fallo no corta a los demás; sin claves VAPID el aviso igual queda;
//     nunca lanza.
//   - el flujo del webhook con el bot apagado: «esperando persona» la primera vez y «mensaje nuevo» después.
//   - las rutas del panel (clave, suscribir, desuscribir, probar).
//   - la RLS: cada empleado ve los avisos de su local y los que no tienen local; las suscripciones no se leen.
// Necesita Postgres con el esquema (DATABASE_URL real); sin eso se salta.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

process.env.ANTHROPIC_API_KEY ||= 'dummy-para-test-mockeado-nunca-sale-un-request-real'
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({ messages: { create: vi.fn() } })),
}))

const mockSend = vi.fn()
vi.mock('web-push', () => ({ sendNotification: (...a: unknown[]) => mockSend(...a), generateVAPIDKeys: vi.fn() }))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const mockConfig = vi.fn()
vi.mock('../src/repositories/configuracionBotRepo.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/repositories/configuracionBotRepo.js')>()),
  leerConfiguracionBot: (...args: unknown[]) => mockConfig(...args),
}))

// El «operador» sale de cabeceras de prueba; sin x-test-rol no hay sesión.
vi.mock('../src/auth/verificarJwtOperador.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/auth/verificarJwtOperador.js')>()),
  verificarJwtOperador: async (
    req: { headers: Record<string, string | undefined>; operador?: unknown },
    reply: { code: (n: number) => { send: (b: unknown) => unknown } }
  ) => {
    const rol = req.headers['x-test-rol']
    if (!rol) return reply.code(401).send({ error: 'NO_AUTORIZADO' })
    req.operador = { id: req.headers['x-test-id'], rol, sedeId: req.headers['x-test-sede'] ?? null }
  },
}))

const { buildApp } = await import('../src/app.js')
const { avisarAlEquipo, registrarAviso, payloadDeAviso, recortar, LARGO_MAXIMO_CUERPO } = await import('../src/services/avisos.js')
const { sembrarConexion, quitarConexion } = await import('./conexionDePrueba.js')
const { cifrarTokenWhatsApp } = await import('../src/bot/tokensWhatsApp.js')

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))
const ADMIN = '55555555-0000-0000-0000-000000000001'
const EMP_1 = '55555555-0000-0000-0000-000000000002'
const EMP_2 = '55555555-0000-0000-0000-000000000003'
const EP = (n: string) => `https://push.ejemplo.test/${n}`
const logger = () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })

describe.skipIf(!hayBaseDeDatosReal)('avisos y push', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let tenantId: string
  let sede1: string
  let sede2: string
  let app: Awaited<ReturnType<typeof buildApp>>
  const PHONE_ID = 'PHONE_ID_AVISOS' // número de un local (sede 1)
  const PHONE_ID_BOT = 'PHONE_ID_AVISOS_BOT' // el número único del bot: sin local
  const TELEFONOS = ['999400001', '999400002']

  const vapid = () => {
    process.env.VAPID_PUBLIC_KEY = 'clave-publica-de-prueba'
    process.env.VAPID_PRIVATE_KEY = 'clave-privada-de-prueba'
    process.env.VAPID_SUBJECT = 'https://dashboard.bakebrothers.pe'
  }
  const sinVapid = () => {
    delete process.env.VAPID_PUBLIC_KEY
    delete process.env.VAPID_PRIVATE_KEY
  }
  const suscribir = async (usuario: string, endpoint: string) => {
    await pool.query(
      `insert into push_suscripciones (usuario_id, endpoint, p256dh, auth) values ($1, $2, 'p256dh-de-prueba', 'auth-de-prueba')
       on conflict (endpoint) do update set usuario_id = excluded.usuario_id`,
      [usuario, endpoint]
    )
  }
  const endpointsEnviados = () => mockSend.mock.calls.map(([sub]) => (sub as { endpoint: string }).endpoint).sort()
  const conversacionNueva = async (telefono: string, sede: string | null = null) =>
    (
      await client.query(
        `insert into conversaciones (tenant_id, canal, external_id, estado, sede_id) values ($1, 'whatsapp', $2, 'activa', $3) returning id`,
        [tenantId, telefono, sede]
      )
    ).rows[0].id as string
  const avisosDe = async (conversacionId: string) =>
    (await client.query(`select tipo, titulo, cuerpo, sede_id from avisos where conversacion_id = $1 order by creado_en, id`, [conversacionId])).rows

  beforeAll(async () => {
    client = await pool.connect()
    tenantId = (await client.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
    sede1 = (await client.query(`insert into sedes (nombre) values ('TEST avisos 1') returning id`)).rows[0].id
    sede2 = (await client.query(`insert into sedes (nombre) values ('TEST avisos 2') returning id`)).rows[0].id
    for (const id of [ADMIN, EMP_1, EMP_2]) await client.query(`insert into auth.users (id) values ($1) on conflict do nothing`, [id])
    await client.query(
      `insert into usuarios_dashboard (id, rol, sede_id) values ($1, 'admin', null), ($2, 'operador', $4), ($3, 'operador', $5)
       on conflict (id) do update set rol = excluded.rol, sede_id = excluded.sede_id`,
      [ADMIN, EMP_1, EMP_2, sede1, sede2]
    )
    await sembrarConexion(client, { sedeId: sede1, phoneNumberId: PHONE_ID })
    await client.query(`delete from whatsapp_conexiones where phone_number_id = $1`, [PHONE_ID_BOT])
    await client.query(
      `insert into whatsapp_conexiones (sede_id, waba_id, phone_number_id, token_cifrado, tipo_token, origen, uso)
       values (null, 'WABA_DE_PRUEBA', $1, $2, 'sistema', 'manual', 'bot')`,
      [PHONE_ID_BOT, cifrarTokenWhatsApp('token-de-prueba')]
    )
    app = await buildApp()
  })
  afterAll(async () => {
    await app.close()
    await client.query(`delete from mensajes_webhook_procesados where mensaje_id like 'wamid.AVISOS_%'`)
    await client.query(`delete from conversaciones where external_id = any($1)`, [TELEFONOS])
    await client.query(`delete from avisos where sede_id in ($1, $2) or titulo like 'TEST aviso%'`, [sede1, sede2])
    await client.query(`delete from push_suscripciones where usuario_id in ($1, $2, $3)`, [ADMIN, EMP_1, EMP_2])
    await quitarConexion(client, { sedeId: sede1, phoneNumberId: PHONE_ID })
    await client.query(`delete from whatsapp_conexiones where phone_number_id = $1`, [PHONE_ID_BOT])
    await client.query(`delete from usuarios_dashboard where id in ($1, $2, $3)`, [ADMIN, EMP_1, EMP_2])
    await client.query(`delete from auth.users where id in ($1, $2, $3)`, [ADMIN, EMP_1, EMP_2])
    await client.query(`delete from sedes where id in ($1, $2)`, [sede1, sede2])
    client.release()
    await pool.end()
  })
  beforeEach(async () => {
    vapid()
    mockSend.mockResolvedValue({ statusCode: 201 })
    mockFetch.mockResolvedValue({ ok: true, text: async () => '', json: async () => ({ messages: [{ id: 'wamid.SALIDA' }] }) } as unknown as Response)
    mockConfig.mockResolvedValue({ botActivo: false, bienvenidaActiva: false, mensajeBienvenida: 'Hola' })
    await client.query(`delete from push_suscripciones where usuario_id in ($1, $2, $3)`, [ADMIN, EMP_1, EMP_2])
    await client.query(`delete from conversaciones where external_id = any($1)`, [TELEFONOS])
    await client.query(`delete from avisos where sede_id in ($1, $2) or titulo like 'TEST aviso%'`, [sede1, sede2])
    await suscribir(ADMIN, EP('admin'))
    await suscribir(EMP_1, EP('emp1'))
    await suscribir(EMP_2, EP('emp2'))
  })
  afterEach(() => {
    mockSend.mockReset()
    mockFetch.mockReset()
    mockConfig.mockReset()
  })

  // ——————————————————————————————————————————————————————————— a quién se avisa ————
  describe('avisarAlEquipo', () => {
    it('un aviso de un local llega a dirección y a los empleados de ESE local, no a los del otro', async () => {
      const conv = await conversacionNueva(TELEFONOS[0], sede1)
      await avisarAlEquipo(logger(), { tipo: 'esperando_persona', titulo: 'TEST aviso 1', cuerpo: 'Hola', conversacionId: conv, sedeId: sede1 })
      expect(endpointsEnviados()).toEqual([EP('admin'), EP('emp1')])
      expect(await avisosDe(conv)).toHaveLength(1)
    })

    it('un aviso sin local (el número único todavía no sabe el local) llega a TODO el personal', async () => {
      const conv = await conversacionNueva(TELEFONOS[0], null)
      await avisarAlEquipo(logger(), { tipo: 'esperando_persona', titulo: 'TEST aviso 2', cuerpo: 'Hola', conversacionId: conv, sedeId: null })
      expect(endpointsEnviados()).toEqual([EP('admin'), EP('emp1'), EP('emp2')])
    })

    it('el push lleva título, texto recortado, la conversación a abrir y un tag por conversación; es urgente y con vigencia corta', async () => {
      const conv = await conversacionNueva(TELEFONOS[0], null)
      const largo = 'Quiero una torta '.repeat(30)
      await avisarAlEquipo(logger(), { tipo: 'mensaje_nuevo', titulo: 'TEST aviso 3', cuerpo: largo, conversacionId: conv, sedeId: null })
      const [, cuerpo, opciones] = mockSend.mock.calls[0]
      const payload = JSON.parse(cuerpo as string)
      expect(payload).toMatchObject({ titulo: 'TEST aviso 3', url: `/#/conversaciones?c=${conv}`, tag: `conv-${conv}`, tipo: 'mensaje_nuevo' })
      expect(payload.cuerpo.length).toBeLessThanOrEqual(LARGO_MAXIMO_CUERPO)
      expect(payload.cuerpo.endsWith('…')).toBe(true)
      expect(opciones).toMatchObject({ urgency: 'high', TTL: 3600, vapidDetails: { publicKey: 'clave-publica-de-prueba', privateKey: 'clave-privada-de-prueba' } })
    })

    it('un dispositivo que el servicio de push da por muerto (410/404) se borra; uno que falla por otra causa se conserva y no corta a los demás', async () => {
      const conv = await conversacionNueva(TELEFONOS[0], null)
      mockSend.mockImplementation(async (sub: { endpoint: string }) => {
        if (sub.endpoint === EP('admin')) throw Object.assign(new Error('Gone'), { statusCode: 410 })
        if (sub.endpoint === EP('emp1')) throw Object.assign(new Error('Server error'), { statusCode: 500 })
        return { statusCode: 201 }
      })
      const log = logger()
      await avisarAlEquipo(log, { tipo: 'esperando_persona', titulo: 'TEST aviso 4', cuerpo: 'Hola', conversacionId: conv, sedeId: null })
      const { rows } = await client.query(`select endpoint, ultimo_exito_en from push_suscripciones where usuario_id in ($1, $2, $3) order by endpoint`, [ADMIN, EMP_1, EMP_2])
      expect(rows.map((r) => r.endpoint)).toEqual([EP('emp1'), EP('emp2')]) // el de admin se borró
      expect(rows.find((r) => r.endpoint === EP('emp2')).ultimo_exito_en).not.toBeNull() // el que sí llegó queda marcado
      expect(log.warn).toHaveBeenCalledTimes(1) // el 500 se avisa, no se esconde
      expect(await avisosDe(conv)).toHaveLength(1) // y el aviso de la campana igual quedó
    })

    it('sin claves VAPID no se manda ningún push, pero el aviso de la campana SÍ queda guardado', async () => {
      sinVapid()
      const conv = await conversacionNueva(TELEFONOS[0], null)
      await avisarAlEquipo(logger(), { tipo: 'esperando_persona', titulo: 'TEST aviso 5', cuerpo: 'Hola', conversacionId: conv, sedeId: null })
      expect(mockSend).not.toHaveBeenCalled()
      expect(await avisosDe(conv)).toHaveLength(1)
    })

    it('nunca lanza: si el aviso no se puede guardar, lo loggea y no manda push', async () => {
      const log = logger()
      await expect(
        avisarAlEquipo(log, { tipo: 'esperando_persona', titulo: 'TEST aviso 6', cuerpo: 'Hola', conversacionId: '00000000-0000-0000-0000-00000000dead', sedeId: null })
      ).resolves.toBeUndefined()
      expect(log.error).toHaveBeenCalledTimes(1)
      expect(mockSend).not.toHaveBeenCalled()
    })

    it('recortar y payloadDeAviso: texto largo con saltos de línea queda en una línea y sin pasarse', () => {
      expect(recortar('hola\n\n  mundo')).toBe('hola mundo')
      expect(recortar('x'.repeat(500))).toHaveLength(LARGO_MAXIMO_CUERPO)
      expect(payloadDeAviso({ tipo: 'mensaje_nuevo', titulo: 't', cuerpo: 'c', conversacionId: null, sedeId: null })).toMatchObject({ url: '/#/conversaciones', tag: 'conversaciones' })
    })
  })

  // ——————————————————————————————————————————————————————————— el flujo del webhook ————
  describe('mensajes entrantes con el bot apagado', () => {
    const payload = (id: string, telefono: string, body: string, phoneId = PHONE_ID) => ({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA_DE_PRUEBA',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '51999999999', phone_number_id: phoneId },
                contacts: [{ profile: { name: 'Cliente' }, wa_id: telefono }],
                messages: [{ from: telefono, id, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body } }],
              },
            },
          ],
        },
      ],
    })
    const enviar = async (id: string, telefono: string, body: string, phoneId = PHONE_ID) => {
      expect((await app.inject({ method: 'POST', url: '/webhook', payload: payload(id, telefono, body, phoneId) })).statusCode).toBe(200)
      await esperar(800)
    }
    const convDe = async (telefono: string) =>
      (await client.query(`select id, estado from conversaciones where tenant_id = $1 and external_id = $2`, [tenantId, telefono])).rows[0]

    it('el primer mensaje avisa «esperando que lo atiendan» a todo el personal; los siguientes, «mensaje nuevo»', async () => {
      await enviar('wamid.AVISOS_1A', TELEFONOS[0], 'Hola, quiero una torta', PHONE_ID_BOT)
      const conv = await convDe(TELEFONOS[0])
      expect(conv.estado).toBe('escalada')
      let avisos = await avisosDe(conv.id)
      expect(avisos).toHaveLength(1)
      expect(avisos[0]).toMatchObject({ tipo: 'esperando_persona', sede_id: null })
      expect(avisos[0].titulo).toMatch(/espera que lo atiendan/)
      expect(avisos[0].cuerpo).toContain('Hola, quiero una torta')
      expect(endpointsEnviados()).toEqual([EP('admin'), EP('emp1'), EP('emp2')]) // sin local: lo ve todo el personal

      mockSend.mockClear()
      await enviar('wamid.AVISOS_1B', TELEFONOS[0], 'Es para el sábado', PHONE_ID_BOT)
      avisos = await avisosDe(conv.id)
      expect(avisos.map((a: { tipo: string }) => a.tipo)).toEqual(['esperando_persona', 'mensaje_nuevo'])
      expect(avisos[1].titulo).toMatch(/Mensaje nuevo de/)
      expect(mockSend).toHaveBeenCalledTimes(3)
    })

    it('si la conversación ya tiene local, el aviso es de ese local: solo dirección y su equipo', async () => {
      const conv = await conversacionNueva(TELEFONOS[1], sede1)
      await enviar('wamid.AVISOS_2', TELEFONOS[1], 'Hola')
      const avisos = await avisosDe(conv)
      expect(avisos[0]).toMatchObject({ tipo: 'esperando_persona', sede_id: sede1 })
      expect(endpointsEnviados()).toEqual([EP('admin'), EP('emp1')])
    })

    it('el mensaje se registra aunque el push falle por completo', async () => {
      mockSend.mockRejectedValue(Object.assign(new Error('caído'), { statusCode: 500 }))
      await enviar('wamid.AVISOS_3', TELEFONOS[0], 'Hola de nuevo', PHONE_ID_BOT)
      const conv = await convDe(TELEFONOS[0])
      expect(conv.estado).toBe('escalada')
      expect(await avisosDe(conv.id)).toHaveLength(1)
    })
  })

  // ——————————————————————————————————————————————————————————— las rutas del panel ————
  describe('rutas /api/dashboard/push', () => {
    const como = (id: string, rol = 'operador', sede: string | null = null) => ({ 'x-test-rol': rol, 'x-test-id': id, ...(sede ? { 'x-test-sede': sede } : {}) })

    it('sin sesión: 401 en todas', async () => {
      for (const [method, url] of [['GET', '/api/dashboard/push/clave'], ['POST', '/api/dashboard/push/suscribir'], ['POST', '/api/dashboard/push/desuscribir'], ['POST', '/api/dashboard/push/probar']] as const) {
        expect((await app.inject({ method, url, payload: {} })).statusCode).toBe(401)
      }
    })

    it('clave: devuelve la pública; sin configurar, 503 (la privada nunca sale)', async () => {
      const ok = await app.inject({ method: 'GET', url: '/api/dashboard/push/clave', headers: como(EMP_1) })
      expect(ok.statusCode).toBe(200)
      expect(ok.json()).toEqual({ clave: 'clave-publica-de-prueba' })
      expect(ok.body).not.toContain('privada')
      sinVapid()
      expect((await app.inject({ method: 'GET', url: '/api/dashboard/push/clave', headers: como(EMP_1) })).statusCode).toBe(503)
    })

    it('suscribir: guarda las llaves a nombre de quien lo pide; el mismo dispositivo pasa a quien lo activó último', async () => {
      const cuerpo = { endpoint: EP('celular-nuevo'), keys: { p256dh: 'AAA', auth: 'BBB' }, userAgent: 'Prueba' }
      expect((await app.inject({ method: 'POST', url: '/api/dashboard/push/suscribir', headers: como(EMP_1), payload: cuerpo })).statusCode).toBe(200)
      let { rows } = await client.query(`select usuario_id, p256dh, auth from push_suscripciones where endpoint = $1`, [EP('celular-nuevo')])
      expect(rows).toEqual([{ usuario_id: EMP_1, p256dh: 'AAA', auth: 'BBB' }])
      await app.inject({ method: 'POST', url: '/api/dashboard/push/suscribir', headers: como(EMP_2), payload: { ...cuerpo, keys: { p256dh: 'CCC', auth: 'DDD' } } })
      ;({ rows } = await client.query(`select usuario_id, p256dh from push_suscripciones where endpoint = $1`, [EP('celular-nuevo')]))
      expect(rows).toEqual([{ usuario_id: EMP_2, p256dh: 'CCC' }]) // una sola fila, ahora de EMP_2
    })

    it('suscribir: un endpoint inválido o sin llaves es 400', async () => {
      expect((await app.inject({ method: 'POST', url: '/api/dashboard/push/suscribir', headers: como(EMP_1), payload: { endpoint: 'no-es-url', keys: { p256dh: 'a', auth: 'b' } } })).statusCode).toBe(400)
      expect((await app.inject({ method: 'POST', url: '/api/dashboard/push/suscribir', headers: como(EMP_1), payload: { endpoint: EP('x') } })).statusCode).toBe(400)
    })

    it('desuscribir: borra solo el dispositivo propio', async () => {
      await app.inject({ method: 'POST', url: '/api/dashboard/push/desuscribir', headers: como(EMP_2), payload: { endpoint: EP('emp1') } })
      expect((await client.query(`select 1 from push_suscripciones where endpoint = $1`, [EP('emp1')])).rowCount).toBe(1) // de otro: intacto
      await app.inject({ method: 'POST', url: '/api/dashboard/push/desuscribir', headers: como(EMP_1), payload: { endpoint: EP('emp1') } })
      expect((await client.query(`select 1 from push_suscripciones where endpoint = $1`, [EP('emp1')])).rowCount).toBe(0)
    })

    it('probar: manda un aviso de prueba solo a los dispositivos de quien lo pide; sin dispositivos, 409; sin claves, 503', async () => {
      const r = await app.inject({ method: 'POST', url: '/api/dashboard/push/probar', headers: como(EMP_2) })
      expect(r.statusCode).toBe(200)
      expect(r.json()).toMatchObject({ enviados: 1, eliminadas: 0, fallidos: 0 })
      expect(endpointsEnviados()).toEqual([EP('emp2')])
      expect(JSON.parse(mockSend.mock.calls[0][1] as string)).toMatchObject({ tipo: 'prueba' })

      await client.query(`delete from push_suscripciones where usuario_id = $1`, [EMP_2])
      expect((await app.inject({ method: 'POST', url: '/api/dashboard/push/probar', headers: como(EMP_2) })).statusCode).toBe(409)
      sinVapid()
      expect((await app.inject({ method: 'POST', url: '/api/dashboard/push/probar', headers: como(EMP_1) })).statusCode).toBe(503)
    })
  })

  // ——————————————————————————————————————————————————————————— la RLS ————
  describe('RLS de avisos', () => {
    it('cada empleado ve los avisos de su local y los sin local; dirección ve todos; las suscripciones no se pueden leer', async (ctx) => {
      let puede = false
      try {
        await client.query('begin')
        await client.query('set local role authenticated')
        await client.query('reset role')
        await client.query('rollback')
        puede = true
      } catch {
        await client.query('rollback').catch(() => {})
      }
      if (!puede) return ctx.skip()

      await registrarAviso(client, { tipo: 'mensaje_nuevo', titulo: 'TEST aviso rls 1', cuerpo: 'x', conversacionId: null, sedeId: sede1 })
      await registrarAviso(client, { tipo: 'mensaje_nuevo', titulo: 'TEST aviso rls 2', cuerpo: 'x', conversacionId: null, sedeId: sede2 })
      await registrarAviso(client, { tipo: 'mensaje_nuevo', titulo: 'TEST aviso rls 3', cuerpo: 'x', conversacionId: null, sedeId: null })

      await client.query('begin')
      try {
        const como = async (uid: string, sql: string, params: unknown[] = []) => {
          await client.query('savepoint intento')
          try {
            await client.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' }), uid])
            await client.query('set local role authenticated')
            const r = await client.query(sql, params)
            return { filas: r.rows as Record<string, unknown>[] }
          } catch (err) {
            return { error: (err as { code?: string }).code }
          } finally {
            await client.query('rollback to savepoint intento')
          }
        }
        const titulos = (r: { filas?: Record<string, unknown>[] }) => (r.filas ?? []).map((f) => f.titulo as string).sort()
        const consulta = `select titulo from avisos where titulo like 'TEST aviso rls%'`

        expect(titulos(await como(EMP_1, consulta))).toEqual(['TEST aviso rls 1', 'TEST aviso rls 3'])
        expect(titulos(await como(EMP_2, consulta))).toEqual(['TEST aviso rls 2', 'TEST aviso rls 3'])
        expect(titulos(await como(ADMIN, consulta))).toEqual(['TEST aviso rls 1', 'TEST aviso rls 2', 'TEST aviso rls 3'])
        // Un empleado no escribe avisos ni lee las llaves de los dispositivos.
        expect(await como(EMP_1, `insert into avisos (tipo, titulo, cuerpo) values ('mensaje_nuevo', 'x', 'x')`)).toEqual({ error: '42501' })
        expect(await como(ADMIN, `select * from push_suscripciones`)).toEqual({ error: '42501' })
        // Cada uno maneja SOLO su propio cursor de «avisos vistos».
        expect((await como(EMP_1, `insert into avisos_cursor (usuario_id) values ($1) returning usuario_id`, [EMP_1])).filas).toHaveLength(1)
        expect(await como(EMP_1, `insert into avisos_cursor (usuario_id) values ($1)`, [EMP_2])).toEqual({ error: '42501' })
      } finally {
        await client.query('rollback')
        await client.query(`delete from avisos where titulo like 'TEST aviso rls%'`)
      }
    })
  })
})

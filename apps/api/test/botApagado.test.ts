// Interruptor «Bot activo / apagado» (configuracion_bot, migración 0040). SIN Claude real: el SDK de Anthropic está
// mockeado (la prueba clave es que NO se llame con el bot apagado) y el envío por WhatsApp también (fetch).
//   - Apagado: el mensaje entra directo a Conversaciones como «esperando persona» (escalada), sin llamar al modelo,
//     sin `ultimoError` ni `error` en el log, ni siquiera para una imagen (no se descarga ni se lee).
//   - Bienvenida fija opcional: una vez por sesión, no si ya hay alguien atendiendo, y solo se anota si salió.
//   - Encendido: el bot funciona como siempre.
//   - Seguridad: si no se puede leer la configuración, se atiende como apagado (nunca se llama al modelo «por las dudas»).
//   - La base: arranca apagado y solo el admin la puede cambiar (RLS real).
// La configuración de los tests de webhook se controla con un mock de configuracionBotRepo (no se toca la fila real,
// que comparten los demás archivos que corren en paralelo). Necesita Postgres con el esquema; sin eso se salta.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

process.env.ANTHROPIC_API_KEY ||= 'dummy-para-test-mockeado-nunca-sale-un-request-real'
const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({ messages: { create: mockCreate } })),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const mockConfig = vi.fn()
vi.mock('../src/repositories/configuracionBotRepo.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/repositories/configuracionBotRepo.js')>()),
  leerConfiguracionBot: (...args: unknown[]) => mockConfig(...args),
}))

const { buildApp } = await import('../src/app.js')
const { sembrarConexion, quitarConexion } = await import('./conexionDePrueba.js')
const { atenderMensajeSinBot, yaSeSaludoOHablaronRecientemente, MOTIVO_BOT_APAGADO, BIENVENIDA_VENTANA_HORAS } = await import(
  '../src/bot/atencionSinBot.js'
)

const BIENVENIDA = 'Hola, gracias por escribir a Bake Brothers. En unos minutos te atendemos.'
const APAGADO = { botActivo: false, bienvenidaActiva: false, mensajeBienvenida: BIENVENIDA }
const APAGADO_CON_BIENVENIDA = { ...APAGADO, bienvenidaActiva: true }
const ENCENDIDO = { botActivo: true, bienvenidaActiva: false, mensajeBienvenida: BIENVENIDA }

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

function payload(mensajeId: string, telefono: string, mensaje: Record<string, unknown>) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_DE_PRUEBA',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '51999999999', phone_number_id: 'PHONE_ID_BOT_APAGADO' },
              contacts: [{ profile: { name: 'Cliente de prueba' }, wa_id: telefono }],
              messages: [{ from: telefono, id: mensajeId, timestamp: String(Math.floor(Date.now() / 1000)), ...mensaje }],
            },
          },
        ],
      },
    ],
  }
}
const texto = (id: string, tel: string, body: string) => payload(id, tel, { type: 'text', text: { body } })
const imagen = (id: string, tel: string, caption?: string) =>
  payload(id, tel, { type: 'image', image: { id: `media-${id}`, mime_type: 'image/jpeg', ...(caption ? { caption } : {}) } })

describe.skipIf(!hayBaseDeDatosReal)('bot apagado: la atiende una persona', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let tenantId: string
  let sedeId: string
  let app: Awaited<ReturnType<typeof buildApp>>
  const PHONE_ID = 'PHONE_ID_BOT_APAGADO'
  const TELEFONOS = ['999300001', '999300002', '999300003', '999300004', '999300005', '999300006', '999300007', '999300008', '999300009']

  const conversacion = async (telefono: string) =>
    (await client.query(`select estado, historial, contexto from conversaciones where tenant_id = $1 and canal = 'whatsapp' and external_id = $2`, [tenantId, telefono])).rows[0]
  const enviar = async (cuerpo: unknown) => {
    const r = await app.inject({ method: 'POST', url: '/webhook', payload: cuerpo as object })
    expect(r.statusCode).toBe(200)
    await esperar(700) // el procesamiento corre en segundo plano, después del 200
  }
  const llamadasAMeta = () => mockFetch.mock.calls.filter(([url]) => String(url).includes('graph.facebook.com'))

  beforeAll(async () => {
    client = await pool.connect()
    tenantId = (await client.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
    sedeId = (await client.query(`insert into sedes (nombre) values ('TEST bot apagado') returning id`)).rows[0].id
    await sembrarConexion(client, { sedeId, phoneNumberId: PHONE_ID })
    app = await buildApp()
  })
  afterAll(async () => {
    await app.close()
    await client.query(`delete from mensajes_webhook_procesados where mensaje_id like 'wamid.APAGADO_%'`)
    await client.query(`delete from conversaciones where external_id = any($1)`, [TELEFONOS])
    await quitarConexion(client, { sedeId, phoneNumberId: PHONE_ID })
    await client.query(`delete from sedes where id = $1`, [sedeId])
    client.release()
    await pool.end()
  })
  beforeEach(async () => {
    mockFetch.mockResolvedValue({ ok: true, text: async () => '', json: async () => ({ messages: [{ id: 'wamid.SALIDA' }] }) } as unknown as Response)
    await client.query(`delete from conversaciones where external_id = any($1)`, [TELEFONOS])
  })
  afterEach(() => {
    mockCreate.mockReset()
    mockFetch.mockReset()
    mockConfig.mockReset()
  })

  it('apagado: el mensaje queda esperando persona, sin Claude, sin error y sin enviar nada', async () => {
    mockConfig.mockResolvedValue(APAGADO)
    await enviar(texto('wamid.APAGADO_1', TELEFONOS[0], 'Hola, quiero una torta para el sábado'))

    const c = await conversacion(TELEFONOS[0])
    expect(c.estado).toBe('escalada')
    expect(c.historial).toHaveLength(1)
    expect(c.historial[0]).toMatchObject({ rol: 'cliente', texto: 'Hola, quiero una torta para el sábado' })
    expect(c.contexto.ultimaEscalacion.motivo).toBe(MOTIVO_BOT_APAGADO)
    expect(c.contexto.ultimoError).toBeUndefined() // no es un error
    expect(mockCreate).not.toHaveBeenCalled() // ni una llamada al modelo
    expect(llamadasAMeta()).toHaveLength(0) // y no se manda ninguna respuesta automática
  })

  it('apagado: varios mensajes seguidos se acumulan en la misma conversación sin cambiar su estado', async () => {
    mockConfig.mockResolvedValue(APAGADO)
    await enviar(texto('wamid.APAGADO_2A', TELEFONOS[1], 'Hola'))
    await enviar(texto('wamid.APAGADO_2B', TELEFONOS[1], '¿Atienden hoy?'))
    const c = await conversacion(TELEFONOS[1])
    expect(c.estado).toBe('escalada')
    expect(c.historial.map((h: { texto: string }) => h.texto)).toEqual(['Hola', '¿Atienden hoy?'])
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('apagado: la referencia de campaña se guarda aparte y no se le muestra al equipo', async () => {
    mockConfig.mockResolvedValue(APAGADO)
    await enviar(texto('wamid.APAGADO_3', TELEFONOS[2], 'Hola, quiero hacer un pedido (ref: tt-halloween)'))
    const c = await conversacion(TELEFONOS[2])
    expect(c.historial[0].texto).toBe('Hola, quiero hacer un pedido')
    expect(c.contexto.campana).toBe('tt-halloween')
  })

  it('apagado: una imagen (captura de pago) no se descarga ni se lee con el modelo: la ve una persona', async () => {
    mockConfig.mockResolvedValue(APAGADO)
    await enviar(imagen('wamid.APAGADO_4', TELEFONOS[3], 'aquí mi pago'))
    const c = await conversacion(TELEFONOS[3])
    expect(c.estado).toBe('escalada')
    expect(c.historial[0].texto).toBe('[Imagen recibida] · aquí mi pago')
    expect(c.contexto.ultimoError).toBeUndefined()
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled() // ni siquiera se pide la imagen a Meta
  })

  it('apagado + bienvenida: manda el texto fijo UNA vez y lo anota como automático; el siguiente mensaje no repite', async () => {
    mockConfig.mockResolvedValue(APAGADO_CON_BIENVENIDA)
    await enviar(texto('wamid.APAGADO_5A', TELEFONOS[4], 'Hola'))
    const salida = llamadasAMeta()
    expect(salida).toHaveLength(1)
    expect(JSON.parse(salida[0][1].body)).toMatchObject({ type: 'text', text: { body: BIENVENIDA } })
    let c = await conversacion(TELEFONOS[4])
    expect(c.estado).toBe('escalada')
    expect(c.historial.map((h: { rol: string }) => h.rol)).toEqual(['cliente', 'bot'])
    expect(c.historial[1]).toMatchObject({ texto: BIENVENIDA, automatico: true })

    await enviar(texto('wamid.APAGADO_5B', TELEFONOS[4], '¿Me ayudas con un pedido?'))
    expect(llamadasAMeta()).toHaveLength(1) // sigue siendo uno solo
    c = await conversacion(TELEFONOS[4])
    expect(c.historial).toHaveLength(3)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('apagado + bienvenida: si el envío falla, la conversación igual queda esperando persona y no se anota un saludo que no salió', async () => {
    mockConfig.mockResolvedValue(APAGADO_CON_BIENVENIDA)
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'falla de Meta' } as unknown as Response)
    await enviar(texto('wamid.APAGADO_6', TELEFONOS[5], 'Hola'))
    const c = await conversacion(TELEFONOS[5])
    expect(c.estado).toBe('escalada')
    expect(c.historial.map((h: { rol: string }) => h.rol)).toEqual(['cliente'])
    expect(c.contexto.ultimoError).toBeUndefined()
  })

  it('apagado + bienvenida: no saluda si una persona ya está atendiendo la conversación', async () => {
    mockConfig.mockResolvedValue(APAGADO_CON_BIENVENIDA)
    await enviar(texto('wamid.APAGADO_7A', TELEFONOS[6], 'Hola'))
    mockFetch.mockClear()
    await client.query(`update conversaciones set estado = 'atendida_por_operador', historial = '[]'::jsonb where external_id = $1`, [TELEFONOS[6]])
    await enviar(texto('wamid.APAGADO_7B', TELEFONOS[6], 'Otra consulta'))
    expect(llamadasAMeta()).toHaveLength(0)
    expect((await conversacion(TELEFONOS[6])).estado).toBe('atendida_por_operador')
  })

  it('apagado: una conversación cerrada que vuelve a escribir se reabre y queda esperando persona', async () => {
    mockConfig.mockResolvedValue(APAGADO)
    await enviar(texto('wamid.APAGADO_8A', TELEFONOS[7], 'Hola'))
    await client.query(`update conversaciones set estado = 'atendida_por_operador' where external_id = $1`, [TELEFONOS[7]])
    await client.query(`update conversaciones set estado = 'cerrada' where external_id = $1`, [TELEFONOS[7]])
    await enviar(texto('wamid.APAGADO_8B', TELEFONOS[7], 'Volví a escribir'))
    const c = await conversacion(TELEFONOS[7])
    expect(c.estado).toBe('escalada')
    expect(c.historial.at(-1)).toMatchObject({ rol: 'cliente', texto: 'Volví a escribir' })
  })

  it('si no se puede leer la configuración, se atiende como apagado: nunca se llama al modelo', async () => {
    mockConfig.mockRejectedValue(new Error('base caída (simulado)'))
    await enviar(texto('wamid.APAGADO_9', TELEFONOS[8], 'Hola'))
    expect((await conversacion(TELEFONOS[8])).estado).toBe('escalada')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('encendido: el bot responde como siempre (el modelo sí se llama y su respuesta sale por WhatsApp)', async () => {
    mockConfig.mockResolvedValue(ENCENDIDO)
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '¡Hola! ¿En qué te ayudo?' }], stop_reason: 'end_turn' })
    await enviar(texto('wamid.APAGADO_ON', TELEFONOS[0], 'Hola'))
    expect(mockCreate).toHaveBeenCalled()
    const c = await conversacion(TELEFONOS[0])
    expect(c.estado).toBe('activa')
    expect(c.historial.at(-1)).toMatchObject({ rol: 'bot', texto: '¡Hola! ¿En qué te ayudo?' })
    expect(llamadasAMeta()).toHaveLength(1)
  })
})

describe('bienvenida automática: cuándo no se repite', () => {
  const ahora = new Date('2026-11-09T15:00:00Z')
  const hace = (h: number) => new Date(ahora.getTime() - h * 3_600_000).toISOString()

  it('sin saludos ni respuestas de una persona recientes → se puede saludar', () => {
    expect(yaSeSaludoOHablaronRecientemente([], ahora)).toBe(false)
    expect(yaSeSaludoOHablaronRecientemente([{ rol: 'cliente', en: hace(1) }], ahora)).toBe(false)
    // un mensaje del bot (con IA, no automático) no cuenta como saludo
    expect(yaSeSaludoOHablaronRecientemente([{ rol: 'bot', en: hace(1) }], ahora)).toBe(false)
  })
  it('un saludo automático o una respuesta de una persona dentro de la ventana → no se repite', () => {
    expect(yaSeSaludoOHablaronRecientemente([{ rol: 'bot', automatico: true, en: hace(2) }], ahora)).toBe(true)
    expect(yaSeSaludoOHablaronRecientemente([{ rol: 'operador', en: hace(BIENVENIDA_VENTANA_HORAS - 1) }], ahora)).toBe(true)
  })
  it('pasada la ventana vuelve a saludar (una conversación nueva días después)', () => {
    expect(yaSeSaludoOHablaronRecientemente([{ rol: 'bot', automatico: true, en: hace(BIENVENIDA_VENTANA_HORAS + 1) }], ahora)).toBe(false)
  })
})

describe('atenderMensajeSinBot: sin errores en el log', () => {
  it('no escribe nada en logger.error (apagado es el modo normal, no una falla)', async () => {
    if (!hayBaseDeDatosReal) return
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    const c = await pool.connect()
    const tenantId = (await c.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
    const conv = (
      await c.query(`insert into conversaciones (tenant_id, canal, external_id, estado) values ($1, 'whatsapp', '999300099', 'activa') returning id`, [tenantId])
    ).rows[0].id
    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
    try {
      const r = await atenderMensajeSinBot(
        logger as never,
        tenantId,
        conv,
        { mensajeId: 'wamid.APAGADO_LOG', telefono: '999300099', texto: 'Hola', phoneNumberId: 'X' },
        APAGADO
      )
      expect(r).toMatchObject({ estadoPrevio: 'activa', pasoAEsperando: true, bienvenida: null })
      expect(logger.error).not.toHaveBeenCalled()
      expect(logger.warn).not.toHaveBeenCalled()
    } finally {
      await c.query(`delete from conversaciones where id = $1`, [conv])
      c.release()
      await pool.end()
    }
  })
})

describe.skipIf(!hayBaseDeDatosReal)('la tabla configuracion_bot', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let puede = false
  const ADMIN = '44444444-0000-0000-0000-000000000001'
  const EMPLEADO = '44444444-0000-0000-0000-000000000002'

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

  it('arranca APAGADO y sin bienvenida (el valor por defecto de las columnas; la fila de la base de pruebas puede estar encendida por el setup)', async () => {
    const { rows } = await client.query(
      `select column_name, column_default from information_schema.columns where table_name = 'configuracion_bot' and column_name in ('bot_activo', 'bienvenida_activa')`
    )
    const porColumna = Object.fromEntries(rows.map((r) => [r.column_name, r.column_default]))
    expect(porColumna).toEqual({ bot_activo: 'false', bienvenida_activa: 'false' })
    expect((await client.query(`select count(*)::int n from configuracion_bot`)).rows[0].n).toBe(1)
  })

  it('el personal la lee, pero solo el admin la cambia (RLS real) y la base sella quién y cuándo', async (ctx) => {
    if (!puede) return ctx.skip()
    await client.query('begin')
    try {
      const sede = (await client.query(`insert into sedes (nombre) values ('Cfg sede') returning id`)).rows[0].id
      for (const id of [ADMIN, EMPLEADO]) await client.query(`insert into auth.users (id) values ($1)`, [id])
      await client.query(`insert into usuarios_dashboard (id, rol, sede_id) values ($1, 'admin', null), ($2, 'operador', $3)`, [ADMIN, EMPLEADO, sede])

      // Cada intento corre en un savepoint con el rol y los claims reales de PostgREST y se deshace al terminar.
      const intentar = async (uid: string, sql: string, params: unknown[] = []) => {
        await client.query('savepoint intento')
        try {
          await client.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' }), uid])
          await client.query('set local role authenticated')
          const r = await client.query(sql, params)
          return { filas: r.rows, cuenta: r.rowCount }
        } catch (err) {
          return { error: (err as { code?: string }).code }
        } finally {
          await client.query('rollback to savepoint intento')
        }
      }

      // El empleado la LEE…
      expect(await intentar(EMPLEADO, `select bot_activo from configuracion_bot`)).toMatchObject({ cuenta: 1 })
      // …pero NO la cambia: la política no le deja ninguna fila para actualizar.
      expect(await intentar(EMPLEADO, `update configuracion_bot set bot_activo = true`)).toMatchObject({ cuenta: 0 })
      // Tampoco puede tocar las columnas de control (no tiene el permiso de columna).
      expect(await intentar(EMPLEADO, `update configuracion_bot set actualizado_por = $1`, [EMPLEADO])).toEqual({ error: '42501' })

      // El admin sí, y queda sellado con su id.
      const delAdmin = await intentar(ADMIN, `update configuracion_bot set bot_activo = true, bienvenida_activa = true returning bot_activo, bienvenida_activa, actualizado_por`)
      expect(delAdmin).toMatchObject({ cuenta: 1 })
      expect((delAdmin as { filas: unknown[] }).filas[0]).toMatchObject({ bot_activo: true, bienvenida_activa: true, actualizado_por: ADMIN })
      // Un mensaje de bienvenida vacío no es válido.
      expect(await intentar(ADMIN, `update configuracion_bot set mensaje_bienvenida = '   '`)).toEqual({ error: '23514' })
    } finally {
      await client.query('rollback')
    }
  })
})

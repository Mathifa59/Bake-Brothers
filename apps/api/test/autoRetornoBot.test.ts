// Coexistence: auto-retorno del bot, mensajes importados fuera del contexto de
// Claude, y números no conectados ignorados — todo de punta a punta por el
// webhook real contra Postgres real (SDK de Anthropic y fetch mockeados: no hay
// credenciales reales de Meta ni se llama al modelo de verdad).
//
// Evaluación PEREZOSA, sin cron: el bot solo retoma una conversación cuando
// llega un mensaje nuevo del cliente Y el último mensaje humano tiene más de
// AUTO_RETORNO_BOT_HORAS (3 por defecto). Solo aplica a pausas por echo.
//
// Se salta si falta DATABASE_URL real. Necesita un rol miembro de app_api (ver
// test/webhookWhatsApp.test.ts), con delete en sedes/whatsapp_conexiones.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

process.env.ANTHROPIC_API_KEY ||= 'dummy-para-test-mockeado-nunca-sale-un-request-real'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { buildApp } = await import('../src/app.js')
const { sembrarConexion, quitarConexion } = await import('./conexionDePrueba.js')

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const PHONE_ID = 'PHONE_ID_AUTO_RETORNO'

function payloadWhatsApp(mensajeId: string, telefono: string, texto: string, phoneNumberId = PHONE_ID) {
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
              metadata: { display_phone_number: '51999999999', phone_number_id: phoneNumberId },
              contacts: [{ profile: { name: 'Cliente de prueba' }, wa_id: telefono }],
              messages: [
                { from: telefono, id: mensajeId, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: texto } },
              ],
            },
          },
        ],
      },
    ],
  }
}

describe.skipIf(!hayBaseDeDatosReal)('Coexistence — auto-retorno del bot, importados y números no conectados (real)', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let tenantId: string
  let sedeId: string
  const creadas: string[] = []
  const mensajesIds: string[] = []

  beforeAll(async () => {
    client = await pool.connect()
    tenantId = (await client.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
    sedeId = (await client.query(`insert into sedes (nombre) values ('TEST auto-retorno') returning id`)).rows[0].id
    await sembrarConexion(client, { sedeId, phoneNumberId: PHONE_ID })
  })

  afterAll(async () => {
    await quitarConexion(client, { sedeId, phoneNumberId: PHONE_ID })
    await client.query(`delete from conversaciones where sede_id = $1`, [sedeId])
    await client.query(`delete from sedes where id = $1`, [sedeId])
    client.release()
    await pool.end()
  })

  beforeEach(() => {
    mockFetch.mockResolvedValue({ ok: true, text: async () => '' } as unknown as Response)
  })

  afterEach(async () => {
    mockCreate.mockReset()
    mockFetch.mockReset()
    for (const id of creadas.splice(0)) await client.query(`delete from conversaciones where id = $1`, [id])
    for (const id of mensajesIds.splice(0)) await client.query(`delete from mensajes_webhook_procesados where mensaje_id = $1`, [id])
  })

  /** Conversación ya `atendida_por_operador`, con el último mensaje humano hace `horasAtras` horas. */
  async function conversacionAtendida(telefono: string, opciones: { pausadaPorEcho: boolean; horasAtras: number; historial?: unknown[] }) {
    const historial = opciones.historial ?? [
      { rol: 'cliente', texto: 'Hola, ¿hacen tortas por encargo?', en: new Date().toISOString() },
      { rol: 'operador', texto: 'Sí, claro. Te cuento desde el celular del local.', en: new Date().toISOString() },
    ]
    const { rows } = await client.query(
      `insert into conversaciones (tenant_id, canal, external_id, sede_id, estado, historial, pausada_por_echo, ultimo_mensaje_humano_en)
       values ($1, 'whatsapp', $2, $3, 'atendida_por_operador', $4::jsonb, $5, now() - make_interval(mins => $6::int))
       returning id`,
      [tenantId, telefono, sedeId, JSON.stringify(historial), opciones.pausadaPorEcho, Math.round(opciones.horasAtras * 60)]
    )
    creadas.push(rows[0].id)
    return rows[0].id as string
  }

  async function enviarYEsperar(telefono: string, texto: string, esperarHasta: (conv: Record<string, any>) => boolean) {
    const mensajeId = `wamid.TEST_AR_${telefono}_${Date.now()}`
    mensajesIds.push(mensajeId)
    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/webhook', payload: payloadWhatsApp(mensajeId, telefono, texto) })
    expect(res.statusCode).toBe(200)
    let fila: Record<string, any> = {}
    for (let intento = 0; intento < 20; intento++) {
      await esperar(250)
      fila = (await client.query(`select * from conversaciones where tenant_id = $1 and canal = 'whatsapp' and external_id = $2`, [tenantId, telefono])).rows[0]
      if (fila && esperarHasta(fila)) break
    }
    return fila
  }

  it('echo RECIENTE (1 h < 3 h): el bot sigue callado — guarda el mensaje, no llama a Claude ni manda nada', async () => {
    const telefono = '999100001'
    const id = await conversacionAtendida(telefono, { pausadaPorEcho: true, horasAtras: 1 })

    const fila = await enviarYEsperar(telefono, 'Y cuánto sería para 20 personas?', (c) => c.historial.length > 2)

    expect(fila.historial.length).toBe(3)
    expect(fila.historial[2]).toMatchObject({ rol: 'cliente', texto: 'Y cuánto sería para 20 personas?' })
    expect(fila.estado).toBe('atendida_por_operador')
    expect(fila.pausada_por_echo).toBe(true)
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
    expect(id).toBe(fila.id)
  })

  it('echo ANTIGUO (4 h > 3 h): el bot retoma — pasa a activa, responde por WhatsApp y apaga la pausa', async () => {
    const telefono = '999100002'
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: '¡Hola de nuevo! Con gusto te ayudo con la torta 😊' }] })
    await conversacionAtendida(telefono, { pausadaPorEcho: true, horasAtras: 4 })

    const fila = await enviarYEsperar(telefono, 'Quiero seguir con lo de la torta', (c) => c.historial.length > 3)

    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(fila.estado).toBe('activa')
    expect(fila.pausada_por_echo).toBe(false) // el trigger apaga el flag al salir de atendida_por_operador
    expect(fila.contexto.autoRetorno).toMatchObject({ horas: 3 })
    expect(fila.historial.map((h: { rol: string }) => h.rol)).toEqual(['cliente', 'operador', 'cliente', 'bot'])
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const cuerpo = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(cuerpo.to).toBe(telefono)
    expect(cuerpo.text.body).toMatch(/Hola de nuevo/)
  })

  it('una escalada del BOT que luego tomó un humano NUNCA se auto-retorna, por antigua que sea', async () => {
    const telefono = '999100003'
    // pausada_por_echo = false: la conversación la escaló el bot (semáforo/alergia/reclamo/error) y la tomó un operador.
    await conversacionAtendida(telefono, { pausadaPorEcho: false, horasAtras: 500 })

    const fila = await enviarYEsperar(telefono, '¿Hola? ¿Alguien me puede ayudar?', (c) => c.historial.length > 2)

    expect(fila.historial.length).toBe(3)
    expect(fila.estado).toBe('atendida_por_operador')
    expect(fila.pausada_por_echo).toBe(false)
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('los mensajes IMPORTADOS no viajan a Claude (solo los reales), y el del equipo entra como turno del asistente', async () => {
    const telefono = '999100004'
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'Claro, te ayudo.' }] })
    const hace = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString()
    await conversacionAtendida(telefono, {
      pausadaPorEcho: true,
      horasAtras: 5,
      historial: [
        { rol: 'cliente', texto: 'IMPORTADO-VIEJO-1 pedí una caja hace meses', en: hace(90), importado: true },
        { rol: 'operador', texto: 'IMPORTADO-VIEJO-2 te la mandamos', en: hace(90), importado: true },
        { rol: 'cliente', texto: 'Hola, quiero una torta', en: hace(1) },
        { rol: 'operador', texto: 'REAL-EQUIPO te escribo desde el celular', en: hace(1) },
      ],
    })

    await enviarYEsperar(telefono, 'Sí, la quiero para el sábado', (c) => c.historial.length > 5)

    expect(mockCreate).toHaveBeenCalledTimes(1)
    const enviados = (mockCreate.mock.calls[0][0] as { messages: { role: string; content: string }[] }).messages
    const texto = JSON.stringify(enviados)
    expect(texto).not.toContain('IMPORTADO-VIEJO')
    expect(enviados.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(enviados[1].content).toContain('REAL-EQUIPO')
    expect(enviados[2].content).toBe('Sí, la quiero para el sábado')
  })

  it('un mensaje de un número NO conectado se ignora: 200, sin conversación, sin idempotencia, sin Claude ni envío', async () => {
    const telefono = '999100005'
    const mensajeId = `wamid.TEST_NOCONECTADO_${Date.now()}`
    mensajesIds.push(mensajeId)

    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/webhook',
      payload: payloadWhatsApp(mensajeId, telefono, 'Hola, ¿están abiertos?', 'PHONE_ID_AJENO_NO_CONECTADO'),
    })
    expect(res.statusCode).toBe(200)
    await esperar(700)

    expect((await client.query(`select count(*)::int as n from conversaciones where external_id = $1`, [telefono])).rows[0].n).toBe(0)
    expect((await client.query(`select count(*)::int as n from mensajes_webhook_procesados where mensaje_id = $1`, [mensajeId])).rows[0].n).toBe(0)
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('una conexión desconectada deja de contar como número conectado', async () => {
    const telefono = '999100006'
    await client.query(`update whatsapp_conexiones set estado = 'desconectada' where phone_number_id = $1`, [PHONE_ID])
    try {
      const mensajeId = `wamid.TEST_DESCONECTADO_${Date.now()}`
      mensajesIds.push(mensajeId)
      const app = await buildApp()
      const res = await app.inject({ method: 'POST', url: '/webhook', payload: payloadWhatsApp(mensajeId, telefono, 'hola') })
      expect(res.statusCode).toBe(200)
      await esperar(500)
      expect((await client.query(`select count(*)::int as n from conversaciones where external_id = $1`, [telefono])).rows[0].n).toBe(0)
      expect(mockCreate).not.toHaveBeenCalled()
    } finally {
      await client.query(`update whatsapp_conexiones set estado = 'activa' where phone_number_id = $1`, [PHONE_ID])
    }
  })
})

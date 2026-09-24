// Prueba real de POST /api/dashboard/conversaciones/:id/responder — la
// bandeja de Conversaciones del dashboard ya no escribe directo en Supabase,
// pasa por acá para mandar el mensaje real por WhatsApp (enviarMensajeMeta,
// la misma función real que ya usa el bot) y solo actualizar
// historial/estado si el envío tiene éxito.
//
// JWT real de las 3 cuentas reales de personal (ver CLAUDE.md §9/§7) —
// TEST_JWT_OPERADOR_ALAMEDA (operador, sede Cedros), TEST_JWT_OPERADOR_SM
// (operador, sede Santa Marina) y TEST_JWT_ADMIN (admin). Se salta si falta
// alguna o DATABASE_URL real.
//
// fetch está mockeado, pero SOLO para las llamadas a la Cloud API de Meta
// (graph.facebook.com) — esta ruta, a diferencia de webhookWhatsApp.test.ts,
// sí pasa por verificarJwtOperador, que internamente usa jose
// (createRemoteJWKSet) para traer el JWKS público real de Supabase vía
// fetch. Mockear fetch a ciegas rompía esa verificación en silencio (todo
// devolvía 401) — encontrado real corriendo el test, no adivinado. Cualquier
// URL que no sea de Meta se deja pasar al fetch real.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER
const JWT_ALAMEDA = process.env.TEST_JWT_OPERADOR_ALAMEDA
const JWT_SM = process.env.TEST_JWT_OPERADOR_SM
const JWT_ADMIN = process.env.TEST_JWT_ADMIN
const tieneJwts = !!JWT_ALAMEDA && !!JWT_SM && !!JWT_ADMIN

process.env.META_WHATSAPP_TOKEN ||= 'dummy-token-para-test-fetch-mockeado'

const fetchReal = globalThis.fetch
const llamadasGraph: Array<[string, RequestInit]> = []
let proximaRespuestaGraph: (() => Promise<{ ok: boolean; status?: number; text: () => Promise<string> }>) | null = null

const mockFetch = vi.fn(async (url: unknown, opciones?: RequestInit) => {
  const urlStr = String(url)
  if (urlStr.startsWith('https://graph.facebook.com/')) {
    llamadasGraph.push([urlStr, opciones as RequestInit])
    if (!proximaRespuestaGraph) {
      throw new Error('mockFetch: no se configuró una respuesta para la llamada a Graph API de Meta')
    }
    const generar = proximaRespuestaGraph
    proximaRespuestaGraph = null
    return generar()
  }
  // Todo lo demás (JWKS real de Supabase, etc.) pasa sin tocar.
  return fetchReal(urlStr, opciones)
})
vi.stubGlobal('fetch', mockFetch)

const { buildApp } = await import('../src/app.js')

const SEDE_CEDROS = '2624c21c-0248-4a88-b234-7fc88005104c'
const SEDE_SANTA_MARINA = '0638b47f-854b-47d7-aed1-56b0115c5d31'
const PHONE_ID_TEST = 'PHONE_ID_TEST_DASHBOARD_CONV'

describe.skipIf(!hayBaseDeDatosReal || !tieneJwts)('POST /api/dashboard/conversaciones/:id/responder (real)', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let tenantId: string

  beforeAll(async () => {
    client = await pool.connect()
    const { rows } = await client.query(`select id from tenants where slug = 'bake-brothers'`)
    tenantId = rows[0].id
    // Ninguna sede real tiene whatsapp_phone_number_id todavía (sin
    // credenciales reales de Meta) — se fija uno de prueba en Cedros solo
    // para los tests que necesitan que el envío real "pueda" resolver a
    // dónde mandar, y se restaura a null al terminar.
    await client.query(`update sedes set whatsapp_phone_number_id = $1 where id = $2`, [PHONE_ID_TEST, SEDE_CEDROS])
  })

  afterAll(async () => {
    await client.query(`update sedes set whatsapp_phone_number_id = null where id = $1`, [SEDE_CEDROS])
    client.release()
    await pool.end()
  })

  beforeEach(() => {
    llamadasGraph.length = 0
    proximaRespuestaGraph = null
  })

  async function crearConversacionDePrueba(sedeId: string | null, externalId: string) {
    const { rows } = await client.query(
      `insert into conversaciones (tenant_id, canal, external_id, sede_id, estado, historial)
       values ($1, 'whatsapp', $2, $3, 'escalada', '[]'::jsonb) returning id`,
      [tenantId, externalId, sedeId]
    )
    return rows[0].id as string
  }

  async function borrarConversacionDePrueba(id: string) {
    await client.query(`delete from conversaciones where id = $1`, [id])
  }

  it('sin Authorization responde 401', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/dashboard/conversaciones/00000000-0000-0000-0000-000000000000/responder',
      payload: { texto: 'hola' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('envío exitoso: manda el mensaje real por WhatsApp y recién ahí actualiza historial/estado', async () => {
    const id = await crearConversacionDePrueba(SEDE_CEDROS, '51999888771')
    proximaRespuestaGraph = async () => ({ ok: true, text: async () => '' })

    try {
      const app = await buildApp()
      const res = await app.inject({
        method: 'POST',
        url: `/api/dashboard/conversaciones/${id}/responder`,
        headers: { authorization: `Bearer ${JWT_ALAMEDA}` },
        payload: { texto: 'Hola, te escribe el equipo de Bake Brothers 😊' },
      })

      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body)).toEqual({ ok: true })

      expect(llamadasGraph.length).toBe(1)
      const [url, opciones] = llamadasGraph[0]
      expect(url).toBe(`https://graph.facebook.com/v21.0/${PHONE_ID_TEST}/messages`)
      expect((opciones.headers as Record<string, string>).Authorization).toBe('Bearer dummy-token-para-test-fetch-mockeado')
      const body = JSON.parse(opciones.body as string)
      expect(body).toEqual({
        messaging_product: 'whatsapp',
        to: '51999888771',
        type: 'text',
        text: { body: 'Hola, te escribe el equipo de Bake Brothers 😊' },
      })

      const { rows } = await client.query(`select estado, historial from conversaciones where id = $1`, [id])
      expect(rows[0].estado).toBe('atendida_por_operador')
      expect(rows[0].historial.length).toBe(1)
      expect(rows[0].historial[0]).toMatchObject({ rol: 'operador', texto: 'Hola, te escribe el equipo de Bake Brothers 😊' })
    } finally {
      await borrarConversacionDePrueba(id)
    }
  })

  it('envío fallido: NO actualiza historial/estado, y el error real llega al caller (nunca un "listo" falso)', async () => {
    const id = await crearConversacionDePrueba(SEDE_CEDROS, '51999888772')
    proximaRespuestaGraph = async () => ({
      ok: false,
      status: 401,
      text: async () => '{"error":{"message":"Invalid OAuth access token"}}',
    })

    try {
      const app = await buildApp()
      const res = await app.inject({
        method: 'POST',
        url: `/api/dashboard/conversaciones/${id}/responder`,
        headers: { authorization: `Bearer ${JWT_ALAMEDA}` },
        payload: { texto: 'Este mensaje nunca debería quedar registrado como enviado' },
      })

      expect(res.statusCode).toBe(502)
      const cuerpo = JSON.parse(res.body)
      expect(cuerpo.error).toBe('ENVIO_FALLIDO')
      expect(cuerpo.detalle).toMatch(/401.*Invalid OAuth access token/s)

      const { rows } = await client.query(`select estado, historial from conversaciones where id = $1`, [id])
      expect(rows[0].estado).toBe('escalada')
      expect(rows[0].historial.length).toBe(0)
    } finally {
      await borrarConversacionDePrueba(id)
    }
  })

  it('un operador de OTRA sede no puede responder — 403, sin intentar mandar nada', async () => {
    const id = await crearConversacionDePrueba(SEDE_CEDROS, '51999888773')

    try {
      const app = await buildApp()
      const res = await app.inject({
        method: 'POST',
        url: `/api/dashboard/conversaciones/${id}/responder`,
        headers: { authorization: `Bearer ${JWT_SM}` },
        payload: { texto: 'No debería poder mandar esto' },
      })

      expect(res.statusCode).toBe(403)
      expect(JSON.parse(res.body).error).toBe('SIN_ACCESO_A_LA_CONVERSACION')
      expect(llamadasGraph.length).toBe(0)
    } finally {
      await borrarConversacionDePrueba(id)
    }
  })

  it('un admin SÍ puede responder una conversación de cualquier sede', async () => {
    const id = await crearConversacionDePrueba(SEDE_CEDROS, '51999888774')
    proximaRespuestaGraph = async () => ({ ok: true, text: async () => '' })

    try {
      const app = await buildApp()
      const res = await app.inject({
        method: 'POST',
        url: `/api/dashboard/conversaciones/${id}/responder`,
        headers: { authorization: `Bearer ${JWT_ADMIN}` },
        payload: { texto: 'Te escribe un admin' },
      })

      expect(res.statusCode).toBe(200)
      expect(llamadasGraph.length).toBe(1)
    } finally {
      await borrarConversacionDePrueba(id)
    }
  })

  it('una conversación sin sede asignada no se puede responder — 422, sin intentar mandar nada', async () => {
    const id = await crearConversacionDePrueba(null, '51999888775')

    try {
      const app = await buildApp()
      const res = await app.inject({
        method: 'POST',
        url: `/api/dashboard/conversaciones/${id}/responder`,
        headers: { authorization: `Bearer ${JWT_ADMIN}` },
        payload: { texto: 'hola' },
      })

      expect(res.statusCode).toBe(422)
      expect(JSON.parse(res.body).error).toBe('CONVERSACION_SIN_SEDE_ASIGNADA')
      expect(llamadasGraph.length).toBe(0)
    } finally {
      await borrarConversacionDePrueba(id)
    }
  })

  it('una sede sin whatsapp_phone_number_id configurado no se puede responder — 422', async () => {
    // Santa Marina no tiene número de prueba fijado (solo Cedros, en beforeAll).
    const id = await crearConversacionDePrueba(SEDE_SANTA_MARINA, '51999888776')

    try {
      const app = await buildApp()
      const res = await app.inject({
        method: 'POST',
        url: `/api/dashboard/conversaciones/${id}/responder`,
        headers: { authorization: `Bearer ${JWT_SM}` },
        payload: { texto: 'hola' },
      })

      expect(res.statusCode).toBe(422)
      expect(JSON.parse(res.body).error).toBe('SEDE_SIN_WHATSAPP_CONFIGURADO')
      expect(llamadasGraph.length).toBe(0)
    } finally {
      await borrarConversacionDePrueba(id)
    }
  })
})

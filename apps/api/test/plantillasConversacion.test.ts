// Plantillas de WhatsApp desde la bandeja de Conversaciones: pasadas las 24 h el texto libre no se puede enviar y
// se elige una plantilla APROBADA, que se lee de Meta (nunca se escribe a mano).
//   GET  /api/dashboard/conversaciones/:id/plantillas   → las aprobadas que el panel puede enviar
//   POST /api/dashboard/conversaciones/:id/plantilla    → valida contra Meta, envía y recién ahí escribe el historial
//
// Se mockea (1) la verificación del JWT (necesita el JWKS real de Supabase por red; su comportamiento ya lo prueban
// dashboardOrders/dashboardConversaciones con JWT reales) y (2) fetch, SOLO para graph.facebook.com. Todo lo demás
// corre real: las rutas, el servicio, el cifrado del token de la conexión y la base (Postgres con el esquema).
// Sin DATABASE_URL real se salta.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal = !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

vi.mock('../src/auth/verificarJwtOperador.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/auth/verificarJwtOperador.js')>()),
  verificarJwtOperador: async (
    req: { headers: Record<string, string | undefined>; operador?: unknown },
    reply: { code: (n: number) => { send: (b: unknown) => unknown } }
  ) => {
    const rol = req.headers['x-test-rol']
    if (!rol) return reply.code(401).send({ error: 'NO_AUTORIZADO' })
    req.operador = { id: '00000000-0000-0000-0000-0000000000aa', rol, sedeId: req.headers['x-test-sede'] ?? null }
  },
}))

type Llamada = { url: string; init?: RequestInit }
const llamadas: Llamada[] = []
let plantillasDeMeta: unknown[] = []
let respuestaListado: { status: number; cuerpo?: string } | null = null
let respuestaEnvio: { status: number; cuerpo: string } = { status: 200, cuerpo: '{"messages":[{"id":"wamid.PRUEBA"}]}' }

vi.stubGlobal(
  'fetch',
  vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url)
    llamadas.push({ url: u, init })
    if (u.includes('/message_templates')) {
      const r = respuestaListado ?? { status: 200, cuerpo: JSON.stringify({ data: plantillasDeMeta }) }
      return new Response(r.cuerpo ?? '{}', { status: r.status })
    }
    if (u.endsWith('/messages')) return new Response(respuestaEnvio.cuerpo, { status: respuestaEnvio.status })
    throw new Error(`fetch inesperado en el test: ${u}`)
  })
)

const { buildApp } = await import('../src/app.js')
const { sembrarConexion, quitarConexion, TOKEN_DE_PRUEBA } = await import('./conexionDePrueba.js')

const PHONE_ID = 'PHONE_ID_TEST_PLANTILLAS'
let contador = 0
const telefonos = new Map<string, string>()

const CONFIRMACION = {
  name: 'confirmacion_pedido',
  language: 'es',
  status: 'APPROVED',
  category: 'UTILITY',
  parameter_format: 'POSITIONAL',
  components: [
    { type: 'BODY', text: 'Hola {{1}}, recibimos tu pedido {{2}}.', example: { body_text: [['Ana', 'BB-2500']] } },
    { type: 'FOOTER', text: 'Bake Brothers' },
  ],
}
const CON_IMAGEN = {
  name: 'promo_con_foto',
  language: 'es',
  status: 'APPROVED',
  category: 'MARKETING',
  components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'Mira esto' }],
}

describe.skipIf(!hayBaseDeDatosReal)('plantillas de WhatsApp en Conversaciones', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let app: Awaited<ReturnType<typeof buildApp>>
  let tenantId: string
  let sedeA: string
  let sedeB: string
  const creadas: string[] = []

  beforeAll(async () => {
    const t = await pool.query(`select id from tenants where slug = 'bake-brothers'`)
    tenantId = t.rows[0].id
    const s = await pool.query(`select id from sedes where activo order by nombre limit 2`)
    sedeA = s.rows[0].id
    sedeB = s.rows[1].id
    await sembrarConexion(pool, { sedeId: sedeA, phoneNumberId: PHONE_ID })
    app = await buildApp()
  })

  afterAll(async () => {
    if (creadas.length) await pool.query(`delete from conversaciones where id = any($1::uuid[])`, [creadas])
    await quitarConexion(pool, { sedeId: sedeA, phoneNumberId: PHONE_ID })
    await pool.end()
  })

  beforeEach(() => {
    llamadas.length = 0
    plantillasDeMeta = [CONFIRMACION, CON_IMAGEN, { ...CONFIRMACION, name: 'rechazada', status: 'REJECTED' }]
    respuestaListado = null
    respuestaEnvio = { status: 200, cuerpo: '{"messages":[{"id":"wamid.PRUEBA"}]}' }
  })

  // Conversación con el último mensaje del cliente hace 3 días: la ventana de 24 h está cerrada.
  async function conversacion(estado = 'atendida_por_operador', sedeId: string | null = sedeA, haceHoras = 72) {
    const historial = [{ rol: 'cliente', texto: 'Hola', en: new Date(Date.now() - haceHoras * 3_600_000).toISOString() }]
    const { rows } = await pool.query(
      `insert into conversaciones (tenant_id, canal, external_id, sede_id, estado, historial)
       values ($1, 'whatsapp', $2, $3, $4, $5::jsonb) returning id`,
      [tenantId, `5199907${String(1000 + contador++)}`, sedeId, estado, JSON.stringify(historial)]
    )
    creadas.push(rows[0].id)
    telefonos.set(rows[0].id, `5199907${String(1000 + contador - 1)}`)
    return rows[0].id as string
  }
  const historialDe = async (id: string) =>
    (await pool.query(`select estado, historial from conversaciones where id = $1`, [id])).rows[0]
  const llamar = (metodo: 'GET' | 'POST', id: string, ruta: 'plantillas' | 'plantilla', cuerpo?: unknown, headers: Record<string, string> = { 'x-test-rol': 'admin' }) =>
    app.inject({ method: metodo, url: `/api/dashboard/conversaciones/${id}/${ruta}`, headers, ...(cuerpo ? { payload: cuerpo as Record<string, unknown> } : {}) })
  const envios = () => llamadas.filter((l) => l.url.endsWith('/messages'))

  it('sin sesión: 401', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/dashboard/conversaciones/00000000-0000-0000-0000-000000000000/plantillas' })
    expect(r.statusCode).toBe(401)
  })

  it('lista solo las APROBADAS que se pueden enviar, leídas de Meta con el token y el WABA de la conexión', async () => {
    const id = await conversacion()
    const r = await llamar('GET', id, 'plantillas')
    expect(r.statusCode).toBe(200)
    const cuerpo = JSON.parse(r.body)
    expect(cuerpo.plantillas.map((p: { nombre: string }) => p.nombre)).toEqual(['confirmacion_pedido'])
    expect(cuerpo.noSoportadas).toBe(1) // la de imagen se cuenta aparte
    expect(cuerpo.ventanaAbierta).toBe(false)
    expect(cuerpo.plantillas[0].variables.map((v: { clave: string }) => v.clave)).toEqual(['cuerpo:1', 'cuerpo:2'])

    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].url).toContain('/WABA_DE_PRUEBA/message_templates')
    expect(llamadas[0].url).toContain('status=APPROVED')
    expect((llamadas[0].init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN_DE_PRUEBA}`)
  })

  it('si Meta falla al leer las plantillas: 502 con el motivo, sin inventar una lista', async () => {
    const id = await conversacion()
    respuestaListado = { status: 500, cuerpo: '{"error":"caído"}' }
    const r = await llamar('GET', id, 'plantillas')
    expect(r.statusCode).toBe(502)
    expect(JSON.parse(r.body)).toMatchObject({ ok: false, error: 'PLANTILLAS_NO_DISPONIBLES' })
  })

  it('envía la plantilla con la ventana CERRADA: manda type template con sus parámetros y deja el texto armado en el historial', async () => {
    const id = await conversacion('escalada')
    const r = await llamar('POST', id, 'plantilla', { nombre: 'confirmacion_pedido', idioma: 'es', valores: { 'cuerpo:1': 'Ana', 'cuerpo:2': 'BB-2500' } })
    expect(r.statusCode).toBe(200)

    expect(envios()).toHaveLength(1)
    expect(envios()[0].url).toBe(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`)
    expect(JSON.parse(envios()[0].init?.body as string)).toEqual({
      messaging_product: 'whatsapp',
      to: telefonos.get(id),
      type: 'template',
      template: {
        name: 'confirmacion_pedido',
        language: { code: 'es' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ana' }, { type: 'text', text: 'BB-2500' }] }],
      },
    })
    const fila = await historialDe(id)
    expect(fila.estado).toBe('atendida_por_operador') // escribir = tomarla
    expect(fila.historial).toHaveLength(2)
    expect(fila.historial[1]).toMatchObject({ rol: 'operador', texto: 'Hola Ana, recibimos tu pedido BB-2500.\n\nBake Brothers', plantilla: 'confirmacion_pedido' })
  })

  it('con variables de menos: 422, no se envía nada y el historial queda igual', async () => {
    const id = await conversacion()
    const r = await llamar('POST', id, 'plantilla', { nombre: 'confirmacion_pedido', idioma: 'es', valores: { 'cuerpo:1': 'Ana' } })
    expect(r.statusCode).toBe(422)
    expect(JSON.parse(r.body)).toMatchObject({ error: 'FALTAN_VARIABLES', faltan: ['cuerpo:2'] })
    expect(envios()).toHaveLength(0)
    expect((await historialDe(id)).historial).toHaveLength(1)
  })

  it('una plantilla que Meta no tiene aprobada (rechazada o inexistente) no se envía', async () => {
    const id = await conversacion()
    for (const nombre of ['rechazada', 'inventada']) {
      const r = await llamar('POST', id, 'plantilla', { nombre, idioma: 'es', valores: {} })
      expect(r.statusCode).toBe(422)
      expect(JSON.parse(r.body).error).toBe('PLANTILLA_NO_APROBADA')
    }
    expect(envios()).toHaveLength(0)
  })

  it('una aprobada con imagen en el encabezado no se envía desde el panel', async () => {
    const id = await conversacion()
    const r = await llamar('POST', id, 'plantilla', { nombre: 'promo_con_foto', idioma: 'es', valores: {} })
    expect(r.statusCode).toBe(422)
    expect(JSON.parse(r.body).error).toBe('PLANTILLA_NO_SOPORTADA')
    expect(envios()).toHaveLength(0)
  })

  it('si Meta rechaza el envío: 502 ENVIO_FALLIDO y el historial NO se toca (nunca un «enviado» falso)', async () => {
    const id = await conversacion('escalada')
    respuestaEnvio = { status: 400, cuerpo: '{"error":{"message":"Template param count mismatch"}}' }
    const r = await llamar('POST', id, 'plantilla', { nombre: 'confirmacion_pedido', idioma: 'es', valores: { 'cuerpo:1': 'Ana', 'cuerpo:2': 'X' } })
    expect(r.statusCode).toBe(502)
    expect(JSON.parse(r.body)).toMatchObject({ error: 'ENVIO_FALLIDO' })
    const fila = await historialDe(id)
    expect(fila.estado).toBe('escalada')
    expect(fila.historial).toHaveLength(1)
  })

  it('una conversación que atiende el bot (o cerrada) hay que tomarla primero: 409 y ni siquiera se consulta a Meta', async () => {
    for (const estado of ['activa', 'cerrada']) {
      const id = await conversacion(estado)
      const r = await llamar('POST', id, 'plantilla', { nombre: 'confirmacion_pedido', idioma: 'es', valores: { 'cuerpo:1': 'a', 'cuerpo:2': 'b' } })
      expect(r.statusCode).toBe(409)
      expect(JSON.parse(r.body).error).toBe('CONVERSACION_NO_TOMADA')
    }
    expect(llamadas).toHaveLength(0)
  })

  it('un empleado no puede mandar plantillas en una conversación de OTRO local; el de su local y la dirección sí', async () => {
    const deB = await conversacion('atendida_por_operador', sedeB)
    const ajeno = await llamar('GET', deB, 'plantillas', undefined, { 'x-test-rol': 'operador', 'x-test-sede': sedeA })
    expect(ajeno.statusCode).toBe(403)
    expect(JSON.parse(ajeno.body).error).toBe('SIN_ACCESO_A_LA_CONVERSACION')

    const propia = await conversacion('atendida_por_operador', sedeA)
    expect((await llamar('GET', propia, 'plantillas', undefined, { 'x-test-rol': 'operador', 'x-test-sede': sedeA })).statusCode).toBe(200)
  })
})

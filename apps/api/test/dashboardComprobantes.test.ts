// Rutas /api/dashboard/comprobantes — SOLO ADMINISTRADOR. La verificación del JWT se mockea (necesita el JWKS real de
// Supabase por red); lo demás corre real contra Postgres con 0053 y el simulador de Mifact (sin red).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'
import { crearPedidoDePrueba, limpiarPedidosDePrueba } from '../scripts/lib/pedidoDePrueba.js'
import { FalsoMifact } from './helpers/falsoMifact.js'

const hayBaseDeDatosReal = !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

vi.mock('../src/auth/verificarJwtOperador.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/auth/verificarJwtOperador.js')>()),
  verificarJwtOperador: async (
    req: { headers: Record<string, string | undefined>; operador?: unknown },
    reply: { code: (n: number) => { send: (b: unknown) => unknown } }
  ) => {
    const rol = req.headers['x-test-rol']
    if (!rol) return reply.code(401).send({ error: 'NO_AUTORIZADO' })
    req.operador = { id: '5c0f4c1e-0000-4000-8000-000000000001', rol, sedeId: null }
  },
}))

const { buildApp } = await import('../src/app.js')

const TOKEN = 'TOKEN-SECRETO-DE-LAS-RUTAS=='
const MARCA = '[PRUEBA-RUTAS-MIFACT]'
const SERIES = ['BR01', 'FR01', 'BR02', 'FR02']
const ENV_MIFACT: Record<string, string> = {
  MIFACT_BAKER_BROTHERS_URL: 'https://demo.mifact.test/api/invoiceService.svc',
  MIFACT_BAKER_BROTHERS_TOKEN: TOKEN,
  MIFACT_BAKER_BROTHERS_RUC: '20100100100',
  MIFACT_BAKER_BROTHERS_RAZON_SOCIAL: 'empresa demo',
  MIFACT_BAKER_BROTHERS_UBIGEO: '103040',
  MIFACT_BAKER_BROTHERS_DIRECCION: 'avenida abcd',
  MIFACT_BAKER_BROTHERS_SERIE_BOLETA: 'BR01',
  MIFACT_BAKER_BROTHERS_SERIE_FACTURA: 'FR01',
}

describe.skipIf(!hayBaseDeDatosReal)('rutas de comprobantes (administrador)', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const guardado: Record<string, string | undefined> = {}
  let app: Awaited<ReturnType<typeof buildApp>>
  let tenantId: string
  let falso: FalsoMifact
  let n = 0

  const pedido = (extra: Partial<Parameters<typeof crearPedidoDePrueba>[1]> = {}) =>
    crearPedidoDePrueba(pool, { tenantId, marca: MARCA, sede: 'Santa Marina', items: [{ slug: 'alfajor-mix', cantidad: 1 }], numero: `TEST-RUTA-${Date.now()}-${++n}`, ...extra })
  const llamar = (method: 'GET' | 'POST' | 'PUT', url: string, rol: string | null = 'admin', payload?: unknown) =>
    app.inject({ method, url, headers: rol ? { 'x-test-rol': rol } : {}, ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}) })
  const limpiar = async () => {
    await limpiarPedidosDePrueba(pool, MARCA)
    await pool.query(`delete from comprobantes_numeradores where serie = any($1)`, [SERIES])
  }

  beforeAll(async () => {
    for (const k of Object.keys(ENV_MIFACT)) guardado[k] = process.env[k]
    app = await buildApp()
    tenantId = (await pool.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
  })
  beforeEach(async () => {
    Object.assign(process.env, ENV_MIFACT)
    falso = new FalsoMifact(TOKEN)
    vi.stubGlobal('fetch', falso.fetch)
    await limpiar()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })
  afterAll(async () => {
    await limpiar()
    for (const [k, v] of Object.entries(guardado)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    await pool.end()
    await app.close()
  })

  it('sin sesión → 401; un operador (no admin) → 403 SOLO_ADMIN en TODAS las rutas, y no se llama a Mifact ni se guarda nada', async () => {
    const id = '00000000-0000-0000-0000-000000000000'
    const rutas: ['GET' | 'POST' | 'PUT', string, unknown?][] = [
      ['POST', '/api/dashboard/comprobantes', { pedido: 'X', tipo: 'boleta' }],
      ['GET', '/api/dashboard/comprobantes?pedido=X'],
      ['GET', '/api/dashboard/comprobantes/sin-respuesta'],
      ['GET', `/api/dashboard/comprobantes/${id}`],
      ['POST', `/api/dashboard/comprobantes/${id}/estado`, {}],
      ['POST', `/api/dashboard/comprobantes/${id}/reintentar`, {}],
      ['GET', `/api/dashboard/comprobantes/${id}/pdf`],
      ['POST', `/api/dashboard/comprobantes/${id}/anular`, { motivo: 'ANULACION POR ERROR' }],
      ['POST', `/api/dashboard/comprobantes/${id}/correo`, { correo: 'a@b.pe' }],
      ['GET', '/api/dashboard/pedidos/BB-1/facturacion'],
      ['PUT', `/api/dashboard/clientes/${id}/facturacion`, { razonSocial: 'X SAC' }],
    ]
    for (const [metodo, url, cuerpo] of rutas) {
      expect((await llamar(metodo, url, null, cuerpo)).statusCode, `${metodo} ${url} sin sesión`).toBe(401)
      const r = await llamar(metodo, url, 'operador', cuerpo)
      expect(r.statusCode, `${metodo} ${url} operador`).toBe(403)
      expect(r.json().error).toBe('SOLO_ADMIN')
    }
    expect(falso.llamadas).toHaveLength(0)
  })

  it('sin Mifact configurado → 503 MIFACT_NO_CONFIGURADO (desplegar este código no activa nada por sí solo)', async () => {
    for (const k of Object.keys(ENV_MIFACT)) delete process.env[k]
    const p = await pedido()
    const r = await llamar('POST', '/api/dashboard/comprobantes', 'admin', { pedido: p.numero, tipo: 'boleta' })
    expect(r.statusCode).toBe(503)
    expect(r.json()).toMatchObject({ error: 'MIFACT_NO_CONFIGURADO', detalle: { faltan: expect.arrayContaining(['MIFACT_BAKER_BROTHERS_URL', 'MIFACT_BAKER_BROTHERS_TOKEN']) } })
    expect(falso.llamadas).toHaveLength(0)
  })

  it('recorrido completo por HTTP: emitir → consultar el estado → PDF → correo → anular', async () => {
    const p = await pedido({ dni: '12345678', razonSocial: 'ANA TORRES QUISPE' })
    const emitido = await llamar('POST', '/api/dashboard/comprobantes', 'admin', { pedido: p.numero, tipo: 'boleta' })
    expect(emitido.statusCode).toBe(201)
    const c = emitido.json()
    expect(c).toMatchObject({ numero: 'BR01-00000001', estado: 'aceptado', estadoCodigo: 102, pedido: p.numero, emisor: 'baker_brothers', entorno: 'demo', receptor: { documento: '12345678', nombre: 'ANA TORRES QUISPE' } })
    const base = `/api/dashboard/comprobantes/${c.id}`

    expect((await llamar('GET', `/api/dashboard/comprobantes?pedido=${p.numero}`)).json().map((x: { numero: string }) => x.numero)).toEqual(['BR01-00000001'])
    expect((await llamar('GET', base)).json().id).toBe(c.id)
    expect((await llamar('POST', `${base}/estado`, 'admin', {})).json()).toMatchObject({ estado: 'aceptado', consultadoEn: expect.any(String) })

    const pdf = await llamar('GET', `${base}/pdf`)
    expect(pdf.statusCode).toBe(200)
    expect(pdf.headers['content-type']).toBe('application/pdf')
    expect(pdf.headers['content-disposition']).toBe('inline; filename="BR01-00000001.pdf"')
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe('%PDF')

    const correo = await llamar('POST', `${base}/correo`, 'admin', { correo: 'cliente@ejemplo.pe' })
    expect(correo.json().correoEnviadoA).toBe('cliente@ejemplo.pe')

    const anulado = await llamar('POST', `${base}/anular`, 'admin', { motivo: 'ANULACION POR ERROR' })
    expect(anulado.json()).toMatchObject({ estado: 'anulacion_solicitada', estadoCodigo: 108, motivoAnulacion: 'ANULACION POR ERROR' })
    expect((await pool.query(`select creado_por from comprobantes where id = $1`, [c.id])).rows[0].creado_por).toBe('5c0f4c1e-0000-4000-8000-000000000001')
  })

  it('los errores de negocio salen con su código HTTP y mensaje en español', async () => {
    const inexistente = await llamar('POST', '/api/dashboard/comprobantes', 'admin', { pedido: 'NO-EXISTE', tipo: 'boleta' })
    expect([inexistente.statusCode, inexistente.json().error]).toEqual([404, 'PEDIDO_NO_ENCONTRADO'])

    const p = await pedido()
    await llamar('POST', '/api/dashboard/comprobantes', 'admin', { pedido: p.numero, tipo: 'boleta' })
    const repetido = await llamar('POST', '/api/dashboard/comprobantes', 'admin', { pedido: p.numero, tipo: 'boleta' })
    expect([repetido.statusCode, repetido.json().error]).toEqual([409, 'COMPROBANTE_YA_EMITIDO'])

    // Factura a un cliente SIN RUC: 422, y se explica que falta el RUC del cliente.
    const q = await pedido()
    const receptor = await llamar('POST', '/api/dashboard/comprobantes', 'admin', { pedido: q.numero, tipo: 'factura' })
    expect([receptor.statusCode, receptor.json().error, receptor.json().detalle.error]).toEqual([422, 'RECEPTOR_INVALIDO', 'FACTURA_REQUIERE_RUC'])

    const sinResp = await pedido()
    falso.fallar('SendInvoice', { tipo: 'timeout' })
    const dudoso = await llamar('POST', '/api/dashboard/comprobantes', 'admin', { pedido: sinResp.numero, tipo: 'boleta' })
    expect([dudoso.statusCode, dudoso.json().error]).toEqual([502, 'MIFACT_SIN_RESPUESTA'])
    expect(dudoso.json().comprobanteId).toBeTruthy()
    const reintento = await llamar('POST', `/api/dashboard/comprobantes/${dudoso.json().comprobanteId}/reintentar`, 'admin', {})
    expect([reintento.statusCode, reintento.json().estado]).toEqual([200, 'aceptado'])
  })

  it('entradas mal formadas → 400 (campos de más, tipo desconocido, id que no es uuid, motivo/correo faltantes)', async () => {
    expect((await llamar('POST', '/api/dashboard/comprobantes', 'admin', { pedido: 'X', tipo: 'nota' })).statusCode).toBe(400)
    expect((await llamar('POST', '/api/dashboard/comprobantes', 'admin', { pedido: 'X', tipo: 'boleta', total: 1 })).statusCode).toBe(400)
    // El receptor NO se recibe: sale del cliente del pedido (aunque alguien mande el de la documentación de Mifact).
    expect((await llamar('POST', '/api/dashboard/comprobantes', 'admin', { pedido: 'X', tipo: 'factura', receptor: { numeroDoc: '20601847834', nombre: 'OSYS COMPANY SAC' } })).statusCode).toBe(400)
    expect((await llamar('PUT', '/api/dashboard/clientes/no-es-uuid/facturacion', 'admin', { razonSocial: 'X SAC' })).statusCode).toBe(400)
    expect((await llamar('PUT', '/api/dashboard/clientes/00000000-0000-0000-0000-000000000000/facturacion', 'admin', { campoInventado: 'x' })).statusCode).toBe(400)
    expect((await llamar('GET', '/api/dashboard/comprobantes/no-es-uuid')).statusCode).toBe(400)
    expect((await llamar('GET', '/api/dashboard/comprobantes')).statusCode).toBe(400)
    expect((await llamar('POST', '/api/dashboard/comprobantes/00000000-0000-0000-0000-000000000000/anular', 'admin', {})).statusCode).toBe(400)
    expect((await llamar('POST', '/api/dashboard/comprobantes/00000000-0000-0000-0000-000000000000/correo', 'admin', {})).statusCode).toBe(400)
    expect(falso.llamadas).toHaveLength(0)
  })

  it('el token de Mifact no sale en NINGUNA respuesta (ni en los errores)', async () => {
    const p = await pedido()
    const salidas: string[] = []
    const r1 = await llamar('POST', '/api/dashboard/comprobantes', 'admin', { pedido: p.numero, tipo: 'boleta' })
    salidas.push(r1.body)
    salidas.push((await llamar('GET', `/api/dashboard/comprobantes?pedido=${p.numero}`)).body)
    falso = new FalsoMifact('otro-token')
    vi.stubGlobal('fetch', falso.fetch)
    const q = await pedido()
    salidas.push((await llamar('POST', '/api/dashboard/comprobantes', 'admin', { pedido: q.numero, tipo: 'boleta' })).body)
    delete process.env.MIFACT_BAKER_BROTHERS_URL
    salidas.push((await llamar('POST', '/api/dashboard/comprobantes', 'admin', { pedido: q.numero, tipo: 'boleta' })).body)
    for (const s of salidas) expect(s).not.toContain(TOKEN)
  })

  it('GET /comprobantes/sin-respuesta: solo los que llevan MÁS de 2 días esperando a Mifact/SUNAT, el más antiguo primero', async () => {
    falso.estadoAlRegistrar = '101' // «En proceso», como las boletas reales
    const emitir = async () => {
      const p = await pedido()
      return (await llamar('POST', '/api/dashboard/comprobantes', 'admin', { pedido: p.numero, tipo: 'boleta' })).json() as { id: string; numero: string; estado: string }
    }
    const reciente = await emitir() // de hoy
    const tresDias = await emitir()
    const diezDias = await emitir()
    const aceptada = await emitir()
    expect([reciente, tresDias, diezDias, aceptada].every((c) => c.estado === 'en_proceso')).toBe(true)
    const envejecer = (id: string, dias: number, estado = 'en_proceso') =>
      pool.query(`update comprobantes set fecha_emision = (now() at time zone 'America/Lima')::date - $2::int, estado = $3 where id = $1`, [id, dias, estado])
    await envejecer(tresDias.id, 3)
    await envejecer(diezDias.id, 10)
    await envejecer(aceptada.id, 10, 'aceptado')

    const r = await llamar('GET', '/api/dashboard/comprobantes/sin-respuesta')
    expect(r.statusCode).toBe(200)
    const lista = r.json() as { id: string; numero: string; estado: string; estadoLegible: string; fechaEmision: string; pedido: string }[]
    const ids = lista.map((c) => c.id)
    expect(ids).toEqual(expect.arrayContaining([diezDias.id, tresDias.id]))
    expect(ids).not.toContain(reciente.id) // de hoy: lo normal
    expect(ids).not.toContain(aceptada.id) // ya tiene respuesta
    expect(ids.indexOf(diezDias.id)).toBeLessThan(ids.indexOf(tresDias.id)) // el más antiguo primero
    expect(lista.find((c) => c.id === tresDias.id)).toMatchObject({ numero: tresDias.numero, estado: 'en_proceso', estadoLegible: 'En proceso' })
    // Justo en el borde: hace 2 días todavía es normal.
    await envejecer(reciente.id, 2)
    expect((await llamar('GET', '/api/dashboard/comprobantes/sin-respuesta')).json().map((c: { id: string }) => c.id)).not.toContain(reciente.id)
  })

  it('GET /pedidos/:numero/facturacion: quién factura, a quién se emitiría y qué botones se habilitan', async () => {
    const empresa = await pedido({ ruc: '20123456786', razonSocial: 'PASTELERIA EJEMPLO SAC' })
    const r = await llamar('GET', `/api/dashboard/pedidos/${empresa.numero}/facturacion`)
    expect(r.statusCode).toBe(200)
    const j = r.json()
    expect(j.emisor).toMatchObject({ clave: 'baker_brothers', configurado: true })
    expect(j.puede.factura).toMatchObject({ ok: true, receptor: { documento: '20123456786', nombre: 'PASTELERIA EJEMPLO SAC' } })
    expect(j.cliente).toMatchObject({ ruc: '20123456786' })
    expect(j.comprobantes).toEqual([])
    expect((await llamar('GET', '/api/dashboard/pedidos/NO-EXISTE/facturacion')).statusCode).toBe(404)
  })

  it('PUT /clientes/:id/facturacion: completa los datos del cliente y la factura se habilita; rechaza datos inválidos y de ejemplo', async () => {
    const p = await pedido()
    const sinRuc = (await llamar('GET', `/api/dashboard/pedidos/${p.numero}/facturacion`)).json()
    expect(sinRuc.puede.factura).toMatchObject({ ok: false, detalle: { error: 'FACTURA_REQUIERE_RUC' } })
    const id = sinRuc.cliente.id

    for (const [datos, campo] of [[{ ruc: '20123456785' }, 'ruc'], [{ ruc: '20601847834' }, 'ruc'], [{ correo: 'mifact@outlook.com' }, 'correo'], [{ dni: '123' }, 'dni']] as const) {
      const mal = await llamar('PUT', `/api/dashboard/clientes/${id}/facturacion`, 'admin', datos)
      expect([mal.statusCode, mal.json().error, mal.json().detalle.campo]).toEqual([422, 'DATOS_CLIENTE_INVALIDOS', campo])
    }
    const bien = await llamar('PUT', `/api/dashboard/clientes/${id}/facturacion`, 'admin', { ruc: '20123456786', razonSocial: 'PASTELERIA EJEMPLO SAC', direccionFiscal: 'Av. Prueba 123' })
    expect([bien.statusCode, bien.json().ruc]).toEqual([200, '20123456786'])
    const conRuc = (await llamar('GET', `/api/dashboard/pedidos/${p.numero}/facturacion`)).json()
    expect(conRuc.puede.factura).toMatchObject({ ok: true, receptor: { documento: '20123456786' } })
    const emitido = await llamar('POST', '/api/dashboard/comprobantes', 'admin', { pedido: p.numero, tipo: 'factura' })
    expect([emitido.statusCode, emitido.json().receptor]).toEqual([201, expect.objectContaining({ documento: '20123456786', direccion: 'Av. Prueba 123' })])
    expect((await llamar('PUT', '/api/dashboard/clientes/00000000-0000-0000-0000-000000000000/facturacion', 'admin', { razonSocial: 'X SAC' })).statusCode).toBe(404)
  })
})

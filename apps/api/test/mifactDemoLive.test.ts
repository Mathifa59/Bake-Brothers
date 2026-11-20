// CONTRATO CONTRA EL DEMO REAL de Mifact (demo.mifact.net.pe). Apagado por defecto (la suite normal no sale a internet):
//   pnpm test:mifact-demo        (usa .env.mifact-demo, que NO está en git)
// Cada corrida emite documentos de prueba reales en el demo. Solo corre contra una base LOCAL y solo en entorno demo.
// Comprueba lo que el simulador de test/helpers/falsoMifact.ts da por cierto: respuestas, estados, PDF y, sobre todo, el
// texto REAL con el que Mifact avisa que un número ya existe (de eso depende saltar al siguiente número).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'
import { desglosarLineas, fechaLimaISO, resolverReceptor } from '@bakebrothers/domain'
import { leerConfigEmisor } from '../src/mifact/config.js'
import { crearClienteMifact } from '../src/mifact/cliente.js'
import { construirDocumento } from '../src/mifact/construirDocumento.js'
import { anularComprobante, consultarEstado, descargarPdf, emitirComprobante, obtenerComprobante } from '../src/services/comprobantes.js'
import { crearPedidoDePrueba, limpiarPedidosDePrueba } from '../scripts/lib/pedidoDePrueba.js'

const dbUrl = process.env.DATABASE_URL ?? ''
const habilitado =
  process.env.MIFACT_DEMO_LIVE === '1' && dbUrl !== DATABASE_URL_PLACEHOLDER && /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl)

const MARCA = '[PRUEBA-LIVE-MIFACT]'

describe.skipIf(!habilitado)('Mifact DEMO real: emitir, consultar, PDF y anular desde un pedido', () => {
  const pool = new pg.Pool({ connectionString: dbUrl })
  let tenantId: string

  beforeAll(async () => {
    for (const emisor of ['baker_brothers', 'hermanos_loarte'] as const) {
      const r = leerConfigEmisor(emisor)
      if (!r.ok) throw new Error(`Falta configurar ${emisor}: ${[...r.faltan, ...r.invalidas.map((i) => i.variable)].join(', ')}`)
      if (r.config.entorno !== 'demo') throw new Error(`${emisor} no apunta al demo: este test no corre contra producción`)
    }
    tenantId = (await pool.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
  })
  afterAll(async () => {
    // Los pedidos de prueba se borran; la numeración NO se retrocede (esos números ya existen en el demo).
    await limpiarPedidosDePrueba(pool, MARCA)
    await pool.end()
  })

  it('boleta (Baker Brothers) y factura (Hermanos Loarte): aceptadas por SUNAT, con hash y PDF real', async () => {
    // El receptor sale del cliente de cada pedido (datos ficticios propios; nunca los ejemplos de la documentación de Mifact).
    const a = await crearPedidoDePrueba(pool, { tenantId, marca: MARCA, sede: 'Santa Marina', items: [{ slug: 'alfajor-mix', cantidad: 2 }], dni: '12345678', razonSocial: 'CLIENTE DE PRUEBA UNO' })
    const b = await crearPedidoDePrueba(pool, { tenantId, marca: MARCA, sede: 'Cedros', items: [{ slug: 'cuchareable', cantidad: 3 }], ruc: '20123456786', razonSocial: 'EMPRESA DE PRUEBA S.A.C.' })
    const boleta = await emitirComprobante(pool, tenantId, { pedido: a.numero, tipo: 'boleta' })
    const factura = await emitirComprobante(pool, tenantId, { pedido: b.numero, tipo: 'factura' })
    expect(boleta.receptor).toMatchObject({ documento: '12345678', nombre: 'CLIENTE DE PRUEBA UNO' })
    expect(factura.receptor).toMatchObject({ documento: '20123456786', nombre: 'EMPRESA DE PRUEBA S.A.C.' })

    expect(boleta).toMatchObject({ tipo: 'boleta', emisor: 'baker_brothers', entorno: 'demo', estado: 'aceptado', estadoCodigo: 102, total: a.total })
    expect(factura).toMatchObject({ tipo: 'factura', emisor: 'hermanos_loarte', entorno: 'demo', estado: 'aceptado', estadoCodigo: 102, total: b.total })
    expect(boleta.hash).toBeTruthy()
    expect(boleta.sunat.descripcion).toMatch(/aceptad/i)

    const consultado = await consultarEstado(pool, tenantId, boleta.id)
    expect(consultado).toMatchObject({ estado: 'aceptado', estadoCodigo: 102 })
    expect(consultado.consultadoEn).not.toBeNull()

    const { pdf, url } = await descargarPdf(pool, tenantId, factura.id)
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
    expect(pdf.length).toBeGreaterThan(20_000)
    expect(url).toMatch(/^https:\/\/.+\.pdf$/)
    expect(await obtenerComprobante(pool, tenantId, factura.id)).toMatchObject({ tienePdf: true, urlPdf: url })
  }, 120_000)

  it('un número que YA existe en Mifact (texto real de su error) hace saltar al siguiente número sin pisar el documento existente', async () => {
    const cfg = leerConfigEmisor('baker_brothers')
    if (!cfg.ok) throw new Error('config')
    const serie = cfg.config.serieBoleta
    const { rows } = await pool.query(
      `select coalesce(max(ultimo), $2::int - 1) as ultimo from comprobantes_numeradores where emisor = 'baker_brothers' and entorno = 'demo' and serie = $1`,
      [serie, cfg.config.correlativoInicial]
    )
    const ajeno = rows[0].ultimo + 1

    // Otro sistema (el portal de Mifact, otro programa) emite justo el número que nos tocaría.
    const desglose = desglosarLineas([{ descripcion: 'documento ajeno de prueba', cantidad: 1, precioUnitarioConIgv: 5 }])
    const r = resolverReceptor('boleta', {}, desglose.total)
    if (!r.ok) throw new Error('receptor')
    const cliente = crearClienteMifact(cfg.config)
    await cliente.enviar(construirDocumento({ config: cfg.config, tipo: 'boleta', serie, correlativo: ajeno, fechaEmision: fechaLimaISO(new Date()), receptor: r.receptor, desglose, codigosItem: ['AJENO'], usuario: 'otro-sistema' }))

    const p = await crearPedidoDePrueba(pool, { tenantId, marca: MARCA, sede: 'Santa Marina', items: [{ slug: 'cuchareable', cantidad: 1 }] })
    const c = await emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'boleta' })
    expect(c.serie).toBe(serie)
    expect(c.correlativo).toBe(ajeno + 1)
    expect(c.estado).toBe('aceptado')
    // El número gastado en el intento quedó marcado en nuestra base, y el documento ajeno sigue intacto en Mifact.
    const gastado = (await pool.query(`select estado from comprobantes where order_id = $1 and correlativo = $2`, [p.id, ajeno])).rows[0]
    expect(gastado.estado).toBe('error')
    const ajenoEnMifact = await cliente.estado({ ruc: cfg.config.ruc, tipoCpe: '03', serie, correlativo: ajeno, fechaEmision: fechaLimaISO(new Date()) })
    expect(ajenoEnMifact.estadoDocumento).toBe('102')
  }, 120_000)

  it('anular: Mifact deja la baja solicitada (108) y la consulta posterior lo confirma', async () => {
    const p = await crearPedidoDePrueba(pool, { tenantId, marca: MARCA, sede: null, tipoEntrega: 'delivery', delivery: 7, items: [{ slug: 'alfajor-mix', cantidad: 1 }] })
    const c = await emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'boleta' })
    const baja = await anularComprobante(pool, tenantId, c.id, { motivo: 'ANULACION DE PRUEBA AUTOMATICA' })
    expect(baja).toMatchObject({ estado: 'anulacion_solicitada', estadoCodigo: 108, motivoAnulacion: 'ANULACION DE PRUEBA AUTOMATICA' })
    // Mifact informa 108 hasta que procesa la baja al final del día (después 105): ambos son válidos tras pedirla.
    expect(['anulacion_solicitada', 'anulado']).toContain((await consultarEstado(pool, tenantId, c.id)).estado)
  }, 120_000)
})

/**
 * Recorrido REAL contra el DEMO de Mifact (demo.mifact.net.pe), desde pedidos de Bake OS. El receptor de cada comprobante
 * sale SIEMPRE del cliente del pedido (aquí, clientes ficticios propios creados con el pedido); nunca se le pasa un receptor
 * a mano ni se usan los clientes de ejemplo de la documentación de Mifact (lo vigila un test):
 *   1. emite una boleta y una factura (cada una con la razón social que le toca) y una boleta más para anular,
 *   2. consulta el estado de cada una y lo guarda en el pedido,
 *   3. descarga el PDF y lo guarda en el pedido (y una copia en la carpeta de salida),
 *   4. pide la anulación de la boleta de prueba,
 *   5. envía la factura por correo.
 * Imprime los números de serie y correlativo para revisarlos en el portal demo de Mifact.
 *
 *   pnpm mifact:demo            (usa .env.mifact-demo, que NO está en git)
 *
 * SALVAGUARDAS: este recorrido crea pedidos de prueba, así que SOLO corre contra una base de datos local, y se niega a
 * correr si algún emisor apunta a producción. Los datos son ficticios y propios (no los ejemplos de Mifact).
 */
import fs from 'node:fs'
import path from 'node:path'
import { pool } from '../src/db.js'
import { leerConfigEmisor, PREFIJO_ENV } from '../src/mifact/config.js'
import {
  anularComprobante,
  consultarEstado,
  descargarPdf,
  emitirComprobante,
  enviarCorreoComprobante,
  obtenerComprobante,
  type Comprobante,
} from '../src/services/comprobantes.js'
import { crearPedidoDePrueba } from './lib/pedidoDePrueba.js'

const MARCA = '[PRUEBA-MIFACT-DEMO]'
const SALIDA = process.env.MIFACT_DEMO_SALIDA ?? path.resolve('mifact-demo-salida')
// Sin dirección por defecto: Mifact podría enviar un correo REAL a esa dirección. Solo se envía si se indica a propósito.
const CORREO = (process.env.MIFACT_DEMO_CORREO ?? '').trim()

const fallar = (mensaje: string): never => {
  console.error(`\nNO SE EJECUTÓ: ${mensaje}`)
  process.exit(1)
}

// — salvaguardas —
const dbUrl = process.env.DATABASE_URL ?? ''
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl)) fallar('DATABASE_URL no es una base local: este recorrido crea pedidos de prueba.')
for (const emisor of Object.keys(PREFIJO_ENV) as (keyof typeof PREFIJO_ENV)[]) {
  const r = leerConfigEmisor(emisor)
  if (!r.ok) fallar(`falta configurar ${emisor}: ${[...r.faltan, ...r.invalidas.map((i) => `${i.variable} (${i.motivo})`)].join(', ')}`)
  else if (r.config.entorno !== 'demo') fallar(`${emisor} no apunta al demo de Mifact (entorno: ${r.config.entorno}). Nada se emite contra producción desde aquí.`)
}

const { rows: tenants } = await pool.query(`select id from tenants where slug = 'bake-brothers'`)
const tenantId: string = tenants[0].id
fs.mkdirSync(SALIDA, { recursive: true })

const linea = (c: Comprobante) => `${c.numero.padEnd(14)} ${c.tipo.padEnd(8)} ${c.estadoLegible.padEnd(22)} S/ ${c.total.toFixed(2).padStart(7)}  ${c.emisor}`
const paso = (t: string) => console.log(`\n=== ${t}`)
const resultados: Record<string, unknown>[] = []

try {
  paso('1. Pedidos de prueba en Bake OS (base local)')
  // Cada pedido trae SU cliente, con los datos que irán en el comprobante (todo ficticio; el RUC lleva dígito verificador válido).
  const pa = await crearPedidoDePrueba(pool, { tenantId, marca: MARCA, sede: 'Santa Marina', items: [{ slug: 'alfajor-mix', cantidad: 2 }, { slug: 'cuchareable', cantidad: 1 }], nombreCliente: 'Cliente de prueba uno', dni: '12345678', razonSocial: 'CLIENTE DE PRUEBA UNO', direccionFiscal: 'Calle de Prueba 100, Chorrillos' })
  const pb = await crearPedidoDePrueba(pool, { tenantId, marca: MARCA, sede: 'Cedros', items: [{ slug: 'alfajor-mix', cantidad: 4 }, { slug: 'cuchareable', cantidad: 2 }], nombreCliente: 'Empresa de prueba', ruc: '20123456786', razonSocial: 'EMPRESA DE PRUEBA S.A.C.', direccionFiscal: 'Av. de Prueba 500, Lima' })
  const pc = await crearPedidoDePrueba(pool, { tenantId, marca: MARCA, sede: null, tipoEntrega: 'delivery', delivery: 7, items: [{ slug: 'alfajor-mix', cantidad: 1 }], nombreCliente: 'Cliente para anular' })
  for (const [etiqueta, p] of [['A (Santa Marina, recojo)', pa], ['B (Cedros, recojo)', pb], ['C (delivery)', pc]] as const) console.log(`   ${etiqueta}: ${p.numero}  total S/ ${p.total.toFixed(2)}`)

  paso('2. Emitir (SendInvoice) — a cada pedido le factura su razón social')
  const boleta = await emitirComprobante(pool, tenantId, { pedido: pa.numero, tipo: 'boleta' })
  console.log('   ' + linea(boleta))
  const factura = await emitirComprobante(pool, tenantId, { pedido: pb.numero, tipo: 'factura' })
  console.log('   ' + linea(factura))
  const paraAnular = await emitirComprobante(pool, tenantId, { pedido: pc.numero, tipo: 'boleta' })
  console.log('   ' + linea(paraAnular))

  paso('3. Consultar el estado (GetEstatusInvoice) y guardarlo en el pedido')
  const estados: Comprobante[] = []
  for (const c of [boleta, factura, paraAnular]) {
    const r = await consultarEstado(pool, tenantId, c.id)
    estados.push(r)
    console.log(`   ${linea(r)}  | SUNAT: ${r.sunat.descripcion}`)
  }

  paso('4. Descargar el PDF (GetInvoice) y guardarlo en el pedido')
  const pdfs: Record<string, string> = {}
  for (const c of [boleta, factura, paraAnular]) {
    const { pdf, url, nombreArchivo } = await descargarPdf(pool, tenantId, c.id)
    const ruta = path.join(SALIDA, nombreArchivo)
    fs.writeFileSync(ruta, pdf)
    pdfs[c.numero] = ruta
    console.log(`   ${c.numero}: ${pdf.length} bytes → ${ruta}\n      URL en Mifact: ${url}`)
  }

  paso('5. Anular un comprobante de prueba (LowInvoice)')
  const anulado = await anularComprobante(pool, tenantId, paraAnular.id, { motivo: 'ANULACION DE PRUEBA' })
  console.log(`   ${linea(anulado)}  | motivo: ${anulado.motivoAnulacion}`)
  const tras = await consultarEstado(pool, tenantId, paraAnular.id)
  console.log(`   estado consultado después: ${tras.estadoLegible} (código ${tras.estadoCodigo})  — Mifact la pasa a «Anulado» al final del día`)

  if (CORREO) {
    paso(`6. Enviar la factura por correo (SendMailInvoice) a ${CORREO}`)
    const enviado = await enviarCorreoComprobante(pool, tenantId, factura.id, CORREO)
    console.log(`   ${enviado.numero}: correo enviado a ${enviado.correoEnviadoA}`)
  } else {
    paso('6. Correo: OMITIDO (define MIFACT_DEMO_CORREO con la dirección a la que quieres que Mifact envíe la factura de prueba)')
  }

  paso('RESUMEN para revisar en el portal demo de Mifact')
  const finales = await Promise.all([boleta, factura, paraAnular].map((c) => obtenerComprobante(pool, tenantId, c.id)))
  for (const c of finales) {
    console.log(`   ${c.numero.padEnd(14)} ${c.tipo.padEnd(8)} fecha ${c.fechaEmision}  total S/ ${c.total.toFixed(2).padStart(7)}  ${c.estadoLegible.padEnd(22)} pedido ${c.pedido}`)
    resultados.push({ pedido: c.pedido, tipo: c.tipo, numero: c.numero, fechaEmision: c.fechaEmision, total: c.total, estado: c.estado, estadoCodigo: c.estadoCodigo, emisor: c.emisor, hash: c.hash, urlPdf: c.urlPdf, pdf: pdfs[c.numero], correoEnviadoA: c.correoEnviadoA, motivoAnulacion: c.motivoAnulacion })
  }
  fs.writeFileSync(path.join(SALIDA, 'resumen-demo.json'), JSON.stringify(resultados, null, 2))
  console.log(`\n   Detalle en ${path.join(SALIDA, 'resumen-demo.json')}`)
} catch (err) {
  console.error('\nERROR:', err instanceof Error ? `${err.name}: ${err.message}` : err)
  if (err && typeof err === 'object' && 'detalle' in err) console.error('detalle:', JSON.stringify((err as { detalle: unknown }).detalle))
  process.exitCode = 1
} finally {
  await pool.end()
}

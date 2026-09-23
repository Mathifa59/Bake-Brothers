import PDFDocument from 'pdfkit'
import path from 'node:path'
import fs from 'node:fs'
import type pg from 'pg'
import { pedidoPorNumero } from '../repositories/ordersRepo.js'

/**
 * Comprobante en PDF — generado al vuelo desde el estado real de la base en
 * el momento del pedido (el servidor es la fuente de verdad, mismo criterio
 * de siempre: nunca se guarda un PDF "congelado" en un bucket que después
 * pueda desincronizarse del pedido real).
 *
 * pdfkit: JS puro, sin navegador headless — apps/api corre en una imagen
 * Alpine chica en Coolify, y Puppeteer/Chromium ahí es mucho más pesado
 * para un layout simple de recibo (logo, texto, una tabla de líneas).
 */

const RUTA_LOGO = path.join(process.cwd(), 'assets', 'logo-bakebrothers.jpg')

export async function generarComprobantePdf(
  client: pg.PoolClient,
  tenantId: string,
  numero: string
): Promise<Buffer | null> {
  const pedido = await pedidoPorNumero(client, tenantId, numero)
  if (!pedido) return null

  const doc = new PDFDocument({ size: 'A4', margin: 50 })
  const chunks: Buffer[] = []
  doc.on('data', (chunk) => chunks.push(chunk))
  const fin = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
  })

  if (fs.existsSync(RUTA_LOGO)) {
    doc.image(RUTA_LOGO, 50, 45, { width: 110 })
    doc.moveDown(3)
  }

  doc
    .fontSize(18)
    .font('Helvetica-Bold')
    .text('Comprobante de pedido', 50, fs.existsSync(RUTA_LOGO) ? 110 : 50)
  doc.fontSize(10).font('Helvetica').fillColor('#555').text(`Pedido ${pedido.numero}`)
  doc.moveDown(1.5)
  doc.fillColor('#000')

  const filaInfo = (etiqueta: string, valor: string) => {
    doc.font('Helvetica-Bold').fontSize(10).text(etiqueta, { continued: true })
    doc.font('Helvetica').text(` ${valor}`)
  }

  filaInfo('Fecha del pedido:', new Date(pedido.creadoEn).toLocaleString('es-PE'))
  filaInfo('Sede:', pedido.sedeNombre ?? 'sin asignar')
  filaInfo('Cliente:', `${pedido.cliente.nombre} — ${pedido.cliente.telefono}`)
  filaInfo(
    'Entrega:',
    pedido.tipoEntrega === 'tienda'
      ? 'Recojo en tienda'
      : `Delivery — ${pedido.direccion ?? ''}, ${pedido.distrito ?? ''}`
  )
  filaInfo('Fecha de entrega:', `${pedido.fechaEntrega} — ${pedido.horario}`)
  filaInfo('Método de pago:', pedido.metodoPago)
  filaInfo('Estado:', pedido.estado === 'paid' ? 'Pagado' : pedido.estadoLegible)
  if (pedido.nota) {
    filaInfo('Nota:', pedido.nota)
  }

  doc.moveDown(1.5)

  const colX = { nombre: 50, cantidad: 320, precio: 380, subtotal: 460 }
  doc.font('Helvetica-Bold').fontSize(10)
  doc.text('Producto', colX.nombre, doc.y, { continued: false })
  doc.text('Cant.', colX.cantidad, doc.y - doc.currentLineHeight())
  doc.text('Precio', colX.precio, doc.y - doc.currentLineHeight())
  doc.text('Subtotal', colX.subtotal, doc.y - doc.currentLineHeight())
  doc.moveDown(0.3)
  doc
    .moveTo(50, doc.y)
    .lineTo(545, doc.y)
    .strokeColor('#ccc')
    .stroke()
  doc.moveDown(0.5)

  doc.font('Helvetica').fontSize(10)
  for (const item of pedido.items) {
    const y = doc.y
    const nombreConTamano = item.tamano ? `${item.nombre} (${item.tamano})` : item.nombre
    doc.text(nombreConTamano, colX.nombre, y, { width: 260 })
    doc.text(String(item.cantidad), colX.cantidad, y)
    doc.text(`S/ ${item.precio.toFixed(2)}`, colX.precio, y)
    doc.text(`S/ ${(item.precio * item.cantidad).toFixed(2)}`, colX.subtotal, y)
    doc.moveDown(0.6)
  }

  doc.moveDown(0.5)
  doc
    .moveTo(50, doc.y)
    .lineTo(545, doc.y)
    .strokeColor('#ccc')
    .stroke()
  doc.moveDown(0.5)

  doc.font('Helvetica-Bold').fontSize(12)
  doc.text(`Total: S/ ${pedido.total.toFixed(2)}`, colX.precio, doc.y, { align: 'left' })

  doc.moveDown(2)
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#888')
    .text('Delivery y descuentos, si aplican, los confirma el equipo por separado.', 50, doc.y)

  doc.end()
  return fin
}

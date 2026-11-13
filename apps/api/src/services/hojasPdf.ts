import PDFDocument from 'pdfkit'
import path from 'node:path'
import fs from 'node:fs'
import {
  CORTE_TEXTO,
  minutosDelDia,
  type BloqueMayorista,
  type HojaProduccion,
} from '@bakebrothers/domain'

/**
 * Hojas para imprimir (A4) — se generan al vuelo desde el plan real, igual que el comprobante: nunca un PDF
 * guardado que pueda quedar distinto de lo que dice la pantalla. Pensadas para papel: texto grande, líneas para
 * escribir a mano y casilleros para marcar.
 *   · Hoja de producción: primero lo que sale antes de las 8:00 a. m.; luego las empanadas por sabor; luego
 *     catering y otros por área.
 *   · Hoja de empaque mayorista (línea blanca): un bloque por cliente con hora, tamaño, cantidades por sabor,
 *     total y postres.
 */
const RUTA_LOGO = path.join(process.cwd(), 'assets', 'logo-bakebrothers.jpg')
const M = 40 // margen
const ANCHO = 595.28 - M * 2
const TINTA = '#1f1f1f'
const GRIS = '#666666'
const RAYA = '#bdbdbd'

interface Columna {
  titulo: string
  ancho: number
  alinear?: 'left' | 'right' | 'center'
}

function nuevoDoc() {
  const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true })
  const chunks: Buffer[] = []
  doc.on('data', (c) => chunks.push(c))
  const fin = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))))
  return { doc, fin }
}

const fechaLarga = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d, 12))
  )
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function encabezado(doc: PDFKit.PDFDocument, titulo: string, fechaISO: string, sede: string) {
  if (fs.existsSync(RUTA_LOGO)) doc.image(RUTA_LOGO, M, M - 5, { width: 70 })
  doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(18).text(titulo, M + 85, M, { width: ANCHO - 85 })
  doc.font('Helvetica').fontSize(11).fillColor(GRIS).text(`${fechaLarga(fechaISO)} · ${sede}`, M + 85, doc.y + 2, { width: ANCHO - 85 })
  doc.fillColor(TINTA)
  doc.y = Math.max(doc.y, M + 55) + 8
}

function asegurarEspacio(doc: PDFKit.PDFDocument, alto: number) {
  if (doc.y + alto > doc.page.height - M - 20) doc.addPage()
}

function subtitulo(doc: PDFKit.PDFDocument, texto: string, detalle?: string) {
  asegurarEspacio(doc, 60)
  doc.moveDown(0.6)
  doc.font('Helvetica-Bold').fontSize(13).fillColor(TINTA).text(texto, M, doc.y, { continued: !!detalle })
  if (detalle) doc.font('Helvetica').fontSize(10).fillColor(GRIS).text(`   ${detalle}`)
  doc.moveTo(M, doc.y + 2).lineTo(M + ANCHO, doc.y + 2).strokeColor(TINTA).lineWidth(1).stroke()
  doc.y += 6
  doc.fillColor(TINTA)
}

function tabla(doc: PDFKit.PDFDocument, columnas: Columna[], filas: string[][], opciones: { negritaUltima?: boolean; casillero?: boolean } = {}) {
  const alto = 18
  const cabecera = () => {
    asegurarEspacio(doc, alto * 2)
    let x = M
    const y = doc.y
    doc.font('Helvetica-Bold').fontSize(9).fillColor(GRIS)
    for (const c of columnas) {
      doc.text(c.titulo.toUpperCase(), x + 3, y + 4, { width: c.ancho - 6, align: c.alinear ?? 'left', lineBreak: false })
      x += c.ancho
    }
    doc.moveTo(M, y + alto - 2).lineTo(M + ANCHO, y + alto - 2).strokeColor(RAYA).lineWidth(0.5).stroke()
    doc.y = y + alto
    doc.fillColor(TINTA)
  }
  cabecera()
  filas.forEach((fila, i) => {
    if (doc.y + alto > doc.page.height - M - 20) {
      doc.addPage()
      cabecera()
    }
    const y = doc.y
    const ultima = opciones.negritaUltima && i === filas.length - 1
    doc.font(ultima ? 'Helvetica-Bold' : 'Helvetica').fontSize(11).fillColor(TINTA)
    let x = M
    columnas.forEach((c, j) => {
      doc.text(fila[j] ?? '', x + 3, y + 3, { width: c.ancho - 6, align: c.alinear ?? 'left', lineBreak: false, ellipsis: true })
      x += c.ancho
    })
    if (opciones.casillero && !ultima) doc.rect(M + ANCHO - 16, y + 3, 11, 11).strokeColor(TINTA).lineWidth(0.8).stroke()
    doc.moveTo(M, y + alto - 1).lineTo(M + ANCHO, y + alto - 1).strokeColor('#e3e3e3').lineWidth(0.5).stroke()
    doc.y = y + alto
  })
  doc.y += 4
}

function pie(doc: PDFKit.PDFDocument) {
  const { start, count } = doc.bufferedPageRange()
  for (let i = start; i < start + count; i++) {
    doc.switchToPage(i)
    // El pie se escribe dentro del margen inferior: sin esto pdfkit lo toma por desborde y agrega una página en blanco.
    doc.page.margins.bottom = 0
    doc.font('Helvetica').fontSize(8).fillColor(GRIS)
    doc.text(`Bake Brothers · impreso ${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })} · página ${i + 1} de ${count}`, M, doc.page.height - M + 4, {
      width: ANCHO,
      align: 'center',
      lineBreak: false,
    })
  }
}

const num = (n: number) => (n === 0 ? '—' : String(n))
const etiquetaTamano = (t: string | null) => t ?? ''

// ————————————————————————————————————————————————— hoja de producción ————

export async function hojaProduccionPdf(hoja: HojaProduccion, meta: { fecha: string; sede: string; pagoPendiente: number; sinAsignar: number }): Promise<Buffer> {
  const { doc, fin } = nuevoDoc()
  encabezado(doc, 'Hoja de producción', meta.fecha, meta.sede)

  // 1. Primero lo que sale antes de las 8:00 a. m.
  subtitulo(doc, 'Sale antes de las 8:00 a. m.', 'despacho de mayoristas')
  if (hoja.antesDe8.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor(GRIS).text('Nada sale antes de las 8:00 a. m.')
    doc.fillColor(TINTA)
  } else {
    tabla(
      doc,
      [
        { titulo: 'Cant.', ancho: 50, alinear: 'right' },
        { titulo: 'Producto', ancho: 235 },
        { titulo: 'Tamaño', ancho: 85 },
        { titulo: 'Pedidos', ancho: ANCHO - 370 - 22 },
        { titulo: '', ancho: 22 },
      ],
      hoja.antesDe8.map((l) => [String(l.cantidad), l.sabor ? `${l.nombre} — ${l.sabor}` : l.nombre, etiquetaTamano(l.tamano), l.pedidos.join(', '), '']),
      { casillero: true }
    )
  }

  // 2. Empanadas por sabor.
  subtitulo(doc, 'Empanadas por sabor')
  if (hoja.empanadas.filas.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor(GRIS).text('No hay empanadas en el plan de hoy.')
    doc.fillColor(TINTA)
  } else {
    const t = hoja.empanadas.totales
    tabla(
      doc,
      [
        { titulo: 'Sabor', ancho: ANCHO - 4 * 70 - 22 },
        { titulo: 'Medianas', ancho: 70, alinear: 'right' },
        { titulo: 'Grandes', ancho: 70, alinear: 'right' },
        { titulo: 'Mini', ancho: 70, alinear: 'right' },
        { titulo: 'Total', ancho: 70, alinear: 'right' },
        { titulo: '', ancho: 22 },
      ],
      [
        ...hoja.empanadas.filas.map((f) => [f.sabor, num(f.mediana), num(f.grande), num(f.mini), String(f.total), '']),
        ['TOTAL', String(t.mediana), String(t.grande), String(t.mini), String(t.total), ''],
      ],
      { negritaUltima: true, casillero: true }
    )
  }

  // 3. Catering y otros por área.
  subtitulo(doc, 'Catering y otros, por área')
  if (hoja.porArea.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor(GRIS).text('No hay otros productos en el plan de hoy.')
    doc.fillColor(TINTA)
  }
  for (const area of hoja.porArea) {
    asegurarEspacio(doc, 70)
    doc.font('Helvetica-Bold').fontSize(11).fillColor(TINTA).text(area.nombre.toUpperCase(), M, doc.y + 2)
    doc.y += 2
    tabla(
      doc,
      [
        { titulo: 'Producto', ancho: ANCHO - 4 * 62 - 22 },
        { titulo: 'Tamaño', ancho: 62 },
        { titulo: 'Pedido', ancho: 62, alinear: 'right' },
        { titulo: 'Vitrina', ancho: 62, alinear: 'right' },
        { titulo: 'Total', ancho: 62, alinear: 'right' },
        { titulo: '', ancho: 22 },
      ],
      area.lineas.map((l) => [l.sabor ? `${l.nombre} — ${l.sabor}` : l.nombre, etiquetaTamano(l.tamano), num(l.porPedido), num(l.vitrina), String(l.total), '']),
      { casillero: true }
    )
  }

  const avisos: string[] = []
  if (meta.pagoPendiente > 0) avisos.push(`${meta.pagoPendiente} pedido(s) esperando pago no están en esta hoja.`)
  if (meta.sinAsignar > 0) avisos.push(`${meta.sinAsignar} pedido(s) sin sede no están en esta hoja.`)
  if (avisos.length > 0) {
    asegurarEspacio(doc, 40)
    doc.moveDown(0.5).font('Helvetica-Oblique').fontSize(9).fillColor(GRIS).text(avisos.join(' '), M, doc.y, { width: ANCHO })
  }

  pie(doc)
  doc.end()
  return fin
}

// ———————————————————————————————————————— hoja de empaque mayorista ————

export async function hojaEmpaqueMayoristaPdf(bloques: BloqueMayorista[], meta: { fecha: string; sede: string }): Promise<Buffer> {
  const { doc, fin } = nuevoDoc()
  encabezado(doc, 'Empaque mayorista · línea blanca', meta.fecha, meta.sede)

  // Responsables: líneas en blanco para escribir a mano.
  const yResp = doc.y
  doc.font('Helvetica-Bold').fontSize(11).fillColor(TINTA)
  doc.text('Responsable de carga:', M, yResp, { lineBreak: false })
  doc.moveTo(M + 125, yResp + 12).lineTo(M + 250, yResp + 12).strokeColor(TINTA).lineWidth(0.8).stroke()
  doc.text('Responsable de empaque:', M + 275, yResp, { lineBreak: false })
  doc.moveTo(M + 420, yResp + 12).lineTo(M + ANCHO, yResp + 12).strokeColor(TINTA).lineWidth(0.8).stroke()
  doc.y = yResp + 24
  doc.font('Helvetica').fontSize(10).fillColor(GRIS).text(`Corte de pedidos: ${CORTE_TEXTO}   ·   Despacho: 7:30 a 8:00 a. m.`, M, doc.y)
  doc.fillColor(TINTA).moveDown(0.4)
  doc.moveTo(M, doc.y).lineTo(M + ANCHO, doc.y).strokeColor(TINTA).lineWidth(1).stroke()
  doc.y += 8

  if (bloques.length === 0) {
    doc.font('Helvetica').fontSize(11).fillColor(GRIS).text('No hay órdenes de mayoristas para este día.', M, doc.y)
  }

  for (const b of bloques) {
    // Alto del bloque: cabecera + una línea por sabor + total/postres + pie.
    const lineasSabor = Math.max(b.sabores.length, 1)
    const alto = 34 + lineasSabor * 17 + (b.sabores.length > 0 ? 22 : 0) + (b.postres.length > 0 ? 18 : 0) + 24
    asegurarEspacio(doc, alto)
    const y0 = doc.y
    doc.rect(M, y0, ANCHO, alto).strokeColor(TINTA).lineWidth(1).stroke()

    // Cabecera del cliente
    const minutos = minutosDelDia(b.hora)
    const hora = b.hora ? (minutos !== null ? `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}` : b.hora) : 'sin hora'
    doc.font('Helvetica-Bold').fontSize(13).fillColor(TINTA).text(b.cliente, M + 8, y0 + 7, { width: ANCHO - 200, lineBreak: false, ellipsis: true })
    doc.font('Helvetica-Bold').fontSize(13).text(hora, M + ANCHO - 190, y0 + 7, { width: 60, align: 'right', lineBreak: false })
    doc.font('Helvetica').fontSize(10).fillColor(GRIS).text(b.tamano ? `Tamaño: ${b.tamano}` : 'Solo postres', M + ANCHO - 125, y0 + 9, { width: 117, align: 'right', lineBreak: false })
    doc.fillColor(TINTA)
    doc.moveTo(M, y0 + 28).lineTo(M + ANCHO, y0 + 28).strokeColor(RAYA).lineWidth(0.5).stroke()

    // Sabores
    let y = y0 + 33
    if (b.sabores.length === 0) {
      doc.font('Helvetica').fontSize(10).fillColor(GRIS).text('Sin empanadas', M + 10, y, { lineBreak: false })
      doc.fillColor(TINTA)
      y += 17
    }
    for (const s of b.sabores) {
      doc.font('Helvetica').fontSize(11).text(s.sabor, M + 10, y, { width: 260, lineBreak: false })
      doc.font('Helvetica-Bold').fontSize(12).text(String(s.cantidad), M + 270, y - 1, { width: 40, align: 'right', lineBreak: false })
      // Cliente «Mixto»: cuántas de cada tamaño, para no mezclar las cajas.
      if (b.tamano === 'Mixto') {
        doc.font('Helvetica').fontSize(10).fillColor(GRIS).text(`${s.mediana} medianas + ${s.grande} grandes`, M + 325, y + 1, { width: 180, lineBreak: false })
        doc.fillColor(TINTA)
      }
      y += 17
    }

    // Total, postres y casillero de empacado
    if (b.sabores.length > 0) {
      doc.font('Helvetica-Bold').fontSize(11).text(`Total empanadas: ${b.totalEmpanadas}`, M + 10, y + 3, { lineBreak: false })
      y += 22
    }
    if (b.postres.length > 0) {
      const texto = b.postres.map((p) => `${p.cantidad} × ${p.nombre}${p.tamano ? ` (${p.tamano})` : ''}`).join(' · ')
      doc.font('Helvetica').fontSize(10).fillColor(TINTA).text(`Postres: ${texto}`, M + 10, y, { width: ANCHO - 20, lineBreak: false, ellipsis: true })
      y += 18
    }
    if (b.fueraDeCorte) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#a33').text('REGISTRADA FUERA DE CORTE', M + 10, y0 + alto - 19, { width: 200, lineBreak: false })
      doc.fillColor(TINTA)
    }
    doc.font('Helvetica').fontSize(10).text('Empacado', M + ANCHO - 82, y0 + alto - 19, { width: 52, align: 'right', lineBreak: false })
    doc.rect(M + ANCHO - 24, y0 + alto - 21, 13, 13).strokeColor(TINTA).lineWidth(0.8).stroke()
    doc.y = y0 + alto + 8
  }

  pie(doc)
  doc.end()
  return fin
}

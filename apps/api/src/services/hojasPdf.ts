import PDFDocument from 'pdfkit'
import {
  CORTE_TEXTO,
  SABORES_MAYORISTA,
  abreviaturaDeSabor,
  nombreDeArea,
  type FilaMayorista,
  type GrupoAgendado,
  type HojaProduccion,
  type LineaCritica,
} from '@bakebrothers/domain'

/**
 * Hojas para imprimir — réplica de las hojas del Excel del equipo («Plantilla maestra de pedidos diarios»), generadas
 * al vuelo desde los datos reales (nunca un PDF guardado que pueda quedar distinto de la pantalla):
 *   1. Pedidos mayoristas (empaque línea blanca, sin branding): una fila por cliente y tamaño, 10 columnas de sabores.
 *   2. Pedidos agendados (venta digital): un cliente con varios productos ocupa una fila por producto, agrupadas.
 *   3. Resumen de producción del día: primero las horas críticas, luego empanadas por sabor y catering/otros.
 * La hoja DATOS del Excel es interna y no se imprime. Todas salen apaisadas (A4) para que las columnas se lean.
 */
const M = 28
const NEGRO = '#111111'
const GRIS = '#666666'
const LINEA = '#d9d9d9'
const ZEBRA = '#f5f5f5'
const NARANJA = '#e8710a'
const DURAZNO = '#fdeedd'
const VERDE = '#2e7d32'
const ROJO = '#c62828'

type Alinear = 'left' | 'center' | 'right'
interface Columna {
  titulo: string
  ancho: number
  alinear?: Alinear
}
type Celda = string | { t: string; color?: string; bold?: boolean }
const textoDe = (c: Celda) => (typeof c === 'string' ? c : c.t)

function nuevoDoc() {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: M, bufferPages: true })
  const chunks: Buffer[] = []
  doc.on('data', (c) => chunks.push(c))
  const fin = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))))
  const ancho = doc.page.width - M * 2
  return { doc, fin, ancho }
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
/** «viernes, noviembre 13, 2026» — el formato de la fecha en su hoja. */
export function fechaDeHoja(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dia = DIAS[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()]
  return `${dia}, ${MESES[m - 1]} ${d}, ${y}`
}

/** Nombres que se escriben al imprimir (responsable de carga/empaque): una línea, sin controles, acotados. */
export const limpiarResponsable = (s: string | undefined | null): string =>
  (s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)

// ———————————————————————————————————————————————————————— piezas de dibujo ————

function texto(doc: PDFKit.PDFDocument, t: string, x: number, y: number, w: number, o: { size?: number; bold?: boolean; color?: string; align?: Alinear; lineBreak?: boolean } = {}) {
  doc.font(o.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(o.size ?? 7.5).fillColor(o.color ?? NEGRO)
  doc.text(t, x, y, { width: w, align: o.align ?? 'left', lineBreak: o.lineBreak ?? true })
}

function altoTexto(doc: PDFKit.PDFDocument, t: string, w: number, size: number, bold = false): number {
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size)
  return t ? doc.heightOfString(t, { width: w }) : 0
}

/** Título de la hoja: una barra centrada y en negrita. */
function titulo(doc: PDFKit.PDFDocument, ancho: number, t: string) {
  const y = doc.y
  doc.rect(M, y, ancho, 24).strokeColor(LINEA).lineWidth(0.5).stroke()
  texto(doc, t, M, y + 6, ancho, { size: 15, bold: true, align: 'center', lineBreak: false })
  doc.y = y + 24
}

/** Franja de color con una línea de texto centrada (la franja naranja de su hoja). */
function franja(doc: PDFKit.PDFDocument, ancho: number, t: string, o: { fondo?: string; color?: string; size?: number; bold?: boolean; alto?: number } = {}) {
  const y = doc.y
  const alto = o.alto ?? 16
  if (o.fondo) doc.rect(M, y, ancho, alto).fillColor(o.fondo).fill()
  doc.rect(M, y, ancho, alto).strokeColor(LINEA).lineWidth(0.5).stroke()
  texto(doc, t, M + 4, y + (alto - (o.size ?? 8)) / 2 - 0.5, ancho - 8, { size: o.size ?? 8, bold: o.bold ?? true, color: o.color ?? NARANJA, align: 'center', lineBreak: false })
  doc.y = y + alto
}

/** Fila de datos de encabezado (fecha, responsables, corte…): celdas con su ancho relativo. */
function filaInfo(doc: PDFKit.PDFDocument, ancho: number, celdas: { t: string; partes: number; bold?: boolean }[]) {
  const y = doc.y
  const total = celdas.reduce((n, c) => n + c.partes, 0)
  let x = M
  doc.rect(M, y, ancho, 18).strokeColor(LINEA).lineWidth(0.5).stroke()
  for (const c of celdas) {
    const w = (ancho * c.partes) / total
    texto(doc, c.t, x + 4, y + 5, w - 8, { size: 8, bold: c.bold ?? true, lineBreak: false })
    x += w
  }
  doc.y = y + 18
}

function cabeceraTabla(doc: PDFKit.PDFDocument, x: number, columnas: Columna[], fondo = NEGRO) {
  // Los títulos largos («Producción madrugada (AUTO)») se parten en líneas: la cabecera crece lo necesario.
  const alto = Math.max(17, ...columnas.map((c) => altoTexto(doc, c.titulo, c.ancho - 4, 6.8, true) + 9))
  const y = doc.y
  const ancho = columnas.reduce((n, c) => n + c.ancho, 0)
  doc.rect(x, y, ancho, alto).fillColor(fondo).fill()
  let cx = x
  for (const c of columnas) {
    const h = altoTexto(doc, c.titulo, c.ancho - 4, 6.8, true)
    texto(doc, c.titulo, cx + 2, y + (alto - h) / 2, c.ancho - 4, { size: 6.8, bold: true, color: '#ffffff', align: 'center' })
    cx += c.ancho
  }
  doc.y = y + alto
}

/**
 * Tabla de su hoja: cabecera negra, filas alternadas, líneas finas. Las celdas largas se parten en varias líneas
 * (la fila crece). Si no cabe en la página sigue en la siguiente repitiendo la cabecera. `minFilas` agrega filas en
 * blanco hasta ese mínimo, como las líneas libres de su hoja (para anotar a mano).
 */
function tabla(
  doc: PDFKit.PDFDocument,
  x: number,
  columnas: Columna[],
  filas: Celda[][],
  o: { minFilas?: number; size?: number; fondoCabecera?: string; filaFinal?: boolean } = {}
) {
  const size = o.size ?? 7.5
  const ancho = columnas.reduce((n, c) => n + c.ancho, 0)
  const lista = [...filas]
  while (lista.length < (o.minFilas ?? 0)) lista.push(columnas.map(() => ''))
  cabeceraTabla(doc, x, columnas, o.fondoCabecera)
  lista.forEach((fila, i) => {
    const esFinal = o.filaFinal && i === lista.length - 1
    const alto = Math.max(15, ...fila.map((c, j) => altoTexto(doc, textoDe(c), columnas[j].ancho - 6, size, esFinal || (typeof c !== 'string' && !!c.bold)) + 6))
    if (doc.y + alto > doc.page.height - M - 14) {
      doc.addPage()
      doc.y = M
      cabeceraTabla(doc, x, columnas, o.fondoCabecera)
    }
    const y = doc.y
    if (esFinal) doc.rect(x, y, ancho, alto).fillColor('#444444').fill()
    else if (i % 2 === 1) doc.rect(x, y, ancho, alto).fillColor(ZEBRA).fill()
    let cx = x
    columnas.forEach((c, j) => {
      const celda = fila[j] ?? ''
      const t = textoDe(celda)
      const hTexto = altoTexto(doc, t, c.ancho - 6, size, esFinal || (typeof celda !== 'string' && !!celda.bold))
      texto(doc, t, cx + 3, y + (alto - hTexto) / 2, c.ancho - 6, {
        size,
        bold: esFinal || (typeof celda !== 'string' && !!celda.bold),
        color: esFinal ? '#ffffff' : typeof celda === 'string' ? NEGRO : (celda.color ?? NEGRO),
        align: c.alinear ?? 'left',
      })
      doc.rect(cx, y, c.ancho, alto).strokeColor(LINEA).lineWidth(0.4).stroke()
      cx += c.ancho
    })
    doc.y = y + alto
  })
}

function pie(doc: PDFKit.PDFDocument, sede: string) {
  const { start, count } = doc.bufferedPageRange()
  for (let i = start; i < start + count; i++) {
    doc.switchToPage(i)
    // El pie se escribe dentro del margen inferior: sin esto pdfkit lo toma por desborde y agrega una página en blanco.
    doc.page.margins.bottom = 0
    texto(doc, `Bake Brothers${sede ? ` · ${sede}` : ''} · impreso ${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })} · página ${i + 1} de ${count}`, M, doc.page.height - M + 8, doc.page.width - M * 2, {
      size: 7,
      color: GRIS,
      align: 'center',
      lineBreak: false,
    })
  }
}

const num = (n: number) => (n === 0 ? '' : String(n))

// ——————————————————————————————————————————————— 1. pedidos mayoristas ————

/** Encabezados de corte de las hojas: una sola definición (el corte es el de `corteOrdenes.ts`, 11:00 p. m. para todos). */
export const TEXTO_CORTE_MAYORISTA = `CORTE MAYORISTA: ${CORTE_TEXTO}`
export const TEXTO_CORTE_PRINCIPAL = `CORTE PRINCIPAL: ${CORTE_TEXTO}`

type Doc = PDFKit.PDFDocument
export interface MetaHoja {
  fecha: string
  sede: string
  cargaPor?: string
  empaquePor?: string
}

function dibujarMayoristas(doc: Doc, ancho: number, filas: FilaMayorista[], meta: MetaHoja) {
  doc.y = M
  titulo(doc, ancho, 'BAKE BROTHERS | PEDIDOS MAYORISTAS')
  franja(doc, ancho, 'EMPAQUE: LÍNEA BLANCA / SIN BRANDING • Hoja operativa para empaque 6:00–8:00 a. m.', { fondo: DURAZNO })
  filaInfo(doc, ancho, [
    { t: fechaDeHoja(meta.fecha), partes: 7 },
    { t: `RESPONSABLE CARGA: ${limpiarResponsable(meta.cargaPor)}`, partes: 8 },
    { t: `RESPONSABLE EMPAQUE: ${limpiarResponsable(meta.empaquePor)}`, partes: 8 },
    { t: TEXTO_CORTE_MAYORISTA, partes: 7 },
    { t: 'DESPACHO: 7:30–8:00 a. m.', partes: 7 },
  ])
  franja(doc, ancho, 'EMPAQUE POR MAYOR – EMPANADAS', { color: NEGRO, fondo: '#f3f3f3', size: 8.5 })

  const anchoSabor = 36
  const columnas: Columna[] = [
    { titulo: 'Cliente', ancho: 128 },
    { titulo: 'Hora', ancho: 50, alinear: 'center' },
    { titulo: 'Tamaño', ancho: 42, alinear: 'center' },
    ...SABORES_MAYORISTA.map((s) => ({ titulo: s, ancho: anchoSabor, alinear: 'center' as Alinear })),
    { titulo: 'Total Uds', ancho: 46, alinear: 'center' },
    { titulo: 'Observación (postres o empaque)', ancho: ancho - 128 - 50 - 42 - anchoSabor * SABORES_MAYORISTA.length - 46 },
  ]
  tabla(
    doc,
    M,
    columnas,
    filas.map((f) => [
      f.cliente,
      f.hora,
      f.tamano,
      ...f.cantidades.map(num),
      { t: f.total > 0 ? String(f.total) : '', bold: true },
      f.observacion,
    ]),
    { minFilas: 16 }
  )
  if (filas.length === 0) {
    doc.moveDown(0.5)
    texto(doc, 'No hay órdenes de mayoristas para este día.', M, doc.y, ancho, { size: 9, color: GRIS })
  }
}

export async function hojaEmpaqueMayoristaPdf(filas: FilaMayorista[], meta: MetaHoja): Promise<Buffer> {
  const { doc, fin, ancho } = nuevoDoc()
  dibujarMayoristas(doc, ancho, filas, meta)
  pie(doc, meta.sede)
  doc.end()
  return fin
}

// —————————————————————————————————————— 2. pedidos agendados (venta digital) ————

const COLOR_PRIORIDAD: Record<string, string> = { ALTA: ROJO, MEDIA: NARANJA, NORMAL: GRIS }

function dibujarAgendados(doc: Doc, ancho: number, grupos: GrupoAgendado[], meta: MetaHoja) {
  doc.y = M
  titulo(doc, ancho, 'BAKE BROTHERS | PEDIDOS AGENDADOS – VENTA DIGITAL')
  franja(doc, ancho, 'WhatsApp • Recojo • Delivery • Pedidos especiales • Empaque estándar brandeado', { fondo: DURAZNO, color: GRIS })
  filaInfo(doc, ancho, [
    { t: fechaDeHoja(meta.fecha), partes: 3 },
    { t: `RESPONSABLE DE CARGA: ${limpiarResponsable(meta.cargaPor)}`, partes: 4 },
    { t: TEXTO_CORTE_PRINCIPAL, partes: 3 },
  ])
  franja(
    doc,
    ancho,
    'USO OPERATIVO: Venta Digital registra el pedido. Tienda/Empaque actualiza ESTADO en tiempo real. Producción madrugada y prioridad son automáticas. PRIORIDAD ALTA: hora listo/salida hasta las 8:00 a. m. inclusive.',
    { color: GRIS, bold: false, size: 6.8, alto: 14 }
  )

  // Anchos (suman el ancho útil): primeras columnas por grupo (cliente…), luego por línea, luego otra vez por grupo.
  const c = { cliente: 82, modalidad: 56, hora: 46, cant: 38, producto: 140, area: 56, prior: 44, estado: 58, pago: 62, dir: 92, obs: 0, madr: 54 }
  c.obs = ancho - (c.cliente + c.modalidad + c.hora + c.cant + c.producto + c.area + c.prior + c.estado + c.pago + c.dir + c.madr)
  const columnas: Columna[] = [
    { titulo: 'Cliente', ancho: c.cliente },
    { titulo: 'Modalidad', ancho: c.modalidad, alinear: 'center' },
    { titulo: 'Hora listo / salida', ancho: c.hora, alinear: 'center' },
    { titulo: 'Cantidad', ancho: c.cant, alinear: 'center' },
    { titulo: 'Producto', ancho: c.producto },
    { titulo: 'Área', ancho: c.area, alinear: 'center' },
    { titulo: 'Prioridad prod.', ancho: c.prior, alinear: 'center' },
    { titulo: 'Estado', ancho: c.estado, alinear: 'center' },
    { titulo: 'Medio pago', ancho: c.pago, alinear: 'center' },
    { titulo: 'Dirección / Distrito', ancho: c.dir, alinear: 'center' },
    { titulo: 'Observación / empaque especial', ancho: c.obs },
    { titulo: 'Producción madrugada (AUTO)', ancho: c.madr, alinear: 'center' },
  ]
  cabeceraTabla(doc, M, columnas)

  const size = 7.2
  const X: number[] = []
  columnas.reduce((x, col) => (X.push(x), x + col.ancho), M)
  const celda = (i: number, t: string, y: number, h: number, o: { bold?: boolean; color?: string; align?: Alinear } = {}) => {
    const hT = altoTexto(doc, t, columnas[i].ancho - 6, size, o.bold)
    texto(doc, t, X[i] + 3, y + Math.max(2, (h - hT) / 2), columnas[i].ancho - 6, { size, bold: o.bold, color: o.color, align: o.align ?? columnas[i].alinear })
  }

  let n = 0
  for (const g of grupos) {
    const altosLinea = g.lineas.map((l) => Math.max(15, altoTexto(doc, l.producto, c.producto - 6, size) + 6))
    const altoGrupo = Math.max(
      15,
      altosLinea.reduce((a, b) => a + b, 0),
      altoTexto(doc, g.cliente, c.cliente - 6, size) + 6,
      altoTexto(doc, g.modalidad, c.modalidad - 6, size) + 6,
      altoTexto(doc, g.estado, c.estado - 6, size, true) + 6,
      altoTexto(doc, g.medioPago, c.pago - 6, size) + 6,
      altoTexto(doc, g.direccion, c.dir - 6, size) + 6,
      altoTexto(doc, g.observacion, c.obs - 6, size) + 6
    )
    if (doc.y + altoGrupo > doc.page.height - M - 14) {
      doc.addPage()
      doc.y = M
      cabeceraTabla(doc, M, columnas)
    }
    const y0 = doc.y
    if (n % 2 === 1) doc.rect(M, y0, ancho, altoGrupo).fillColor(ZEBRA).fill()
    // Celdas «combinadas» del pedido (una vez por cliente, a todo el alto del grupo).
    celda(0, g.cliente, y0, altoGrupo)
    celda(1, g.modalidad, y0, altoGrupo)
    celda(7, g.estado, y0, altoGrupo, { color: g.estado === 'LISTO' ? VERDE : NEGRO, bold: g.estado === 'LISTO' })
    celda(8, g.medioPago, y0, altoGrupo)
    celda(9, g.direccion, y0, altoGrupo)
    celda(10, g.observacion, y0, altoGrupo)
    // Una fila por producto.
    let y = y0
    g.lineas.forEach((l, i) => {
      const h = i === g.lineas.length - 1 ? altoGrupo - (y - y0) : altosLinea[i]
      celda(2, l.hora, y, h)
      celda(3, String(l.cantidad), y, h)
      celda(4, l.producto, y, h)
      celda(5, l.area, y, h)
      celda(6, l.prioridad, y, h, { color: COLOR_PRIORIDAD[l.prioridad], bold: l.prioridad !== 'NORMAL' })
      celda(11, l.madrugada ? 'SÍ' : 'NO', y, h, { color: l.madrugada ? NARANJA : GRIS, bold: l.madrugada })
      if (i > 0) doc.moveTo(X[2], y).lineTo(X[2] + c.hora + c.cant + c.producto + c.area + c.prior, y).strokeColor(LINEA).lineWidth(0.4).stroke()
      if (i > 0) doc.moveTo(X[11], y).lineTo(X[11] + c.madr, y).strokeColor(LINEA).lineWidth(0.4).stroke()
      y += h
    })
    // Rejilla: bordes de columna y línea inferior del grupo.
    for (const x of [...X, M + ancho]) doc.moveTo(x, y0).lineTo(x, y0 + altoGrupo).strokeColor(LINEA).lineWidth(0.4).stroke()
    doc.moveTo(M, y0 + altoGrupo).lineTo(M + ancho, y0 + altoGrupo).strokeColor(LINEA).lineWidth(0.4).stroke()
    doc.y = y0 + altoGrupo
    n += 1
  }
  // Líneas libres para anotar a mano, como en su hoja.
  const libres = Math.max(0, 8 - grupos.reduce((s, g) => s + g.lineas.length, 0))
  for (let i = 0; i < libres; i++) {
    if (doc.y + 15 > doc.page.height - M - 14) break
    const y = doc.y
    if ((n + i) % 2 === 1) doc.rect(M, y, ancho, 15).fillColor(ZEBRA).fill()
    for (const x of [...X, M + ancho]) doc.moveTo(x, y).lineTo(x, y + 15).strokeColor(LINEA).lineWidth(0.4).stroke()
    doc.moveTo(M, y + 15).lineTo(M + ancho, y + 15).strokeColor(LINEA).lineWidth(0.4).stroke()
    doc.y = y + 15
  }
  if (grupos.length === 0) {
    doc.moveDown(0.5)
    texto(doc, 'No hay pedidos agendados para este día.', M, doc.y, ancho, { size: 9, color: GRIS })
  }
}

export async function hojaAgendadosPdf(grupos: GrupoAgendado[], meta: { fecha: string; sede: string; cargaPor?: string }): Promise<Buffer> {
  const { doc, fin, ancho } = nuevoDoc()
  dibujarAgendados(doc, ancho, grupos, meta)
  pie(doc, meta.sede)
  doc.end()
  return fin
}

// ———————————————————————————————————— 3. resumen de producción del día ————

const REGLA_DE_PRODUCCION =
  'REGLA DE PRODUCCIÓN: pedidos que requieren producción de madrugada y tienen hora LISTO/SALIDA hasta las 8:00 a. m. inclusive son PRIORIDAD ALTA y deben atenderse primero. Después de las 8:00 a. m. y hasta las 12:00 p. m. = PRIORIDAD MEDIA. Después del mediodía o sin producción madrugada = NORMAL.'

export interface MetaProduccion {
  fecha: string
  sede: string
  pagoPendiente: number
  sinAsignar: number
}

function dibujarProduccion(doc: Doc, ancho: number, hoja: HojaProduccion, criticos: LineaCritica[], meta: MetaProduccion) {
  doc.y = M
  titulo(doc, ancho, 'BAKE BROTHERS | RESUMEN DE PRODUCCIÓN DEL DÍA')
  franja(doc, ancho, fechaDeHoja(meta.fecha), { size: 8.5 })
  franja(doc, ancho, 'Empanadería madrugada + Cocina / Compras • Revisar primero PEDIDOS CON HORA CRÍTICA', { fondo: '#f3f3f3', color: GRIS, size: 7.5 })

  // 1. Pedidos con hora crítica: producir primero.
  doc.y += 6
  const yBarra = doc.y
  doc.rect(M, yBarra, ancho, 17).fillColor(DURAZNO).fill()
  // El triángulo de advertencia se dibuja (la fuente estándar no trae «⚠»).
  doc.polygon([M + 8, yBarra + 14], [M + 14, yBarra + 3], [M + 20, yBarra + 14]).fillColor(NARANJA).fill()
  texto(doc, '!', M + 12.6, yBarra + 5.5, 4, { size: 7, bold: true, color: '#ffffff', lineBreak: false })
  texto(doc, 'PEDIDOS CON HORA CRÍTICA – PRODUCIR PRIMERO', M + 26, yBarra + 4.5, ancho - 30, { size: 9, bold: true, color: NARANJA, lineBreak: false })
  doc.y = yBarra + 17
  const colCriticos: Columna[] = [
    { titulo: 'Hora límite', ancho: 70, alinear: 'center' },
    { titulo: 'Cliente', ancho: 150 },
    { titulo: 'Cantidad', ancho: 56, alinear: 'center' },
    { titulo: 'Área', ancho: 80, alinear: 'center' },
    { titulo: 'Tipo', ancho: 96, alinear: 'center' },
    { titulo: 'Prioridad', ancho: 64, alinear: 'center' },
    { titulo: 'Producto', ancho: ancho - 70 - 150 - 56 - 80 - 96 - 64 },
  ]
  tabla(
    doc,
    M,
    colCriticos,
    criticos.map((l) => [l.hora, l.cliente, String(l.cantidad), l.area, l.tipo, { t: l.prioridad, color: ROJO, bold: true }, l.producto]),
    { minFilas: 5 }
  )
  if (criticos.length === 0) texto(doc, 'No hay pedidos con hora crítica hoy.', M + 4, doc.y + 3, ancho, { size: 7.5, color: GRIS })

  // 2. Dos tablas lado a lado: empanadas por sabor (izquierda) y catering / otros (derecha).
  doc.y += 14
  if (doc.y > doc.page.height - M - 260) {
    doc.addPage()
    doc.y = M
  }
  const yTablas = doc.y
  const anchoIzq = 372
  const xDer = M + anchoIzq + 20
  const anchoDer = ancho - anchoIzq - 20

  texto(doc, 'RESUMEN EMPANADAS – PRODUCCIÓN TOTAL', M, yTablas, anchoIzq, { size: 8.5, bold: true, lineBreak: false })
  doc.y = yTablas + 13
  const colEmpanadas: Columna[] = [
    { titulo: 'Sabor', ancho: 96 },
    { titulo: 'MEDIANAS', ancho: 56, alinear: 'center' },
    { titulo: 'GRANDES', ancho: 56, alinear: 'center' },
    { titulo: 'MINI', ancho: 50, alinear: 'center' },
    { titulo: 'TOTAL', ancho: 50, alinear: 'center' },
    { titulo: 'Observación', ancho: anchoIzq - 96 - 56 - 56 - 50 - 50 },
  ]
  const t = hoja.empanadas.totales
  const filasEmp: Celda[][] = hoja.empanadas.filas.map((f) => [
    f.sabor.startsWith('VARIADA') ? { t: f.sabor, bold: true } : abreviaturaDeSabor(f.sabor),
    String(f.mediana),
    String(f.grande),
    String(f.mini),
    String(f.total),
    '',
  ])
  // Sin ninguna empanada igual se muestran los 10 sabores en cero, como su hoja.
  if (filasEmp.length === 0) for (const s of SABORES_MAYORISTA) filasEmp.push([s, '0', '0', '0', '0', ''])
  filasEmp.push(['TOTAL EMPANADAS', String(t.mediana), String(t.grande), String(t.mini), String(t.total), ''])
  tabla(doc, M, colEmpanadas, filasEmp, { filaFinal: true })
  const yFinIzq = doc.y

  // Derecha: catering y otros (todo lo que no es empanada), por área. Arranca a la altura de la tabla de la izquierda.
  doc.y = yTablas
  texto(doc, 'CATERING / OTROS – PREVISIÓN', xDer, yTablas, anchoDer, { size: 8.5, bold: true, lineBreak: false })
  doc.y = yTablas + 13
  const colOtros: Columna[] = [
    { titulo: 'Producto', ancho: anchoDer - 56 - 64 - 92 },
    { titulo: 'Cantidad', ancho: 56, alinear: 'center' },
    { titulo: 'Área', ancho: 64, alinear: 'center' },
    { titulo: 'Observación', ancho: 92 },
  ]
  const filasOtros: Celda[][] = []
  for (const a of hoja.porArea) {
    for (const l of a.lineas) {
      const nombre = l.sabor ? `${l.nombre} — ${l.sabor}` : l.tamano ? `${l.nombre} (${l.tamano})` : l.nombre
      const partes = l.vitrina > 0 && l.porPedido > 0 ? `${l.porPedido} por pedido + ${l.vitrina} vitrina` : l.vitrina > 0 ? 'vitrina' : ''
      filasOtros.push([nombre, String(l.total), nombreDeArea(a.area).toLowerCase(), partes])
    }
  }
  tabla(doc, xDer, colOtros, filasOtros, { minFilas: 6, size: 7.2 })
  doc.y = Math.max(doc.y, yFinIzq) + 8

  // 3. Regla de producción (pie de la hoja).
  const altoRegla = altoTexto(doc, REGLA_DE_PRODUCCION, ancho - 16, 7, true) + 14
  if (doc.y + altoRegla > doc.page.height - M - 14) {
    doc.addPage()
    doc.y = M
  }
  const yRegla = doc.y
  doc.rect(M, yRegla, ancho, altoRegla).fillColor(DURAZNO).fill()
  texto(doc, REGLA_DE_PRODUCCION, M + 8, yRegla + 7, ancho - 16, { size: 7, bold: true, align: 'center' })
  doc.y = yRegla + altoRegla

  const avisos: string[] = []
  if (meta.pagoPendiente > 0) avisos.push(`${meta.pagoPendiente} pedido(s) esperando pago no están en esta hoja.`)
  if (meta.sinAsignar > 0) avisos.push(`${meta.sinAsignar} pedido(s) sin sede no están en esta hoja.`)
  if (avisos.length > 0) {
    doc.y += 6
    texto(doc, avisos.join(' '), M, doc.y, ancho, { size: 7.5, color: GRIS })
  }
}

export async function hojaProduccionPdf(hoja: HojaProduccion, criticos: LineaCritica[], meta: MetaProduccion): Promise<Buffer> {
  const { doc, fin, ancho } = nuevoDoc()
  dibujarProduccion(doc, ancho, hoja, criticos, meta)
  pie(doc, meta.sede)
  doc.end()
  return fin
}

// ———————————————————————————————————————————— la hoja única del día ————

/**
 * LA hoja que se imprime: todas las órdenes del día en un solo PDF, en el orden de su Excel — pedidos mayoristas,
 * pedidos agendados (venta digital) y resumen de producción —, cada una empezando en su propia página. La hoja DATOS
 * del Excel es interna y no se imprime. No hay impresión por orden individual.
 */
export async function hojaDelDiaPdf(
  d: { mayoristas: FilaMayorista[]; agendados: GrupoAgendado[]; hoja: HojaProduccion; criticos: LineaCritica[] },
  meta: MetaHoja & { pagoPendiente: number; sinAsignar: number }
): Promise<Buffer> {
  const { doc, fin, ancho } = nuevoDoc()
  dibujarMayoristas(doc, ancho, d.mayoristas, meta)
  doc.addPage()
  dibujarAgendados(doc, ancho, d.agendados, meta)
  doc.addPage()
  dibujarProduccion(doc, ancho, d.hoja, d.criticos, meta)
  pie(doc, meta.sede)
  doc.end()
  return fin
}

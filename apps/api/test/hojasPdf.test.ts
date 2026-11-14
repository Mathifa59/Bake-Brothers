// Las tres hojas para imprimir (réplica de su Excel). Sin base de datos: se arman con datos de ejemplo. Con
// GUARDAR_HOJAS=<carpeta> los PDF se guardan ahí para revisarlos a ojo junto a la hoja del equipo.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  armarAgendados,
  armarFilasMayoristas,
  armarHojaProduccion,
  armarHorasCriticas,
  armarPlanDelDia,
  type BloqueMayorista,
  type LineaDemanda,
  type PedidoAgendado,
} from '@bakebrothers/domain'
import zlib from 'node:zlib'
import {
  TEXTO_CORTE_MAYORISTA,
  TEXTO_CORTE_PRINCIPAL,
  fechaDeHoja,
  hojaAgendadosPdf,
  hojaDelDiaPdf,
  hojaEmpaqueMayoristaPdf,
  hojaProduccionPdf,
  limpiarResponsable,
} from '../src/services/hojasPdf.js'

/**
 * El texto que de verdad quedó escrito en el PDF, página por página (pdfkit comprime cada página y escribe las
 * cadenas en hexadecimal): permite comprobar lo que el equipo ve impreso, no solo que el PDF exista.
 */
function textoPorPagina(pdf: Buffer): string[] {
  // latin1 mapea un byte a un carácter: los índices de la cadena son los del Buffer. El largo exacto de cada stream
  // sale de su /Length (el contenido comprimido cambia en cada corrida por la hora de impresión del pie).
  const crudo = pdf.toString('latin1')
  const paginas: string[] = []
  for (const m of crudo.matchAll(/\/Length (\d+)[^>]*>>\s*stream\r?\n/g)) {
    const inicio = (m.index ?? 0) + m[0].length
    let contenido: string
    try {
      contenido = zlib.inflateSync(pdf.subarray(inicio, inicio + Number(m[1]))).toString('latin1')
    } catch {
      continue // no es un contenido de página comprimido (fuente, imagen…)
    }
    if (!/\bTJ\b|\bTj\b/.test(contenido)) continue
    const lineas: string[] = []
    for (const tj of contenido.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
      lineas.push([...tj[1].matchAll(/<([0-9a-fA-F]+)>/g)].map((h) => Buffer.from(h[1], 'hex').toString('latin1')).join(''))
    }
    paginas.push(lineas.join('\n'))
  }
  return paginas
}

const FECHA = '2026-11-13'
const guardar = (nombre: string, pdf: Buffer) => {
  const dir = process.env.GUARDAR_HOJAS
  if (!dir) return
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, nombre), pdf)
}
const paginas = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length

// ——— datos de ejemplo (clientes inventados; la estructura es la de su hoja del 13 de noviembre)
const b = (cliente: string, hora: string | null, sabores: [string, number, number][], postres: BloqueMayorista['postres'] = []): BloqueMayorista => ({
  pedido: `BB-${cliente}`,
  cliente,
  hora,
  tamano: null,
  sabores: sabores.map(([sabor, mediana, grande]) => ({ sabor, mediana, grande, cantidad: mediana + grande })),
  totalEmpanadas: sabores.reduce((n, [, m, g]) => n + m + g, 0),
  postres,
  fueraDeCorte: false,
})
const bloques: BloqueMayorista[] = [
  b('TIENDA EJEMPLO A', '07:30', [['Carne', 0, 9], ['Jamón y Queso', 0, 9]]),
  b('JAVIER EJEMPLO', '07:30', ['Pollo', 'Carne', 'Jamón y Queso', 'Ají de Gallina', 'Lomo', 'Pollo con champiñón', 'Hawaiana', 'Cabanozzi', '3 Quesos', 'Carnívora'].map((s): [string, number, number] => [s, 0, ['Pollo', 'Carne', 'Jamón y Queso', 'Ají de Gallina'].includes(s) ? 4 : 8])),
  b('EST. EJEMPLO - CENTRO', '07:45', [['Pollo', 15, 0], ['Carne', 15, 0], ['Jamón y Queso', 10, 0], ['Lomo', 15, 0], ['Pollo con champiñón', 15, 0]]),
  b('CAFE EJEMPLO UNO', null, [['Carne', 0, 15]], [{ nombre: 'Crema volteada', tamano: null, cantidad: 1 }]),
  b('CLIENTE SOLO POSTRES', null, [], [{ nombre: 'Fresa', tamano: null, cantidad: 1 }, { nombre: 'Cremas', tamano: null, cantidad: 2 }, { nombre: 'Limón', tamano: null, cantidad: 2 }]),
  b('CARMEN EJEMPLO', null, [['Jamón y Queso', 0, 8], ['Ají de Gallina', 0, 8], ['Lomo', 0, 12], ['Pollo con champiñón', 0, 12], ['Cabanozzi', 0, 8], ['Carnívora', 0, 16]]),
  b('PORTA EJEMPLO (MIXTO)', '08:00', [['Carne', 5, 5], ['Jamón y Queso', 5, 5]]),
  b('JUAN EJEMPLO', null, [['Jamón y Queso', 6, 0], ['Ají de Gallina', 5, 0], ['Lomo', 10, 0], ['Pollo con champiñón', 8, 0], ['Hawaiana', 7, 0], ['Cabanozzi', 7, 0], ['3 Quesos', 7, 0], ['Carnívora', 10, 0]]),
]

const ped = (p: Partial<PedidoAgendado> & Pick<PedidoAgendado, 'cliente' | 'lineas'>): PedidoAgendado => ({
  pedido: `BB-${p.cliente}`,
  tipoEntrega: 'tienda',
  hora: null,
  estado: 'confirmed',
  metodoPago: null,
  direccion: null,
  observacion: null,
  ...p,
})
const agendados: PedidoAgendado[] = [
  ped({
    cliente: 'victor ejemplo',
    tipoEntrega: 'delivery',
    hora: '07:30',
    estado: 'delivered',
    direccion: 'country club',
    observacion: 'tiene que salir de tien 8am',
    lineas: [
      { cantidad: 25, producto: 'Petipan huevo con tocino (catering)', area: 'cocina' },
      { cantidad: 25, producto: 'Mini croissant con pollo (catering)', area: 'cocina' },
      { cantidad: 25, producto: 'Mini croissant mixto (catering)', area: 'cocina' },
      { cantidad: 25, producto: 'Mini pye de manzana (catering)', area: 'pasteleria' },
    ],
  }),
  ped({
    cliente: 'Jenny ejemplo',
    hora: '14:30',
    estado: 'delivered',
    metodoPago: 'contraentrega',
    direccion: 'Cedros',
    lineas: [
      { cantidad: 4, producto: 'Caja de Alfajores con manjar x 18 ud.', area: 'pasteleria' },
      { cantidad: 2, producto: 'Caja de Piononos x 16 ud.', area: 'pasteleria' },
    ],
  }),
  ped({
    cliente: 'Mirtha ejemplo',
    tipoEntrega: 'delivery',
    hora: '15:30',
    estado: 'out_for_delivery',
    direccion: 'Esteves 12 - Chorrillos',
    observacion: 'cancelado',
    lineas: [{ cantidad: 48, producto: 'Mini Empanada variada (catering)', area: 'empanaderia' }],
  }),
  ped({ cliente: 'Amy ejemplo', hora: '16:00', metodoPago: 'contraentrega', direccion: 'Santa Marina', lineas: [{ cantidad: 1, producto: 'Mini torta personalizada', area: 'pasteleria' }] }),
  // Para mostrar las tres prioridades:
  ped({ cliente: 'Rosa (ALTA)', hora: '07:30', metodoPago: 'yape', direccion: 'Cedros', lineas: [{ cantidad: 24, producto: 'Empanada de Carne', area: 'empanaderia', esEmpanada: true }] }),
  ped({ cliente: 'Sara (MEDIA)', hora: '10:00', metodoPago: 'yape', direccion: 'Cedros', estado: 'payment_pending', lineas: [{ cantidad: 12, producto: 'Empanada de Pollo (Mediana)', area: 'empanaderia', esEmpanada: true }] }),
]

const dem = (extra: Partial<LineaDemanda> & Pick<LineaDemanda, 'nombre' | 'cantidad'>): LineaDemanda => ({
  origen: 'producto',
  productId: extra.nombre,
  tamano: null,
  hora: '15:00',
  pedido: 'BB-9',
  cliente: 'Cliente',
  area: 'empanaderia',
  canal: 'whatsapp',
  esEmpanada: true,
  ...extra,
})
const demanda: LineaDemanda[] = [
  ...[
    ['Pollo', 50, 36], ['Carne', 40, 64], ['Jamón y Queso', 51, 51], ['Ají de Gallina', 5, 12], ['Lomo', 40, 36],
    ['Pollo con champiñón', 38, 48], ['Hawaiana', 7, 8], ['Cabanozzi', 7, 16], ['3 Quesos', 7, 8], ['Carnívora', 10, 24],
  ].flatMap(([s, m, g]) => [
    dem({ nombre: `Empanada de ${s}`, tamano: 'Mediana', cantidad: m as number, canal: 'mayorista', hora: '07:30' }),
    dem({ nombre: `Empanada de ${s}`, cantidad: g as number, canal: 'mayorista', hora: '07:30' }),
  ]),
  dem({ origen: 'catering', cateringItemId: 'mini-var', productId: undefined, nombre: 'Mini empanadas (todos los sabores)', cantidad: 48, esEmpanada: false, hora: '15:30', cliente: 'Mirtha ejemplo' }),
  dem({ origen: 'catering', cateringItemId: 'croi-mix', productId: undefined, nombre: 'Mini croissant mixto (catering)', cantidad: 25, esEmpanada: false, area: 'cocina', hora: '07:30', cliente: 'victor ejemplo' }),
  dem({ origen: 'catering', cateringItemId: 'croi-pollo', productId: undefined, nombre: 'Mini croissant con pollo (catering)', cantidad: 25, esEmpanada: false, area: 'cocina', hora: '07:30', cliente: 'victor ejemplo' }),
  dem({ nombre: 'Empanada de Carne', cantidad: 24, hora: '07:30', cliente: 'Rosa (ALTA)', pedido: 'BB-10' }),
]
const plan = armarPlanDelDia(FECHA, demanda, [])
const hoja = armarHojaProduccion(plan)
const criticos = armarHorasCriticas(demanda)

describe('hojas PDF (réplica de su Excel)', () => {
  it('fecha como en su hoja: «viernes, noviembre 13, 2026»', () => {
    expect(fechaDeHoja(FECHA)).toBe('viernes, noviembre 13, 2026')
  })

  it('los responsables se limpian: una línea, sin controles, máximo 40 caracteres', () => {
    expect(limpiarResponsable('  Luciana \n\n Pérez ')).toBe('Luciana Pérez')
    expect(limpiarResponsable('x'.repeat(100))).toHaveLength(40)
    expect(limpiarResponsable(undefined)).toBe('')
  })

  it('pedidos mayoristas: PDF válido con responsables, una fila por cliente y tamaño', async () => {
    const filas = armarFilasMayoristas(bloques)
    // 8 clientes; «PORTA EJEMPLO (MIXTO)» ocupa 2 filas (GR y MED) → 9 filas.
    expect(filas).toHaveLength(9)
    const pdf = await hojaEmpaqueMayoristaPdf(filas, { fecha: FECHA, sede: 'Cedros', cargaPor: 'Luciana', empaquePor: 'Sheyla' })
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(paginas(pdf)).toBeGreaterThanOrEqual(1)
    guardar('1-pedidos-mayoristas.pdf', pdf)
  })

  it('pedidos agendados: PDF válido, un cliente con varios productos en filas agrupadas', async () => {
    const grupos = armarAgendados(agendados)
    expect(grupos.find((g) => g.cliente === 'victor ejemplo')?.lineas).toHaveLength(4)
    const pdf = await hojaAgendadosPdf(grupos, { fecha: FECHA, sede: 'Cedros', cargaPor: 'Ana - Maria' })
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    guardar('2-pedidos-agendados.pdf', pdf)
  })

  it('resumen de producción: las horas críticas primero, empanadas por sabor con VARIADA y catering/otros', async () => {
    // Solo la empanada de las 7:30 de «Rosa» es crítica: los mayoristas salen por su hoja y lo demás no es ALTA.
    expect(criticos.map((c) => c.cliente)).toEqual(['Rosa (ALTA)'])
    expect(hoja.empanadas.filas.at(-1)?.sabor).toBe('VARIADA (CATERING)')
    const pdf = await hojaProduccionPdf(hoja, criticos, { fecha: FECHA, sede: 'Cedros', pagoPendiente: 1, sinAsignar: 0 })
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    guardar('3-resumen-produccion.pdf', pdf)
  })

  it('sin datos: las tres hojas se generan igual (vacías, con sus líneas para anotar)', async () => {
    const vacio = armarHojaProduccion([])
    const a = await hojaEmpaqueMayoristaPdf([], { fecha: FECHA, sede: 'Cedros' })
    const b2 = await hojaAgendadosPdf([], { fecha: FECHA, sede: 'Cedros' })
    const c = await hojaProduccionPdf(vacio, [], { fecha: FECHA, sede: 'Cedros', pagoPendiente: 0, sinAsignar: 0 })
    for (const pdf of [a, b2, c]) expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    guardar('vacia-mayoristas.pdf', a)
    guardar('vacia-agendados.pdf', b2)
    guardar('vacia-resumen.pdf', c)
  })

  it('el corte que dicen las hojas es 11:00 p. m. (nunca 8:00 p. m.): constantes y texto realmente impreso', async () => {
    expect(TEXTO_CORTE_MAYORISTA).toBe('CORTE MAYORISTA: 11:00 p. m.')
    expect(TEXTO_CORTE_PRINCIPAL).toBe('CORTE PRINCIPAL: 11:00 p. m.')
    const agendadosPdf = textoPorPagina(await hojaAgendadosPdf(armarAgendados(agendados), { fecha: FECHA, sede: 'Cedros' })).join('\n')
    expect(agendadosPdf).toContain('CORTE PRINCIPAL: 11:00 p. m.')
    expect(agendadosPdf).not.toMatch(/CORTE[^\n]*8:00 p\. m\./)
    const mayoristasPdf = textoPorPagina(await hojaEmpaqueMayoristaPdf(armarFilasMayoristas(bloques), { fecha: FECHA, sede: 'Cedros' })).join('\n')
    expect(mayoristasPdf).toContain('CORTE MAYORISTA: 11:00 p. m.')
  })

  it('la hoja del día: UNA sola hoja con mayoristas, agendados y resumen, en el orden de su Excel', async () => {
    const pdf = await hojaDelDiaPdf(
      { mayoristas: armarFilasMayoristas(bloques), agendados: armarAgendados(agendados), hoja, criticos },
      { fecha: FECHA, sede: 'Cedros', cargaPor: 'Luciana', empaquePor: 'Sheyla', pagoPendiente: 0, sinAsignar: 0 }
    )
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(paginas(pdf)).toBeGreaterThanOrEqual(3)
    const texto = textoPorPagina(pdf).join('\n')
    const a = texto.indexOf('PEDIDOS MAYORISTAS')
    const b = texto.indexOf('PEDIDOS AGENDADOS')
    const c = texto.indexOf('RESUMEN DE PRODUCCIÓN DEL DÍA')
    expect(a).toBeGreaterThanOrEqual(0)
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
    expect(texto).toContain('CORTE MAYORISTA: 11:00 p. m.')
    expect(texto).toContain('CORTE PRINCIPAL: 11:00 p. m.')
    expect(texto).toContain('RESPONSABLE CARGA: Luciana')
    expect(texto).toContain('RESPONSABLE EMPAQUE: Sheyla')
    // La hoja DATOS del Excel es interna: no se imprime.
    expect(texto).not.toContain('DATOS')
    guardar('hoja-del-dia.pdf', pdf)
  })

  it('la hoja del día sin ningún pedido también sale completa (las tres hojas, vacías)', async () => {
    const pdf = await hojaDelDiaPdf(
      { mayoristas: [], agendados: [], hoja: armarHojaProduccion([]), criticos: [] },
      { fecha: FECHA, sede: 'Cedros', pagoPendiente: 0, sinAsignar: 0 }
    )
    const texto = textoPorPagina(pdf).join('\n')
    expect(paginas(pdf)).toBeGreaterThanOrEqual(3)
    for (const t of ['PEDIDOS MAYORISTAS', 'PEDIDOS AGENDADOS', 'RESUMEN DE PRODUCCIÓN DEL DÍA']) expect(texto).toContain(t)
  })

  it('con muchos pedidos sigue en más páginas sin romperse', async () => {
    const muchos = Array.from({ length: 70 }, (_, i) => bloques[i % bloques.length]).map((x, i) => ({ ...x, pedido: `BB-${i}`, cliente: `${x.cliente} ${i}` }))
    const pdf = await hojaEmpaqueMayoristaPdf(armarFilasMayoristas(muchos), { fecha: FECHA, sede: 'Cedros' })
    expect(paginas(pdf)).toBeGreaterThan(1)
    const pdfA = await hojaAgendadosPdf(armarAgendados(Array.from({ length: 60 }, (_, i) => ped({ pedido: `BB-${i}`, cliente: `Cliente ${i}`, hora: '10:00', lineas: [{ cantidad: 1, producto: 'Producto largo de ejemplo para probar el salto de línea en la celda', area: 'cocina' }] }))), { fecha: FECHA, sede: 'Cedros' })
    expect(paginas(pdfA)).toBeGreaterThan(1)
  })
})

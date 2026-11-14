/**
 * Lo que imprimen las hojas (réplica de su Excel «Plantilla maestra de pedidos diarios»): lógica pura, para que la
 * pantalla, el papel y las pruebas digan lo mismo. Las reglas salen de las FÓRMULAS reales de su Excel:
 *
 *   Producción madrugada = SÍ si el producto es EMPANADA o MINI EMPANADA (familia), si no NO.
 *   Prioridad            = NORMAL si no hay producción de madrugada; si la hay: ALTA con hora listo/salida hasta las
 *                          8:00 a. m. INCLUSIVE, MEDIA después de las 8:00 y hasta las 12:00 m. (inclusive), NORMAL después.
 *
 * Tres hojas: pedidos mayoristas (empaque), pedidos agendados (venta digital) y resumen de producción del día.
 * La hoja DATOS del Excel es interna y no se imprime.
 */
import { minutosDelDia } from './horaPedido.js'
import { estadoEquipo } from './estadosEquipo.js'
import { nombreDeArea, posicionSabor, saborDeEmpanada, type AreaProduccion, type BloqueMayorista, type LineaDemanda } from './planProduccion.js'

// ———————————————————————————————————————————————————————————— prioridad ————

export type PrioridadProduccion = 'ALTA' | 'MEDIA' | 'NORMAL'
export const LIMITE_PRIORIDAD_ALTA_MIN = 8 * 60 // 8:00 a. m., inclusive
export const LIMITE_PRIORIDAD_MEDIA_MIN = 12 * 60 // 12:00 m., inclusive

export const esMiniEmpanada = (nombre: string) => /mini\s+empanada/i.test(nombre)

/** ¿Lleva producción de madrugada? Empanadas y mini empanadas (como la fórmula de su Excel). */
export function produccionMadrugada(linea: { esEmpanada?: boolean | null; nombre: string }): boolean {
  return linea.esEmpanada === true || esMiniEmpanada(linea.nombre)
}

/** ALTA / MEDIA / NORMAL según la hora listo/salida y si lleva producción de madrugada. Sin hora entendible → NORMAL. */
export function prioridadDeProduccion(hora: string | null | undefined, madrugada: boolean): PrioridadProduccion {
  if (!madrugada) return 'NORMAL'
  const m = minutosDelDia(hora)
  if (m === null) return 'NORMAL'
  if (m <= LIMITE_PRIORIDAD_ALTA_MIN) return 'ALTA'
  if (m <= LIMITE_PRIORIDAD_MEDIA_MIN) return 'MEDIA'
  return 'NORMAL'
}

/** «7:30 a.m.» / «2:30 p.m.» — el formato de la hoja. Texto que no se entiende se muestra tal cual; vacío → ''. */
export function horaDeHoja(horario: string | null | undefined): string {
  if (!horario?.trim()) return ''
  const m = minutosDelDia(horario)
  if (m === null) return horario.trim()
  const h24 = Math.floor(m / 60) % 24
  const min = m % 60
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h}:${String(min).padStart(2, '0')} ${h24 < 12 ? 'a.m.' : 'p.m.'}`
}

// ———————————————————————————————————————————————————— pedidos mayoristas ————

/** Las diez columnas de sabores de la hoja, en su orden y con sus abreviaturas. */
export const SABORES_MAYORISTA = ['POLLO', 'CARNE', 'JQ', 'AJI', 'LOMO', 'CHAMP', 'HAW', 'CABAN', '3Q', 'CARNIV'] as const

export interface FilaMayorista {
  cliente: string
  hora: string
  /** GR / MED. Un cliente que pide de las dos ocupa dos filas (una por tamaño). Vacío = solo postres. */
  tamano: 'GR' | 'MED' | ''
  /** Cantidad por cada una de las 10 columnas de sabor (mismo orden que SABORES_MAYORISTA). */
  cantidades: number[]
  /** Sabores que no están entre las 10 columnas: cuentan en el total y se anotan en la observación. */
  otrosSabores: { sabor: string; cantidad: number }[]
  total: number
  /** «Observación (postres o empaque)»: los postres van aquí como texto y NO suman al total de empanadas. */
  observacion: string
}

const textoPostres = (b: BloqueMayorista) =>
  b.postres.map((p) => `${p.cantidad} ${p.nombre}${p.tamano ? ` ${p.tamano}` : ''}`).join(', ')

/** Una fila por cliente y tamaño; los postres, como texto en la observación de la primera fila del cliente. */
export function armarFilasMayoristas(bloques: readonly BloqueMayorista[]): FilaMayorista[] {
  const filas: FilaMayorista[] = []
  for (const b of bloques) {
    const nuevaFila = (tamano: FilaMayorista['tamano']): FilaMayorista => ({
      cliente: b.cliente,
      hora: horaDeHoja(b.hora),
      tamano,
      cantidades: SABORES_MAYORISTA.map(() => 0),
      otrosSabores: [],
      total: 0,
      observacion: '',
    })
    const porTamano: Record<'GR' | 'MED', FilaMayorista> = { GR: nuevaFila('GR'), MED: nuevaFila('MED') }
    for (const s of b.sabores) {
      const pos = posicionSabor(s.sabor)
      for (const [t, q] of [['MED', s.mediana], ['GR', s.grande]] as const) {
        if (q <= 0) continue
        const f = porTamano[t]
        if (pos < SABORES_MAYORISTA.length) f.cantidades[pos] += q
        else f.otrosSabores.push({ sabor: s.sabor, cantidad: q })
        f.total += q
      }
    }
    // Primero GR y luego MED, como en la hoja (un cliente «mixto» ocupa las dos filas).
    const conEmpanadas = [porTamano.GR, porTamano.MED].filter((f) => f.total > 0)
    const resultado = conEmpanadas.length > 0 ? conEmpanadas : [nuevaFila('')]
    const notas = [textoPostres(b), ...resultado[0].otrosSabores.map((o) => `${o.cantidad} ${o.sabor}`), b.fueraDeCorte ? 'FUERA DE CORTE' : '']
    resultado[0].observacion = notas.filter(Boolean).join(' · ')
    // Los «otros sabores» de la segunda fila (si la hay) también se anotan.
    for (const f of resultado.slice(1)) f.observacion = f.otrosSabores.map((o) => `${o.cantidad} ${o.sabor}`).join(' · ')
    filas.push(...resultado)
  }
  return filas
}

// ————————————————————————————————————————— pedidos agendados (venta digital) ————

export interface PedidoAgendado {
  pedido: string
  cliente: string
  /** `orders.tipo_entrega`: 'delivery' o 'tienda'. */
  tipoEntrega: string
  /** `orders.horario_entrega` (texto libre). */
  hora: string | null
  /** Estado interno del pedido (se muestra con el vocabulario del equipo). */
  estado: string
  metodoPago: string | null
  /** Dirección y distrito (delivery) o el local de recojo. */
  direccion: string | null
  observacion: string | null
  lineas: { cantidad: number; producto: string; area: AreaProduccion | null; esEmpanada?: boolean | null }[]
}

export interface LineaAgendada {
  hora: string
  cantidad: number
  producto: string
  area: string
  prioridad: PrioridadProduccion
  madrugada: boolean
}

export interface GrupoAgendado {
  pedido: string
  cliente: string
  modalidad: 'DELIVERY' | 'RECOJO TIENDA'
  estado: string
  medioPago: string
  direccion: string
  observacion: string
  lineas: LineaAgendada[]
}

/** Vocabulario de la hoja para el medio de pago (Yape, Link Izipay, Trx., Canceló en tienda…). */
export function medioPagoDeHoja(metodo: string | null | undefined): string {
  switch (metodo) {
    case 'yape':
      return 'YAPE'
    case 'plin':
      return 'PLIN'
    case 'transferencia':
      return 'TRANSFERENCIA'
    case 'tarjeta':
      return 'LINK IZIPAY'
    case 'contraentrega':
      return 'CANCELÓ EN TIENDA'
    default:
      return ''
  }
}

/**
 * Un cliente con varios productos ocupa una fila por producto, agrupadas bajo su nombre. Orden: por la primera hora del
 * pedido (los sin hora, al final) y luego por cliente.
 */
export function armarAgendados(pedidos: readonly PedidoAgendado[]): GrupoAgendado[] {
  const grupos = pedidos.map((p): GrupoAgendado => ({
    pedido: p.pedido,
    cliente: p.cliente,
    modalidad: p.tipoEntrega === 'delivery' ? 'DELIVERY' : 'RECOJO TIENDA',
    estado: estadoEquipo(p.estado).toUpperCase(),
    medioPago: medioPagoDeHoja(p.metodoPago),
    direccion: p.direccion ?? '',
    observacion: p.observacion ?? '',
    lineas: p.lineas.map((l) => {
      const madrugada = produccionMadrugada({ esEmpanada: l.esEmpanada, nombre: l.producto })
      return {
        hora: horaDeHoja(p.hora),
        cantidad: l.cantidad,
        producto: l.producto,
        area: l.area ? nombreDeArea(l.area).toLowerCase() : '',
        prioridad: prioridadDeProduccion(p.hora, madrugada),
        madrugada,
      }
    }),
  }))
  const minutos = (g: GrupoAgendado, pedidos: readonly PedidoAgendado[]) =>
    minutosDelDia(pedidos.find((p) => p.pedido === g.pedido)?.hora) ?? Number.MAX_SAFE_INTEGER
  return grupos
    .filter((g) => g.lineas.length > 0)
    .sort((a, b) => minutos(a, pedidos) - minutos(b, pedidos) || a.cliente.localeCompare(b.cliente, 'es'))
}

// ——————————————————————————————————————— resumen: pedidos con hora crítica ————

export interface LineaCritica {
  hora: string
  cliente: string
  cantidad: number
  area: string
  tipo: 'EMPANADA' | 'MINI EMPANADA'
  prioridad: 'ALTA'
  producto: string
}

/**
 * «Pedidos con hora crítica: producir primero» = las líneas de prioridad ALTA (empanadas con hora listo/salida hasta las
 * 8:00 a. m.). Igual que su Excel, solo cuenta la venta agendada y Rappi: los mayoristas salen por su propia hoja de
 * empaque (despacho 7:30–8:00) y no se repiten aquí. Ordenadas por hora y luego por cliente.
 */
export function armarHorasCriticas(demanda: readonly LineaDemanda[]): LineaCritica[] {
  const filas: (LineaCritica & { minutos: number })[] = []
  for (const l of demanda) {
    if (l.canal === 'mayorista' || l.cantidad <= 0) continue
    const madrugada = produccionMadrugada({ esEmpanada: l.esEmpanada, nombre: l.nombre })
    if (prioridadDeProduccion(l.hora, madrugada) !== 'ALTA') continue
    filas.push({
      hora: horaDeHoja(l.hora),
      cliente: l.cliente ?? '',
      cantidad: l.cantidad,
      area: l.area ? nombreDeArea(l.area).toLowerCase() : '',
      tipo: esMiniEmpanada(l.nombre) ? 'MINI EMPANADA' : 'EMPANADA',
      prioridad: 'ALTA',
      producto: l.sabor ? `${l.nombre} — ${l.sabor}` : l.tamano ? `${l.nombre} (${l.tamano})` : l.nombre,
      minutos: minutosDelDia(l.hora) ?? 0,
    })
  }
  return filas
    .sort((a, b) => a.minutos - b.minutos || a.cliente.localeCompare(b.cliente, 'es') || a.producto.localeCompare(b.producto, 'es'))
    .map(({ minutos: _m, ...f }) => f)
}

/** Abreviatura de la hoja para un sabor («Pollo» → POLLO, «Jamón y Queso» → JQ); si no está entre las 10, el nombre en mayúsculas. */
export function abreviaturaDeSabor(sabor: string): string {
  const pos = posicionSabor(saborDeEmpanada(sabor))
  return pos < SABORES_MAYORISTA.length ? SABORES_MAYORISTA[pos] : sabor.toUpperCase()
}

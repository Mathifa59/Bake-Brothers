import { saleAntesDeLas8 } from './horaPedido.js'

/**
 * Plan de producción del día: lo que se produce POR PEDIDO (órdenes de mayoristas, encargos, Rappi, catering y
 * pedidos de tienda) más lo que se produce PARA VITRINA (plan fijo diario por sede y producto). Lógica pura:
 * la API junta los datos (pedidos del día, plan de vitrina, lo ya producido) y esto los suma. Las hojas para
 * imprimir salen de aquí también, para que la pantalla y el papel nunca digan cosas distintas.
 */
export type AreaProduccion = 'pasteleria' | 'empanaderia' | 'cocina' | 'empaque'
export type ModoProduccion = 'por_pedido' | 'vitrina' | 'ambos' | 'no_produce'

export const AREAS_PRODUCCION: readonly { id: AreaProduccion; nombre: string }[] = [
  { id: 'pasteleria', nombre: 'Pastelería' },
  { id: 'empanaderia', nombre: 'Empanadería' },
  { id: 'cocina', nombre: 'Cocina' },
  { id: 'empaque', nombre: 'Empaque' },
]
export const nombreDeArea = (a: AreaProduccion | null | undefined): string =>
  AREAS_PRODUCCION.find((x) => x.id === a)?.nombre ?? 'Sin área'

/**
 * Pedidos que cuentan para el plan del día. Un `payment_pending` todavía no se produce (hay que cobrarlo antes) y
 * un `draft`/`cancelled` no existe para producción. `delivered` SÍ cuenta: lo despachado hoy se produjo hoy, y el
 * plan del día no debe encogerse a media jornada.
 */
export const ESTADOS_EN_PLAN: readonly string[] = ['confirmed', 'paid', 'in_production', 'out_for_delivery', 'delivered']

/** Una línea de pedido ya resuelta por la API (los combos de composición fija llegan expandidos a sus productos). */
export interface LineaDemanda {
  origen: 'producto' | 'catering'
  productId?: string | null
  cateringItemId?: string | null
  nombre: string
  /** Etiqueta del tamaño; null = sin tamaño (en una empanada, la «grande»). */
  tamano: string | null
  /** Solo la mini empanada de catering: el sabor. */
  sabor?: string | null
  cantidad: number
  /** `orders.horario_entrega` del pedido, para saber qué sale antes de las 8:00 a. m. */
  hora: string | null
  pedido: string
  cliente?: string | null
  area: AreaProduccion | null
  modo?: ModoProduccion | null
  esEmpanada?: boolean
}

/** Una fila del plan fijo de vitrina de la sede. */
export interface LineaVitrina {
  productId: string
  nombre: string
  tamano: string | null
  cantidad: number
  /** null = igual que los demás días; 0 = no se produce el domingo. */
  cantidadDomingo: number | null
  area: AreaProduccion | null
  esEmpanada?: boolean
}

export interface ProducidoDia {
  productId: string
  tamano: string | null
  cantidadProducida: number
}

export interface LineaPlan {
  clave: string
  origen: 'producto' | 'catering'
  productId: string | null
  cateringItemId: string | null
  nombre: string
  tamano: string | null
  sabor: string | null
  area: AreaProduccion | null
  esEmpanada: boolean
  porPedido: number
  vitrina: number
  total: number
  /** Unidades POR PEDIDO que salen antes de las 8:00 a. m. */
  antesDe8: number
  /** Lo que el equipo marcó como producido (null = todavía no). */
  producida: number | null
  pedidos: string[]
}

export const esDomingoISO = (iso: string): boolean => new Date(`${iso}T12:00:00Z`).getUTCDay() === 0

const claveProducto = (productId: string, tamano: string | null) => `p:${productId}|${tamano ?? ''}`
const claveCatering = (itemId: string, sabor: string | null) => `c:${itemId}|${(sabor ?? '').toLowerCase()}`

export function armarPlanDelDia(
  fechaISO: string,
  demanda: readonly LineaDemanda[],
  vitrina: readonly LineaVitrina[],
  producidos: readonly ProducidoDia[] = []
): LineaPlan[] {
  const filas = new Map<string, LineaPlan>()
  const obtener = (clave: string, base: Omit<LineaPlan, 'clave' | 'porPedido' | 'vitrina' | 'total' | 'antesDe8' | 'producida' | 'pedidos'>) => {
    let f = filas.get(clave)
    if (!f) {
      f = { clave, ...base, porPedido: 0, vitrina: 0, total: 0, antesDe8: 0, producida: null, pedidos: [] }
      filas.set(clave, f)
    }
    return f
  }

  for (const l of demanda) {
    if (l.modo === 'no_produce' || l.cantidad <= 0) continue
    const esProducto = l.origen === 'producto' && l.productId
    const esCatering = l.origen === 'catering' && l.cateringItemId
    if (!esProducto && !esCatering) continue
    const clave = esProducto ? claveProducto(l.productId!, l.tamano) : claveCatering(l.cateringItemId!, l.sabor ?? null)
    const f = obtener(clave, {
      origen: l.origen,
      productId: esProducto ? l.productId! : null,
      cateringItemId: esCatering ? l.cateringItemId! : null,
      nombre: l.nombre,
      tamano: l.tamano,
      sabor: l.sabor ?? null,
      area: l.area,
      esEmpanada: l.esEmpanada ?? false,
    })
    f.porPedido += l.cantidad
    if (saleAntesDeLas8(l.hora)) f.antesDe8 += l.cantidad
    if (!f.pedidos.includes(l.pedido)) f.pedidos.push(l.pedido)
  }

  const domingo = esDomingoISO(fechaISO)
  for (const v of vitrina) {
    const cantidad = domingo && v.cantidadDomingo !== null ? v.cantidadDomingo : v.cantidad
    if (cantidad <= 0) continue
    const f = obtener(claveProducto(v.productId, v.tamano), {
      origen: 'producto',
      productId: v.productId,
      cateringItemId: null,
      nombre: v.nombre,
      tamano: v.tamano,
      sabor: null,
      area: v.area,
      esEmpanada: v.esEmpanada ?? false,
    })
    f.vitrina += cantidad
  }

  for (const p of producidos) {
    const f = filas.get(claveProducto(p.productId, p.tamano))
    if (f) f.producida = p.cantidadProducida
  }

  const orden = new Map(AREAS_PRODUCCION.map((a, i) => [a.id as string, i]))
  const lineas = [...filas.values()].map((f) => ({ ...f, total: f.porPedido + f.vitrina, pedidos: f.pedidos.sort() }))
  return lineas.sort(
    (a, b) =>
      (orden.get(a.area ?? '') ?? 99) - (orden.get(b.area ?? '') ?? 99) ||
      a.nombre.localeCompare(b.nombre, 'es') ||
      (a.tamano ?? '').localeCompare(b.tamano ?? '', 'es') ||
      (a.sabor ?? '').localeCompare(b.sabor ?? '', 'es')
  )
}

// ————————————————————————————————————————————————————— hoja de producción ————

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** «Empanada de Pollo» → «Pollo»; «Empanada 3 Quesos» → «3 Quesos». */
export const saborDeEmpanada = (nombre: string): string => nombre.replace(/^empanadas?\s+(de\s+)?/i, '').trim()

/**
 * Orden en que el equipo nombra los sabores (el de las hojas de papel). Lo que no está en la lista va al final,
 * alfabético. «Cabanozzi/cabanossi» y «3 quesos/tres quesos» son el mismo sabor.
 */
const ORDEN_SABORES = [
  'pollo',
  'carne',
  'jamon y queso',
  'aji de gallina',
  'lomo',
  'pollo con champinon',
  'hawaiana',
  'cabanozzi',
  '3 quesos',
  'carnivora',
]
const normalizarSabor = (s: string) =>
  sinTildes(s).replace(/cabanos+i/, 'cabanozzi').replace(/^tres quesos$/, '3 quesos')

export function posicionSabor(sabor: string): number {
  const i = ORDEN_SABORES.indexOf(normalizarSabor(sabor))
  return i === -1 ? ORDEN_SABORES.length : i
}
const compararSabores = (a: string, b: string) => posicionSabor(a) - posicionSabor(b) || a.localeCompare(b, 'es')

export interface FilaEmpanada {
  sabor: string
  mediana: number
  grande: number
  mini: number
  total: number
}

export interface LineaAntesDe8 {
  nombre: string
  tamano: string | null
  sabor: string | null
  cantidad: number
  pedidos: string[]
}

export interface HojaProduccion {
  /** Lo que sale antes de las 8:00 a. m. (por pedido), primero. */
  antesDe8: LineaAntesDe8[]
  /** Empanadas por sabor: medianas, grandes, mini y total. */
  empanadas: { filas: FilaEmpanada[]; totales: Omit<FilaEmpanada, 'sabor'> }
  /** Catering y todo lo demás, por área. */
  porArea: { area: AreaProduccion | null; nombre: string; lineas: LineaPlan[] }[]
}

export function armarHojaProduccion(plan: readonly LineaPlan[]): HojaProduccion {
  // 1. Antes de las 8:00 a. m. — solo la parte por pedido que sale temprano.
  const temprano = new Map<string, LineaAntesDe8>()
  for (const l of plan) {
    if (l.antesDe8 <= 0) continue
    const clave = `${l.nombre}|${l.tamano ?? ''}|${l.sabor ?? ''}`
    const f = temprano.get(clave) ?? { nombre: l.nombre, tamano: l.tamano, sabor: l.sabor, cantidad: 0, pedidos: [] }
    f.cantidad += l.antesDe8
    f.pedidos = [...new Set([...f.pedidos, ...l.pedidos])].sort()
    temprano.set(clave, f)
  }

  // 2. Empanadas por sabor. Grande = la empanada sin tamaño (o «Grande»); mediana = tamaño «Mediana»; mini = el
  // ítem de catering «Mini empanadas», por el sabor de la línea (sin sabor → «Sin sabor indicado»).
  const porSabor = new Map<string, FilaEmpanada>()
  const fila = (sabor: string) => {
    const k = normalizarSabor(sabor)
    let f = porSabor.get(k)
    if (!f) {
      f = { sabor, mediana: 0, grande: 0, mini: 0, total: 0 }
      porSabor.set(k, f)
    }
    return f
  }
  const esMini = (l: LineaPlan) => l.origen === 'catering' && /mini\s+empanada/i.test(l.nombre)
  for (const l of plan) {
    if (l.esEmpanada && l.origen === 'producto') {
      const f = fila(saborDeEmpanada(l.nombre))
      if (sinTildes(l.tamano ?? '') === 'mediana') f.mediana += l.total
      else f.grande += l.total
    } else if (esMini(l)) {
      fila(l.sabor?.trim() || 'Sin sabor indicado').mini += l.total
    }
  }
  const filas = [...porSabor.values()]
    .map((f) => ({ ...f, total: f.mediana + f.grande + f.mini }))
    .sort((a, b) => compararSabores(a.sabor, b.sabor))
  const totales = filas.reduce(
    (t, f) => ({ mediana: t.mediana + f.mediana, grande: t.grande + f.grande, mini: t.mini + f.mini, total: t.total + f.total }),
    { mediana: 0, grande: 0, mini: 0, total: 0 }
  )

  // 3. Catering y otros por área (todo lo que no es empanada ni la mini de catering).
  const otros = plan.filter((l) => !(l.esEmpanada && l.origen === 'producto') && !esMini(l))
  const areas = new Map<string, LineaPlan[]>()
  for (const l of otros) areas.set(l.area ?? '', [...(areas.get(l.area ?? '') ?? []), l])
  const porArea = [...AREAS_PRODUCCION.map((a) => a.id as string), '']
    .filter((a) => areas.has(a))
    .map((a) => ({ area: (a || null) as AreaProduccion | null, nombre: nombreDeArea((a || null) as AreaProduccion | null), lineas: areas.get(a)! }))

  return {
    antesDe8: [...temprano.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || (a.tamano ?? '').localeCompare(b.tamano ?? '', 'es')),
    empanadas: { filas, totales },
    porArea,
  }
}

// ——————————————————————————————————————————— hoja de empaque mayorista ————

export interface LineaOrdenMayorista {
  nombre: string
  tamano: string | null
  cantidad: number
  esEmpanada: boolean
}

export interface OrdenMayorista {
  pedido: string
  cliente: string
  hora: string | null
  fueraDeCorte?: boolean
  lineas: readonly LineaOrdenMayorista[]
}

export interface BloqueMayorista {
  pedido: string
  cliente: string
  hora: string | null
  /** «Mediana», «Grande» o «Mixto» si el cliente pidió de las dos. null si no pidió empanadas. */
  tamano: 'Mediana' | 'Grande' | 'Mixto' | null
  /** Por sabor: el total y cuántas son medianas y cuántas grandes (para empacar a un cliente «Mixto»). */
  sabores: { sabor: string; cantidad: number; mediana: number; grande: number }[]
  totalEmpanadas: number
  postres: { nombre: string; tamano: string | null; cantidad: number }[]
  fueraDeCorte: boolean
}

/** Un bloque por cliente, ordenados por hora de despacho (los sin hora, al final) y luego por nombre. */
export function armarEmpaqueMayorista(
  ordenes: readonly OrdenMayorista[],
  minutosDeHora: (h: string | null) => number | null
): BloqueMayorista[] {
  const bloques = ordenes.map((o): BloqueMayorista => {
    const sabores = new Map<string, { mediana: number; grande: number }>()
    const tamanos = new Set<'Mediana' | 'Grande'>()
    const postres = new Map<string, { nombre: string; tamano: string | null; cantidad: number }>()
    for (const l of o.lineas) {
      if (l.esEmpanada) {
        const sabor = saborDeEmpanada(l.nombre)
        const t = sinTildes(l.tamano ?? '') === 'mediana' ? 'Mediana' : 'Grande'
        const previo = sabores.get(sabor) ?? { mediana: 0, grande: 0 }
        sabores.set(sabor, t === 'Mediana' ? { ...previo, mediana: previo.mediana + l.cantidad } : { ...previo, grande: previo.grande + l.cantidad })
        tamanos.add(t)
      } else {
        const k = `${l.nombre}|${l.tamano ?? ''}`
        const p = postres.get(k) ?? { nombre: l.nombre, tamano: l.tamano, cantidad: 0 }
        p.cantidad += l.cantidad
        postres.set(k, p)
      }
    }
    const lista = [...sabores]
      .map(([sabor, q]) => ({ sabor, cantidad: q.mediana + q.grande, mediana: q.mediana, grande: q.grande }))
      .sort((a, b) => compararSabores(a.sabor, b.sabor))
    return {
      pedido: o.pedido,
      cliente: o.cliente,
      hora: o.hora,
      tamano: tamanos.size === 0 ? null : tamanos.size > 1 ? 'Mixto' : [...tamanos][0],
      sabores: lista,
      totalEmpanadas: lista.reduce((n, s) => n + s.cantidad, 0),
      postres: [...postres.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
      fueraDeCorte: o.fueraDeCorte ?? false,
    }
  })
  const m = (b: BloqueMayorista) => minutosDeHora(b.hora) ?? Number.MAX_SAFE_INTEGER
  return bloques.sort((a, b) => m(a) - m(b) || a.cliente.localeCompare(b.cliente, 'es'))
}

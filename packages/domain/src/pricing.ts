import {
  SIZE_FACTORS,
  EXTRA_PRICE,
  DELIVERY_FEE,
  FREE_DELIVERY_THRESHOLD,
  type TamanoId,
} from './constants.js'

export interface Cupon {
  tipo: 'porcentaje' | 'monto_fijo'
  valor: number
}

export interface LineaPedido {
  precioLinea: number
  cantidad: number
}

export interface Totales {
  subtotal: number
  descuentoCupon: number
  delivery: number
  total: number
}

/**
 * Precio base ajustado por tamaño, con el mismo redondeo que usaba la UI:
 * Math.round(base × factor). Personal (o producto sin tamaños) = base intacta.
 */
export function precioPorTamano(precioBase: number, tamano?: TamanoId | null): number {
  const factor = tamano ? (SIZE_FACTORS[tamano] ?? 1) : 1
  return Math.round(precioBase * factor)
}

/**
 * Precio unitario de una línea de pedido:
 * precio_base × factor_de_tamaño (redondeado) + suma de extras.
 *
 * Los extras se expresan como `cantidadExtras` (× precio_extra uniforme, el
 * caso de la UI) o como `preciosExtras` (lista de precios individuales leída
 * de la BD, que tiene prioridad si se pasa).
 */
export function calcularPrecioLinea(params: {
  precioBase: number
  tamano?: TamanoId | null
  cantidadExtras?: number
  precioExtra?: number
  preciosExtras?: number[]
}): number {
  const { precioBase, tamano = null, cantidadExtras = 0, precioExtra = EXTRA_PRICE, preciosExtras } = params
  const totalExtras = preciosExtras
    ? preciosExtras.reduce((acc, p) => acc + p, 0)
    : cantidadExtras * precioExtra
  return precioPorTamano(precioBase, tamano) + totalExtras
}

export function calcularSubtotal(lineas: LineaPedido[]): number {
  return lineas.reduce((acc, l) => acc + l.precioLinea * l.cantidad, 0)
}

/** Descuento de cupón, redondeado a céntimos. Nunca supera el subtotal. */
export function calcularDescuentoCupon(subtotal: number, cupon: Cupon | null): number {
  if (!cupon) return 0
  const bruto =
    cupon.tipo === 'porcentaje'
      ? Math.round(subtotal * (cupon.valor / 100) * 100) / 100
      : cupon.valor
  return Math.min(bruto, subtotal)
}

/**
 * Tarifa de delivery: 0 si no hay ítems, 0 si el subtotal con descuento
 * alcanza el umbral de delivery gratis, tarifa plana en caso contrario.
 */
export function calcularDelivery(params: {
  subtotalConDescuento: number
  hayItems: boolean
  tarifaDelivery?: number
  umbralGratis?: number
}): number {
  const {
    subtotalConDescuento,
    hayItems,
    tarifaDelivery = DELIVERY_FEE,
    umbralGratis = FREE_DELIVERY_THRESHOLD,
  } = params
  if (!hayItems) return 0
  return subtotalConDescuento >= umbralGratis ? 0 : tarifaDelivery
}

/**
 * Totales completos de un pedido. Para recojo en tienda pasar
 * `tarifaDelivery: 0`.
 */
export function calcularTotales(params: {
  lineas: LineaPedido[]
  cupon?: Cupon | null
  tarifaDelivery?: number
  umbralGratis?: number
}): Totales {
  const { lineas, cupon = null, tarifaDelivery, umbralGratis } = params
  const subtotal = calcularSubtotal(lineas)
  const descuentoCupon = calcularDescuentoCupon(subtotal, cupon)
  const delivery = calcularDelivery({
    subtotalConDescuento: subtotal - descuentoCupon,
    hayItems: lineas.length > 0,
    tarifaDelivery,
    umbralGratis,
  })
  return {
    subtotal,
    descuentoCupon,
    delivery,
    total: Math.max(0, subtotal - descuentoCupon + delivery),
  }
}

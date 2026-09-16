import { SIZE_FACTORS, EXTRA_PRICE, type TamanoId } from './constants.js'

export interface LineaPedido {
  precioLinea: number
  cantidad: number
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

// calcularDescuentoCupon, calcularDelivery y calcularTotales se retiraron
// con el rediseño de alcance (Semana 1): no hay más cupones de descuento
// (ver `combos` en 0004_rediseno_alcance.sql) y el delivery lo cotiza el
// operador manualmente en vez de calcularse solo.

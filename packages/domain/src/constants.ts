// Valores por defecto de la plataforma. Un tenant puede sobreescribirlos vía
// configuración en base de datos (p.ej. delivery_zones.tarifa_delivery,
// product_sizes.factor); estas constantes son el fallback global.

export const SIZE_FACTORS = {
  Personal: 1,
  Mediano: 1.35,
  Grande: 1.7,
} as const

export type TamanoId = keyof typeof SIZE_FACTORS

/** Precio por defecto de cada extra (dedicatoria, vela, decoración). */
export const EXTRA_PRICE = 8

/** Tarifa de delivery por defecto. */
export const DELIVERY_FEE = 12

/** Subtotal (con descuento aplicado) a partir del cual el delivery es gratis. */
export const FREE_DELIVERY_THRESHOLD = 150

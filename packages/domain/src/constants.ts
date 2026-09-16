// Valores por defecto de la plataforma. Bake Brothers puede sobreescribirlos
// vía configuración en base de datos (p.ej. product_sizes.factor); estas
// constantes son el fallback global.

export const SIZE_FACTORS = {
  Personal: 1,
  Mediano: 1.35,
  Grande: 1.7,
} as const

export type TamanoId = keyof typeof SIZE_FACTORS

/** Precio por defecto de cada extra (dedicatoria, vela, decoración). */
export const EXTRA_PRICE = 8

// DELIVERY_FEE y FREE_DELIVERY_THRESHOLD se retiraron con el rediseño de
// alcance (Semana 1): el delivery ya no se calcula solo, lo cotiza el
// operador manualmente. Ver 0004_rediseno_alcance.sql.

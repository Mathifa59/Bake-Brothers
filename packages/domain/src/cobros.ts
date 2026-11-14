/**
 * A nombre de quién se cobra (decisión del cliente, 2026-11-13). Hay dos razones sociales:
 *   · Corporación Hermanos Loarte S.A.C. → Cedros.
 *   · Baker Brothers E.I.R.L.            → Santa Marina y TODO delivery (con o sin local asignado).
 * Cada una tiene sus propios datos de pago (Yape, BCP, Interbank). Los datos reales NO viven en el código: van en
 * variables de entorno (DATOS_PAGO para Baker Brothers; DATOS_PAGO_CEDROS para Hermanos Loarte).
 */
export type EntidadCobro = 'baker_brothers' | 'hermanos_loarte'

export const NOMBRE_ENTIDAD_COBRO: Record<EntidadCobro, string> = {
  baker_brothers: 'Baker Brothers E.I.R.L.',
  hermanos_loarte: 'Corporación Hermanos Loarte S.A.C.',
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * Qué razón social cobra un pedido. El delivery SIEMPRE cobra Baker Brothers (aunque lo prepare Cedros); el recojo
 * depende del local. Un local que no sea Cedros usa Baker Brothers.
 */
export function entidadDeCobro(pedido: { tipoEntrega: 'tienda' | 'delivery' | string; sedeNombre?: string | null }): EntidadCobro {
  if (pedido.tipoEntrega === 'delivery') return 'baker_brothers'
  return sinTildes(pedido.sedeNombre ?? '') === 'cedros' ? 'hermanos_loarte' : 'baker_brothers'
}

import { puedeTransicionar, type EstadoPedido } from './orderStatus.js'

export type ColumnaProduccion = 'por_iniciar' | 'en_produccion' | 'listo'

export const COLUMNAS_PRODUCCION: readonly { id: ColumnaProduccion; titulo: string }[] = [
  { id: 'por_iniciar', titulo: 'Por iniciar' },
  { id: 'en_produccion', titulo: 'En producción' },
  { id: 'listo', titulo: 'Listo' },
]

/**
 * Columna del tablero para el estado del pedido, o null si no aparece:
 *  - por iniciar: `confirmed` (pago contra entrega) y `paid` — los dos pueden pasar a producción.
 *  - en producción: `in_production`.
 *  - listo: `out_for_delivery` (para tienda "listo para recoger", para delivery "en camino").
 * `payment_pending` NO es una columna: la máquina de estados no permite
 * producir sin pagar (solo `paid` o `cancelled`), se cuenta aparte.
 * `draft`, `delivered` y `cancelled` quedan fuera del tablero.
 */
export function columnaDeProduccion(estado: string): ColumnaProduccion | null {
  switch (estado) {
    case 'confirmed':
    case 'paid':
      return 'por_iniciar'
    case 'in_production':
      return 'en_produccion'
    case 'out_for_delivery':
      return 'listo'
    default:
      return null
  }
}

export interface AccionProduccion {
  hacia: EstadoPedido
  etiqueta: string
}

/** El botón de cada tarjeta: el siguiente paso válido según la máquina de estados (nunca uno que ella no permita). */
export function accionDeProduccion(estado: EstadoPedido): AccionProduccion | null {
  const candidata: AccionProduccion | null =
    estado === 'confirmed' || estado === 'paid'
      ? { hacia: 'in_production', etiqueta: 'Iniciar producción' }
      : estado === 'in_production'
        ? { hacia: 'out_for_delivery', etiqueta: 'Marcar listo' }
        : estado === 'out_for_delivery'
          ? { hacia: 'delivered', etiqueta: 'Marcar entregado' }
          : null
  return candidata && puedeTransicionar(estado, candidata.hacia) ? candidata : null
}

export interface PedidoTablero {
  estado: string
}

export interface TableroProduccion<T extends PedidoTablero> {
  porIniciar: T[]
  enProduccion: T[]
  listo: T[]
  /** Esperando pago: no pueden iniciar producción, se muestran como contador aparte. */
  pagoPendiente: number
}

export function armarTablero<T extends PedidoTablero>(pedidos: T[]): TableroProduccion<T> {
  const t: TableroProduccion<T> = { porIniciar: [], enProduccion: [], listo: [], pagoPendiente: 0 }
  for (const p of pedidos) {
    if (p.estado === 'payment_pending') t.pagoPendiente += 1
    switch (columnaDeProduccion(p.estado)) {
      case 'por_iniciar':
        t.porIniciar.push(p)
        break
      case 'en_produccion':
        t.enProduccion.push(p)
        break
      case 'listo':
        t.listo.push(p)
        break
    }
  }
  return t
}

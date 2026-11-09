import type { EstadoPedido } from './orderStatus.js'

/**
 * Vocabulario del equipo para los estados de un pedido (lo que se dice en la cocina): Confirmado, En preparación,
 * Listo, Despachado, Anulado. La máquina de estados no cambia — son los mismos ocho estados internos; esto solo
 * decide con qué palabra se muestran en las pantallas del equipo (Órdenes y Producción). Lo que ve el CLIENTE sigue
 * saliendo de `estadoLegible` («En camino», «Entregado»…).
 *
 *   confirmed / paid  → Confirmado       in_production    → En preparación
 *   out_for_delivery  → Listo            delivered        → Despachado
 *   cancelled         → Anulado          payment_pending  → Por pagar (no tiene palabra propia: no se produce aún)
 */
export const ESTADOS_EQUIPO = ['Confirmado', 'En preparación', 'Listo', 'Despachado', 'Anulado'] as const
export type EstadoEquipo = (typeof ESTADOS_EQUIPO)[number] | 'Por pagar' | 'Borrador'

export function estadoEquipo(estado: EstadoPedido | string): EstadoEquipo {
  switch (estado) {
    case 'confirmed':
    case 'paid':
      return 'Confirmado'
    case 'in_production':
      return 'En preparación'
    case 'out_for_delivery':
      return 'Listo'
    case 'delivered':
      return 'Despachado'
    case 'cancelled':
      return 'Anulado'
    case 'payment_pending':
      return 'Por pagar'
    default:
      return 'Borrador'
  }
}

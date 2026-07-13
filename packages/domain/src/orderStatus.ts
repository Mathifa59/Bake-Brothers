export const ESTADOS_PEDIDO = [
  'draft',
  'confirmed',
  'payment_pending',
  'paid',
  'in_production',
  'out_for_delivery',
  'delivered',
  'cancelled',
] as const

export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number]

export type TipoEntrega = 'tienda' | 'delivery'

/**
 * Máquina de estados del pedido. `cancelled` es alcanzable desde cualquier
 * estado previo a `delivered`. `confirmed → in_production` existe para el
 * pago contra entrega (no pasa por payment_pending/paid antes de producir).
 */
export const TRANSICIONES_VALIDAS: Record<EstadoPedido, readonly EstadoPedido[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['payment_pending', 'paid', 'in_production', 'cancelled'],
  payment_pending: ['paid', 'cancelled'],
  paid: ['in_production', 'cancelled'],
  in_production: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}

export function esEstadoPedido(valor: string): valor is EstadoPedido {
  return (ESTADOS_PEDIDO as readonly string[]).includes(valor)
}

export function puedeTransicionar(actual: EstadoPedido, siguiente: EstadoPedido): boolean {
  return TRANSICIONES_VALIDAS[actual]?.includes(siguiente) ?? false
}

/** Texto que ve el cliente final (los mismos que ya usaba la UI). */
export function estadoLegible(estado: EstadoPedido, tipoEntrega: TipoEntrega = 'delivery'): string {
  switch (estado) {
    case 'draft':
      return 'Pendiente'
    case 'confirmed':
      return 'Confirmado'
    case 'payment_pending':
      return 'Pendiente de pago'
    case 'paid':
      return 'Pagado'
    case 'in_production':
      return 'En preparación'
    case 'out_for_delivery':
      return tipoEntrega === 'tienda' ? 'Listo para recoger' : 'En camino'
    case 'delivered':
      return 'Entregado'
    case 'cancelled':
      return 'Cancelado'
  }
}

import { estadoEquipo } from '@bakebrothers/domain'

/**
 * La palabra con la que el EQUIPO nombra el estado de un pedido (Confirmado, En preparación, Listo, Despachado,
 * Anulado; «Por pagar» mientras espera el pago). La máquina de estados no cambia: son los mismos estados internos.
 * Un pedido ya pagado se sigue distinguiendo de uno que paga al recoger («Confirmado · pagado»): en Pedidos esa
 * diferencia importa y con una sola palabra se perdería. Lo que ve el CLIENTE sale de `estadoLegible` (dominio).
 */
export function palabraDeEstado(estado) {
  return estado === 'paid' ? 'Confirmado · pagado' : estadoEquipo(estado)
}

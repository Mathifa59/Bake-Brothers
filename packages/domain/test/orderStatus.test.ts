import { describe, it, expect } from 'vitest'
import { puedeTransicionar, estadoLegible, esEstadoPedido, ESTADOS_PEDIDO } from '../src/index.js'

describe('máquina de estados del pedido', () => {
  it('sigue el camino feliz completo', () => {
    expect(puedeTransicionar('draft', 'confirmed')).toBe(true)
    expect(puedeTransicionar('confirmed', 'payment_pending')).toBe(true)
    expect(puedeTransicionar('payment_pending', 'paid')).toBe(true)
    expect(puedeTransicionar('paid', 'in_production')).toBe(true)
    expect(puedeTransicionar('in_production', 'out_for_delivery')).toBe(true)
    expect(puedeTransicionar('out_for_delivery', 'delivered')).toBe(true)
  })

  it('contra entrega puede saltar de confirmed a in_production', () => {
    expect(puedeTransicionar('confirmed', 'in_production')).toBe(true)
  })

  it('se puede cancelar desde cualquier estado previo a delivered', () => {
    for (const estado of ['draft', 'confirmed', 'payment_pending', 'paid', 'in_production', 'out_for_delivery'] as const) {
      expect(puedeTransicionar(estado, 'cancelled')).toBe(true)
    }
  })

  it('rechaza transiciones inválidas', () => {
    expect(puedeTransicionar('delivered', 'draft')).toBe(false)
    expect(puedeTransicionar('delivered', 'cancelled')).toBe(false)
    expect(puedeTransicionar('cancelled', 'confirmed')).toBe(false)
    expect(puedeTransicionar('draft', 'delivered')).toBe(false)
    expect(puedeTransicionar('paid', 'confirmed')).toBe(false)
  })

  it('valida strings arbitrarios con esEstadoPedido', () => {
    expect(esEstadoPedido('paid')).toBe(true)
    expect(esEstadoPedido('Entregado')).toBe(false)
  })

  it('traduce cada estado a texto de cliente', () => {
    expect(estadoLegible('draft')).toBe('Pendiente')
    expect(estadoLegible('confirmed')).toBe('Confirmado')
    expect(estadoLegible('in_production')).toBe('En preparación')
    expect(estadoLegible('delivered')).toBe('Entregado')
    expect(estadoLegible('cancelled')).toBe('Cancelado')
  })

  it('out_for_delivery depende del tipo de entrega', () => {
    expect(estadoLegible('out_for_delivery', 'tienda')).toBe('Listo para recoger')
    expect(estadoLegible('out_for_delivery', 'delivery')).toBe('En camino')
  })

  it('todo estado del enum tiene texto legible', () => {
    for (const estado of ESTADOS_PEDIDO) {
      expect(estadoLegible(estado)).toBeTruthy()
    }
  })
})

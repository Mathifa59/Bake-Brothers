import { describe, expect, it } from 'vitest'
import { ESTADOS_PEDIDO, ESTADOS_EQUIPO, estadoEquipo, estadoLegible } from '../src/index.js'

describe('vocabulario del equipo para los estados de un pedido', () => {
  it('cada uno de los ocho estados internos tiene una palabra del equipo', () => {
    expect(Object.fromEntries(ESTADOS_PEDIDO.map((e) => [e, estadoEquipo(e)]))).toEqual({
      draft: 'Borrador',
      confirmed: 'Confirmado',
      payment_pending: 'Por pagar',
      paid: 'Confirmado',
      in_production: 'En preparación',
      out_for_delivery: 'Listo',
      delivered: 'Despachado',
      cancelled: 'Anulado',
    })
  })

  it('las cinco palabras del equipo son las que se dicen en la cocina, en orden', () => {
    expect([...ESTADOS_EQUIPO]).toEqual(['Confirmado', 'En preparación', 'Listo', 'Despachado', 'Anulado'])
  })

  it('un estado desconocido no revienta', () => {
    expect(estadoEquipo('algo-raro')).toBe('Borrador')
  })

  it('lo que ve el CLIENTE no cambia: sigue saliendo de estadoLegible', () => {
    expect(estadoLegible('out_for_delivery', 'tienda')).toBe('Listo para recoger')
    expect(estadoLegible('out_for_delivery', 'delivery')).toBe('En camino')
    expect(estadoLegible('delivered', 'tienda')).toBe('Entregado')
    expect(estadoLegible('cancelled', 'tienda')).toBe('Cancelado')
  })
})

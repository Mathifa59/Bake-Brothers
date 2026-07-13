import { describe, it, expect } from 'vitest'
import {
  horasDeAnticipacion,
  cumpleAnticipacionMinima,
  hayCupoDisponible,
  cupoRestante,
} from '../src/index.js'

// "Ahora" fijo para tests deterministas: 10 de julio de 2026, 10:00 local.
const AHORA = new Date(2026, 6, 10, 10, 0, 0)

describe('anticipación mínima', () => {
  it('calcula las horas hasta las 00:00 del día de entrega', () => {
    // 12/07 00:00 - 10/07 10:00 = 38 horas
    expect(horasDeAnticipacion('2026-07-12', AHORA)).toBe(38)
  })

  it('CRITERIO DE ACEPTACIÓN: una torta (48h) pedida con ~12h de anticipación se rechaza', () => {
    // Entrega 11/07, pedido el 10/07 a las 10:00 → 14h < 48h
    expect(
      cumpleAnticipacionMinima({
        fechaEntregaISO: '2026-07-11',
        anticipacionHorasMinima: 48,
        ahora: AHORA,
      })
    ).toBe(false)
  })

  it('una torta (48h) pedida con 3 días de anticipación se acepta', () => {
    expect(
      cumpleAnticipacionMinima({
        fechaEntregaISO: '2026-07-13',
        anticipacionHorasMinima: 48,
        ahora: AHORA,
      })
    ).toBe(true)
  })

  it('bocaditos (24h) para mañana a las 10:00 de hoy: 14h < 24h → se rechaza', () => {
    expect(
      cumpleAnticipacionMinima({
        fechaEntregaISO: '2026-07-11',
        anticipacionHorasMinima: 24,
        ahora: AHORA,
      })
    ).toBe(false)
  })

  it('bocaditos (24h) para pasado mañana → se acepta', () => {
    expect(
      cumpleAnticipacionMinima({
        fechaEntregaISO: '2026-07-12',
        anticipacionHorasMinima: 24,
        ahora: AHORA,
      })
    ).toBe(true)
  })

  it('producto de mismo día (0h) para hoy: las 00:00 ya pasaron → rechazado (conservador)', () => {
    // Simplificación consciente de Fase 0: la regla "antes de las 12 pm" no se
    // valida aún; 0h contra las 00:00 de hoy da negativo.
    expect(
      cumpleAnticipacionMinima({
        fechaEntregaISO: '2026-07-10',
        anticipacionHorasMinima: 0,
        ahora: AHORA,
      })
    ).toBe(false)
  })

  it('producto de mismo día (0h) para mañana → aceptado', () => {
    expect(
      cumpleAnticipacionMinima({
        fechaEntregaISO: '2026-07-11',
        anticipacionHorasMinima: 0,
        ahora: AHORA,
      })
    ).toBe(true)
  })

  it('fecha inválida nunca cumple', () => {
    expect(
      cumpleAnticipacionMinima({
        fechaEntregaISO: 'no-es-fecha',
        anticipacionHorasMinima: 0,
        ahora: AHORA,
      })
    ).toBe(false)
  })
})

describe('capacidad de producción', () => {
  it('sin límite configurado (null) siempre hay cupo', () => {
    expect(
      hayCupoDisponible({ cupoMaximo: null, unidadesReservadas: 999, unidadesSolicitadas: 999 })
    ).toBe(true)
  })

  it('acepta si reservadas + solicitadas cabe exactamente en el cupo', () => {
    expect(
      hayCupoDisponible({ cupoMaximo: 10, unidadesReservadas: 8, unidadesSolicitadas: 2 })
    ).toBe(true)
  })

  it('rechaza si el pedido excede el cupo del día', () => {
    expect(
      hayCupoDisponible({ cupoMaximo: 10, unidadesReservadas: 8, unidadesSolicitadas: 3 })
    ).toBe(false)
  })

  it('un día bloqueado (cupo 0) rechaza cualquier pedido', () => {
    expect(
      hayCupoDisponible({ cupoMaximo: 0, unidadesReservadas: 0, unidadesSolicitadas: 1 })
    ).toBe(false)
  })

  it('cupoRestante reporta lo disponible, nunca negativo', () => {
    expect(cupoRestante({ cupoMaximo: 10, unidadesReservadas: 4 })).toBe(6)
    expect(cupoRestante({ cupoMaximo: 10, unidadesReservadas: 12 })).toBe(0)
    expect(cupoRestante({ cupoMaximo: null, unidadesReservadas: 4 })).toBe(null)
  })
})

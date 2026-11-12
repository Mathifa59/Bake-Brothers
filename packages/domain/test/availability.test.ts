import { describe, it, expect } from 'vitest'
import {
  horasDeAnticipacion,
  cumpleAnticipacionMinima,
  hayCupoDisponible,
  cupoRestante,
  esDomingo,
} from '../src/index.js'

// "Ahora" fijo para tests deterministas: 10 de julio de 2026, 10:00 en LIMA (-05:00).
// La anticipación se mide en hora de Lima, nunca con el huso del servidor: estos tests
// se corren también con TZ=UTC para comprobarlo.
const AHORA = new Date('2026-07-10T10:00:00-05:00')

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

describe('hora de Lima, no la del servidor', () => {
  it('a las 8:00 p. m. de Lima (01:00 UTC del día siguiente) la entrega de mañana cuenta 4 h, no 28', () => {
    const ahora = new Date('2026-07-10T20:00:00-05:00') // = 2026-07-11 01:00 UTC
    expect(horasDeAnticipacion('2026-07-11', ahora)).toBe(4)
    expect(cumpleAnticipacionMinima({ fechaEntregaISO: '2026-07-11', anticipacionHorasMinima: 24, ahora })).toBe(false)
  })

  it('exactamente 24 h contra las 00:00 de Lima → cumple', () => {
    expect(cumpleAnticipacionMinima({ fechaEntregaISO: '2026-07-11', anticipacionHorasMinima: 24, ahora: new Date('2026-07-10T00:00:00-05:00') })).toBe(true)
    expect(cumpleAnticipacionMinima({ fechaEntregaISO: '2026-07-11', anticipacionHorasMinima: 24, ahora: new Date('2026-07-10T00:01:00-05:00') })).toBe(false)
  })

  it('fechas inválidas o imposibles → NaN / no cumple', () => {
    expect(horasDeAnticipacion('2026-02-30', AHORA)).toBeNaN()
    expect(horasDeAnticipacion('mañana', AHORA)).toBeNaN()
    expect(cumpleAnticipacionMinima({ fechaEntregaISO: '2026-13-01', anticipacionHorasMinima: 0, ahora: AHORA })).toBe(false)
  })

  it('esDomingo mira el día de calendario, sin importar el huso', () => {
    expect(esDomingo('2026-07-12')).toBe(true) // domingo
    expect(esDomingo('2026-07-11')).toBe(false) // sábado
    expect(esDomingo('2026-07-13')).toBe(false) // lunes
    expect(esDomingo('basura')).toBe(false)
  })
})

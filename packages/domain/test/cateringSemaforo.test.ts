import { describe, it, expect } from 'vitest'
import { evaluarSemaforoCatering, type ReglaCateringInput } from '../src/index.js'

// "Ahora" fijo para tests deterministas: miércoles 16/09/2026, 10:00 local.
// Verificado con Date real, no de memoria: 2026-09-16 es miércoles,
// 2026-09-17 jueves, 2026-09-20 domingo.
const AHORA = new Date(2026, 8, 16, 10, 0, 0)

// Formas reales de reglas_catering (0007/0018) — no inventadas.
const TEQUENOS: ReglaCateringInput = {
  unidadesMinimas: 25,
  saleMismoDia: false,
  anticipacionHoras: 24,
  admiteCorteNocheAnterior: true, // Guía v2.0: "hasta 8:30pm → desde ~12pm" del día siguiente
}

const CAUSA_RELLENA: ReglaCateringInput = {
  unidadesMinimas: 50,
  saleMismoDia: false,
  anticipacionHoras: 24,
  admiteCorteNocheAnterior: false, // Guía v2.0: "24h obligatorias", sin excepción de horario
}

describe('semáforo de catering — orden de evaluación', () => {
  it('CASO LÍMITE (pedido por el cliente): 30 tequeños para un domingo con anticipación de sobra → amarillo, NO verde — el domingo manda sin importar que cumpla cantidad y anticipación', () => {
    expect(
      evaluarSemaforoCatering(TEQUENOS, {
        cantidadSolicitada: 30, // ≥ 25, cumple de sobra
        fechaEntregaISO: '2026-09-20', // domingo, 4 días de anticipación — cumple de sobra
        ahora: AHORA,
      })
    ).toBe('amarillo')
  })

  it('domingo corta ANTES que el chequeo de cantidad — ni siquiera importa que esté por debajo del mínimo', () => {
    expect(
      evaluarSemaforoCatering(TEQUENOS, {
        cantidadSolicitada: 5, // muy por debajo del mínimo (25) — igual da amarillo, no rojo
        fechaEntregaISO: '2026-09-20', // domingo
        ahora: AHORA,
      })
    ).toBe('amarillo')
  })

  it('cantidad por debajo del mínimo → rojo (día hábil, con anticipación de sobra)', () => {
    expect(
      evaluarSemaforoCatering(TEQUENOS, {
        cantidadSolicitada: 10, // < 25
        fechaEntregaISO: '2026-09-21', // lunes, no domingo
        ahora: AHORA,
      })
    ).toBe('rojo')
  })

  it('cantidad justo en el mínimo → no es rojo por esta regla (pasa a las siguientes)', () => {
    expect(
      evaluarSemaforoCatering(TEQUENOS, {
        cantidadSolicitada: 25, // exactamente el mínimo
        fechaEntregaISO: '2026-09-23', // miércoles siguiente, anticipación de sobra
        ahora: AHORA,
      })
    ).toBe('verde')
  })

  it('no sale el mismo día y piden para HOY → rojo (la fuente no documenta ninguna excepción para hoy)', () => {
    expect(
      evaluarSemaforoCatering(TEQUENOS, {
        cantidadSolicitada: 30,
        fechaEntregaISO: '2026-09-16', // mismo día que "ahora"
        ahora: AHORA,
      })
    ).toBe('rojo')
  })

  it('anticipación insuficiente, el ítem NO admite el corte de la noche anterior → amarillo (Causa rellena, "24h obligatorias")', () => {
    // 2026-09-17 00:00 - 2026-09-16 10:00 = 14h < 24h
    expect(
      evaluarSemaforoCatering(CAUSA_RELLENA, {
        cantidadSolicitada: 60, // ≥ 50, cumple cantidad
        fechaEntregaISO: '2026-09-17', // mañana — solo 14h de anticipación real
        ahora: AHORA,
      })
    ).toBe('amarillo')
  })

  it('anticipación insuficiente, PERO el ítem admite el corte de la noche anterior y el pedido llega antes de las 8:30pm → verde (Tequeños)', () => {
    expect(
      evaluarSemaforoCatering(TEQUENOS, {
        cantidadSolicitada: 30,
        fechaEntregaISO: '2026-09-17', // mañana — mismos 14h que el caso anterior
        ahora: AHORA, // 10:00 — antes de las 20:30
      })
    ).toBe('verde')
  })

  it('el corte de la noche anterior deja de aplicar si el pedido llega después de las 8:30pm → amarillo (mismo ítem, misma fecha, distinta hora)', () => {
    const ahoraDeNoche = new Date(2026, 8, 16, 21, 0, 0) // 21:00, ya pasadas las 20:30
    expect(
      evaluarSemaforoCatering(TEQUENOS, {
        cantidadSolicitada: 30,
        fechaEntregaISO: '2026-09-17',
        ahora: ahoraDeNoche,
      })
    ).toBe('amarillo')
  })

  it('el corte de la noche anterior solo aplica para "mañana" — pasado mañana no lo necesita porque ya cumple anticipación por su cuenta', () => {
    expect(
      evaluarSemaforoCatering(CAUSA_RELLENA, {
        cantidadSolicitada: 60,
        fechaEntregaISO: '2026-09-18', // pasado mañana — 38h, cumple igual sin el corte
        ahora: AHORA,
      })
    ).toBe('verde')
  })

  it('caso verde limpio: cumple mínimo, cumple anticipación, no es domingo, no es hoy', () => {
    expect(
      evaluarSemaforoCatering(CAUSA_RELLENA, {
        cantidadSolicitada: 80,
        fechaEntregaISO: '2026-09-23', // miércoles siguiente
        ahora: AHORA,
      })
    ).toBe('verde')
  })
})

describe('semáforo de catering — no decide sobre movilidad/auto obligatorio', () => {
  it('ReglaCateringInput no tiene requiereAutoObligatorio ni necesitaTicket — estructuralmente no puede usarlos', () => {
    // No es un test en runtime, es la garantía de diseño: si esto compila,
    // la función no puede haberlos tocado — TypeScript no deja pasar
    // propiedades que no están en el tipo.
    const regla: ReglaCateringInput = TEQUENOS
    expect(Object.keys(regla).sort()).toEqual(
      ['admiteCorteNocheAnterior', 'anticipacionHoras', 'saleMismoDia', 'unidadesMinimas'].sort()
    )
  })
})

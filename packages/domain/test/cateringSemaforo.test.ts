import { describe, it, expect } from 'vitest'
import { evaluarSemaforoCatering, CAPACIDAD_ESTANDAR_BOCADITOS_POR_HORA, type ReglaCateringInput } from '../src/index.js'

// Todos los instantes llevan el offset de Lima (-05:00) a propósito: el
// semáforo trabaja en hora de Lima y no debe depender del huso del servidor
// (en Coolify es UTC). Calendario verificado: 2026-09-16 miércoles,
// 17 jueves, 18 viernes, 19 sábado, 20 domingo, 21 lunes.
const lima = (iso: string) => new Date(`${iso}-05:00`)
const AHORA = lima('2026-09-16T10:00:00') // miércoles 10:00 en Lima

// Formas reales de reglas_catering (0007/0018/0044) — Guía de Agendamiento v2.0.
const TEQUENOS: ReglaCateringInput = {
  unidadesMinimas: 25,
  saleMismoDia: false, // Hoy: NO CONFIRMAR
  anticipacionHoras: 24,
  admiteCorteNocheAnterior: true, // "Hasta 8:30 p. m. → desde aprox. 12:00 m."
}

const CAUSA_RELLENA: ReglaCateringInput = {
  unidadesMinimas: 50,
  saleMismoDia: false,
  anticipacionHoras: 24,
  admiteCorteNocheAnterior: false, // "24 horas obligatorias"
}

const DULCES_DE_STOCK: ReglaCateringInput = {
  unidadesMinimas: 20,
  saleMismoDia: true, // Hoy: CONSULTAR
  anticipacionHoras: 24,
  admiteCorteNocheAnterior: true, // Mañana: AGENDAR (día siguiente)
}

describe('semáforo de catering — orden de evaluación', () => {
  it('CASO LÍMITE (pedido por el cliente): 30 tequeños para un domingo con anticipación de sobra → amarillo, NO verde', () => {
    expect(evaluarSemaforoCatering(TEQUENOS, { cantidadSolicitada: 30, fechaEntregaISO: '2026-09-20', ahora: AHORA })).toBe('amarillo')
  })

  it('domingo corta ANTES que el chequeo de cantidad — aunque esté por debajo del mínimo', () => {
    expect(evaluarSemaforoCatering(TEQUENOS, { cantidadSolicitada: 5, fechaEntregaISO: '2026-09-20', ahora: AHORA })).toBe('amarillo')
  })

  it('cantidad por debajo del mínimo → rojo (día hábil, con anticipación de sobra)', () => {
    expect(evaluarSemaforoCatering(TEQUENOS, { cantidadSolicitada: 10, fechaEntregaISO: '2026-09-21', ahora: AHORA })).toBe('rojo')
  })

  it('cantidad justo en el mínimo → no es rojo por esta regla', () => {
    expect(evaluarSemaforoCatering(TEQUENOS, { cantidadSolicitada: 25, fechaEntregaISO: '2026-09-23', ahora: AHORA })).toBe('verde')
  })

  it('anticipación insuficiente, el ítem NO admite el corte de la noche anterior → amarillo (Causa rellena, "24 horas obligatorias")', () => {
    expect(evaluarSemaforoCatering(CAUSA_RELLENA, { cantidadSolicitada: 60, fechaEntregaISO: '2026-09-17', ahora: AHORA })).toBe('amarillo')
  })

  it('anticipación insuficiente, PERO el ítem admite el corte y el pedido llega antes de las 8:30 p. m. → verde (Tequeños)', () => {
    expect(evaluarSemaforoCatering(TEQUENOS, { cantidadSolicitada: 30, fechaEntregaISO: '2026-09-17', ahora: AHORA })).toBe('verde')
  })

  it('el corte de la noche anterior deja de aplicar después de las 8:30 p. m. → amarillo', () => {
    expect(evaluarSemaforoCatering(TEQUENOS, { cantidadSolicitada: 30, fechaEntregaISO: '2026-09-17', ahora: lima('2026-09-16T21:00:00') })).toBe('amarillo')
  })

  it('justo a las 8:29 p. m. todavía aplica el corte; a las 8:30 p. m. en punto ya no', () => {
    const pedido = { cantidadSolicitada: 30, fechaEntregaISO: '2026-09-17' }
    expect(evaluarSemaforoCatering(TEQUENOS, { ...pedido, ahora: lima('2026-09-16T20:29:00') })).toBe('verde')
    expect(evaluarSemaforoCatering(TEQUENOS, { ...pedido, ahora: lima('2026-09-16T20:30:00') })).toBe('amarillo')
  })

  it('el corte solo aplica para "mañana" — pasado mañana ya cumple por su cuenta', () => {
    expect(evaluarSemaforoCatering(CAUSA_RELLENA, { cantidadSolicitada: 60, fechaEntregaISO: '2026-09-18', ahora: AHORA })).toBe('verde')
  })

  it('caso verde limpio: cumple mínimo, cumple anticipación, no es domingo, no es hoy', () => {
    expect(evaluarSemaforoCatering(CAUSA_RELLENA, { cantidadSolicitada: 80, fechaEntregaISO: '2026-09-23', ahora: AHORA })).toBe('verde')
  })
})

describe('semáforo de catering — columna "Hoy" de la Guía v2.0', () => {
  it('Hoy = NO CONFIRMAR (Tequeños, Causa…) → rojo', () => {
    expect(evaluarSemaforoCatering(TEQUENOS, { cantidadSolicitada: 30, fechaEntregaISO: '2026-09-16', ahora: AHORA })).toBe('rojo')
    expect(evaluarSemaforoCatering(CAUSA_RELLENA, { cantidadSolicitada: 60, fechaEntregaISO: '2026-09-16', ahora: AHORA })).toBe('rojo')
  })

  it('Hoy = CONSULTAR (Dulces de stock, Mini empanadas, Petit panes, Mini croissant, Triples) → amarillo, nunca rojo ni verde', () => {
    expect(evaluarSemaforoCatering(DULCES_DE_STOCK, { cantidadSolicitada: 30, fechaEntregaISO: '2026-09-16', ahora: AHORA })).toBe('amarillo')
    // "Desde 100 und., consultar antes de prometer": sigue siendo amarillo
    expect(evaluarSemaforoCatering(DULCES_DE_STOCK, { cantidadSolicitada: 150, fechaEntregaISO: '2026-09-16', ahora: AHORA })).toBe('amarillo')
  })

  it('Hoy = CONSULTAR con cantidad por debajo del mínimo → rojo (fuera del estándar)', () => {
    expect(evaluarSemaforoCatering(DULCES_DE_STOCK, { cantidadSolicitada: 10, fechaEntregaISO: '2026-09-16', ahora: AHORA })).toBe('rojo')
  })

  it('Mañana = AGENDAR sin horario propio (Dulces de stock): se agenda hoy para mañana, antes del corte → verde', () => {
    expect(evaluarSemaforoCatering(DULCES_DE_STOCK, { cantidadSolicitada: 30, fechaEntregaISO: '2026-09-17', ahora: AHORA })).toBe('verde')
  })
})

describe('semáforo de catering — hora de Lima, no la del servidor', () => {
  it('a las 8:00 p. m. de Lima (01:00 UTC del día siguiente) "hoy" sigue siendo el día de Lima', () => {
    // 2026-09-16 20:00 Lima = 2026-09-17 01:00 UTC. Un servidor en UTC vería "hoy = 17".
    const ahora = lima('2026-09-16T20:00:00')
    expect(ahora.toISOString()).toBe('2026-09-17T01:00:00.000Z')
    expect(evaluarSemaforoCatering(TEQUENOS, { cantidadSolicitada: 30, fechaEntregaISO: '2026-09-16', ahora })).toBe('rojo') // es hoy
    expect(evaluarSemaforoCatering(TEQUENOS, { cantidadSolicitada: 30, fechaEntregaISO: '2026-09-17', ahora })).toBe('verde') // es mañana, antes de 8:30
  })

  it('a las 9:00 p. m. de Lima (02:00 UTC) el corte de las 8:30 p. m. ya pasó', () => {
    expect(evaluarSemaforoCatering(TEQUENOS, { cantidadSolicitada: 30, fechaEntregaISO: '2026-09-17', ahora: lima('2026-09-16T21:00:00') })).toBe('amarillo')
  })

  it('la anticipación de 24 h se mide contra las 00:00 de Lima del día de entrega', () => {
    // Jueves 17 00:00 Lima menos miércoles 16 00:30 Lima = 23,5 h < 24 → amarillo para un ítem sin corte
    expect(evaluarSemaforoCatering(CAUSA_RELLENA, { cantidadSolicitada: 60, fechaEntregaISO: '2026-09-17', ahora: lima('2026-09-16T00:30:00') })).toBe('amarillo')
    // 24 h justas → verde
    expect(evaluarSemaforoCatering(CAUSA_RELLENA, { cantidadSolicitada: 60, fechaEntregaISO: '2026-09-17', ahora: lima('2026-09-16T00:00:00') })).toBe('verde')
  })
})

describe('semáforo de catering — capacidad estándar (Guía: hasta 500 bocaditos por franja de una hora)', () => {
  it('más de 500 unidades de un ítem → amarillo (consultar capacidad), aunque cumpla todo lo demás', () => {
    expect(CAPACIDAD_ESTANDAR_BOCADITOS_POR_HORA).toBe(500)
    expect(evaluarSemaforoCatering(CAUSA_RELLENA, { cantidadSolicitada: 500, fechaEntregaISO: '2026-09-23', ahora: AHORA })).toBe('verde')
    expect(evaluarSemaforoCatering(CAUSA_RELLENA, { cantidadSolicitada: 501, fechaEntregaISO: '2026-09-23', ahora: AHORA })).toBe('amarillo')
  })
})

describe('semáforo de catering — no decide sobre movilidad/auto obligatorio', () => {
  it('ReglaCateringInput no tiene requiereAutoObligatorio ni necesitaTicket — estructuralmente no puede usarlos', () => {
    const regla: ReglaCateringInput = TEQUENOS
    expect(Object.keys(regla).sort()).toEqual(['admiteCorteNocheAnterior', 'anticipacionHoras', 'saleMismoDia', 'unidadesMinimas'].sort())
  })
})

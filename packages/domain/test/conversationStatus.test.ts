import { describe, it, expect } from 'vitest'
import {
  puedeTransicionarConversacion,
  estadoConversacionLegible,
  esEstadoConversacion,
  ESTADOS_CONVERSACION,
  debeAutoRetornarAlBot,
  HORAS_AUTO_RETORNO_BOT_POR_DEFECTO,
} from '../src/index.js'

describe('máquina de estados de la conversación', () => {
  it('el bot puede escalar o cerrar una conversación activa', () => {
    expect(puedeTransicionarConversacion('activa', 'escalada')).toBe(true)
    expect(puedeTransicionarConversacion('activa', 'cerrada')).toBe(true)
  })

  it('una conversación escalada pasa a un operador o se cierra directo', () => {
    expect(puedeTransicionarConversacion('escalada', 'atendida_por_operador')).toBe(true)
    expect(puedeTransicionarConversacion('escalada', 'cerrada')).toBe(true)
  })

  it('el operador puede devolver el control al bot o cerrar', () => {
    expect(puedeTransicionarConversacion('atendida_por_operador', 'activa')).toBe(true)
    expect(puedeTransicionarConversacion('atendida_por_operador', 'cerrada')).toBe(true)
  })

  it('una conversación cerrada se reabre si el cliente vuelve a escribir', () => {
    expect(puedeTransicionarConversacion('cerrada', 'activa')).toBe(true)
  })

  it('un echo de Coexistence pausa al bot desde activa o cerrada (nuevo, 2026-10)', () => {
    expect(puedeTransicionarConversacion('activa', 'atendida_por_operador')).toBe(true)
    expect(puedeTransicionarConversacion('cerrada', 'atendida_por_operador')).toBe(true)
  })

  it('rechaza transiciones inválidas', () => {
    expect(puedeTransicionarConversacion('cerrada', 'escalada')).toBe(false)
    expect(puedeTransicionarConversacion('escalada', 'activa')).toBe(false)
  })

  it('valida strings arbitrarios con esEstadoConversacion', () => {
    expect(esEstadoConversacion('activa')).toBe(true)
    expect(esEstadoConversacion('resuelta')).toBe(false)
  })

  it('todo estado del enum tiene texto legible', () => {
    for (const estado of ESTADOS_CONVERSACION) {
      expect(estadoConversacionLegible(estado)).toBeTruthy()
    }
  })
})

describe('auto-retorno del bot (debeAutoRetornarAlBot)', () => {
  const ahora = new Date('2026-10-02T15:00:00Z')
  const haceHoras = (h: number) => new Date(ahora.getTime() - h * 60 * 60 * 1000)

  it('usa 3 horas por defecto', () => {
    expect(HORAS_AUTO_RETORNO_BOT_POR_DEFECTO).toBe(3)
  })

  it('echo reciente (< X horas): el bot sigue callado', () => {
    const c = { estado: 'atendida_por_operador' as const, pausadaPorEcho: true, ultimoMensajeHumanoEn: haceHoras(1) }
    expect(debeAutoRetornarAlBot(c, ahora)).toBe(false)
  })

  it('echo antiguo (> X horas): el bot retoma', () => {
    const c = { estado: 'atendida_por_operador' as const, pausadaPorEcho: true, ultimoMensajeHumanoEn: haceHoras(3.5) }
    expect(debeAutoRetornarAlBot(c, ahora)).toBe(true)
  })

  it('respeta una X distinta pasada como parámetro', () => {
    const c = { estado: 'atendida_por_operador' as const, pausadaPorEcho: true, ultimoMensajeHumanoEn: haceHoras(3.5) }
    expect(debeAutoRetornarAlBot(c, ahora, 6)).toBe(false)
    expect(debeAutoRetornarAlBot(c, ahora, 1)).toBe(true)
  })

  it('una escalada del bot tomada por un humano NUNCA se auto-retorna, por antigua que sea', () => {
    const c = { estado: 'atendida_por_operador' as const, pausadaPorEcho: false, ultimoMensajeHumanoEn: haceHoras(500) }
    expect(debeAutoRetornarAlBot(c, ahora)).toBe(false)
  })

  it('una conversación escalada (sin humano todavía) nunca se auto-retorna', () => {
    const c = { estado: 'escalada' as const, pausadaPorEcho: true, ultimoMensajeHumanoEn: haceHoras(500) }
    expect(debeAutoRetornarAlBot(c, ahora)).toBe(false)
  })

  it('una conversación activa o cerrada no necesita auto-retorno', () => {
    for (const estado of ['activa', 'cerrada'] as const) {
      expect(debeAutoRetornarAlBot({ estado, pausadaPorEcho: true, ultimoMensajeHumanoEn: haceHoras(500) }, ahora)).toBe(false)
    }
  })

  it('sin marca de último mensaje humano no se auto-retorna (dato faltante ≠ permiso)', () => {
    const c = { estado: 'atendida_por_operador' as const, pausadaPorEcho: true, ultimoMensajeHumanoEn: null }
    expect(debeAutoRetornarAlBot(c, ahora)).toBe(false)
  })
})

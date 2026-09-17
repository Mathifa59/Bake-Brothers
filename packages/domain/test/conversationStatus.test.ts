import { describe, it, expect } from 'vitest'
import {
  puedeTransicionarConversacion,
  estadoConversacionLegible,
  esEstadoConversacion,
  ESTADOS_CONVERSACION,
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

  it('rechaza transiciones inválidas', () => {
    expect(puedeTransicionarConversacion('activa', 'atendida_por_operador')).toBe(false)
    expect(puedeTransicionarConversacion('cerrada', 'escalada')).toBe(false)
    expect(puedeTransicionarConversacion('cerrada', 'atendida_por_operador')).toBe(false)
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

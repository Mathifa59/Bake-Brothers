import { describe, expect, it } from 'vitest'
import {
  coincidePalabraClave,
  dentroDeVentanaRespuestaPrivada,
  elegirRespuestaPublica,
  normalizarPalabras,
  reglaParaComentario,
  textoDelDm,
} from '../src/respuestasAutomaticas.js'

describe('coincidePalabraClave — cuándo un comentario dispara la respuesta', () => {
  it('sin importar mayúsculas, tildes, signos ni emojis', () => {
    expect(coincidePalabraClave('ALFAJOR', ['alfajor'])).toBe(true)
    expect(coincidePalabraClave('alfajor!!! 😍😍', ['Alfajor'])).toBe(true)
    expect(coincidePalabraClave('Quiero el ALFAJÓR por favor', ['alfajor'])).toBe(true)
    expect(coincidePalabraClave('@amiga mira esto: alfajor', ['ALFAJOR'])).toBe(true)
  })

  it('acepta el plural simple en los dos sentidos', () => {
    expect(coincidePalabraClave('alfajores', ['alfajor'])).toBe(true)
    expect(coincidePalabraClave('tortas', ['torta'])).toBe(true)
    expect(coincidePalabraClave('torta', ['tortas'])).toBe(true)
    expect(coincidePalabraClave('alfajor', ['alfajores'])).toBe(true)
  })

  it('solo como palabra completa', () => {
    expect(coincidePalabraClave('alfajorería', ['alfajor'])).toBe(false)
    expect(coincidePalabraClave('tortilla', ['torta'])).toBe(false)
    expect(coincidePalabraClave('jajaja que rico', ['alfajor'])).toBe(false)
  })

  it('una palabra clave de varias palabras tiene que aparecer seguida', () => {
    expect(coincidePalabraClave('info del Día de la Madre porfa', ['dia de la madre'])).toBe(true)
    expect(coincidePalabraClave('la madre del día', ['dia de la madre'])).toBe(false)
  })

  it('comentario vacío o palabras vacías nunca coinciden', () => {
    expect(coincidePalabraClave('', ['alfajor'])).toBe(false)
    expect(coincidePalabraClave('🔥🔥', ['alfajor'])).toBe(false)
    expect(coincidePalabraClave('alfajor', ['', '  '])).toBe(false)
    expect(coincidePalabraClave('a', ['a'])).toBe(false)
  })

  it('normalizarPalabras deja solo letras y números', () => {
    expect(normalizarPalabras('  ¡Día  de la MADRE! 💛 ')).toBe('dia de la madre')
  })
})

describe('reglaParaComentario', () => {
  const reglas = [
    { id: '1', palabras: ['alfajor'], activa: false },
    { id: '2', palabras: ['alfajor', 'alfa'], activa: true },
    { id: '3', palabras: ['alfajor'], activa: true },
    { id: '4', palabras: ['empanada'], activa: true },
  ]
  it('la primera ACTIVA que coincide; una pausada no cuenta', () => {
    expect(reglaParaComentario('ALFAJORES!', reglas)?.id).toBe('2')
    expect(reglaParaComentario('empanadas', reglas)?.id).toBe('4')
    expect(reglaParaComentario('hola', reglas)).toBeNull()
  })
})

describe('elegirRespuestaPublica', () => {
  const variantes = ['A', 'B', 'C']
  it('la misma para el mismo comentario (reintentos de Meta) y repartidas entre comentarios', () => {
    expect(elegirRespuestaPublica(variantes, '1789')).toBe(elegirRespuestaPublica(variantes, '1789'))
    const elegidas = new Set(Array.from({ length: 30 }, (_, i) => elegirRespuestaPublica(variantes, `179${i}`)))
    expect(elegidas.size).toBeGreaterThan(1)
  })
  it('sin variantes útiles, null (no se responde en público)', () => {
    expect(elegirRespuestaPublica([], '1')).toBeNull()
    expect(elegirRespuestaPublica(['  ', ''], '1')).toBeNull()
  })
})

describe('textoDelDm', () => {
  it('mensaje y link corto al final', () => {
    expect(textoDelDm('  Hola 🍪 ', 'https://www.bakebrothers.pe/w/ig-alfajor')).toBe(
      'Hola 🍪\n\n👉 Pídelo por WhatsApp: https://www.bakebrothers.pe/w/ig-alfajor'
    )
  })
})

describe('dentroDeVentanaRespuestaPrivada — Instagram solo la permite 7 días después del comentario', () => {
  const ahora = new Date('2026-11-14T12:00:00Z')
  const haceDias = (d: number) => new Date(ahora.getTime() - d * 24 * 3600 * 1000)
  it('dentro de los 7 días sí; desde el día 7 en adelante no', () => {
    expect(dentroDeVentanaRespuestaPrivada(haceDias(0), ahora)).toBe(true)
    expect(dentroDeVentanaRespuestaPrivada(haceDias(6.9), ahora)).toBe(true)
    expect(dentroDeVentanaRespuestaPrivada(haceDias(7), ahora)).toBe(false)
    expect(dentroDeVentanaRespuestaPrivada(haceDias(30), ahora)).toBe(false)
  })
  it('sin fecha conocida se intenta (el webhook llega en vivo)', () => {
    expect(dentroDeVentanaRespuestaPrivada(null, ahora)).toBe(true)
    expect(dentroDeVentanaRespuestaPrivada(new Date('x'), ahora)).toBe(true)
  })
})

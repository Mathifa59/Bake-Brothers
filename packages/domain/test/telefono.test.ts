import { describe, it, expect } from 'vitest'
import { normalizarTelefono, normalizarTelefonoWhatsApp, claveNombreCliente, tamanoHabitualDesdeCodigo } from '../src/index.js'

describe('normalizarTelefono → E.164', () => {
  it.each([
    ['912944096', '+51912944096'],
    ['912 944 096', '+51912944096'],
    ['912-944-096', '+51912944096'],
    ['51912944096', '+51912944096'],
    ['+51 912 944 096', '+51912944096'],
    ['+51912944096', '+51912944096'],
    ['0051 912944096', '+51912944096'],
    ['  (+51) 912.944.096 ', '+51912944096'],
    ['01 234 5678', '+5112345678'], // fijo de Lima con el 0 de marcación
    ['+1 555 123 4567', '+15551234567'], // otro país con «+»
  ])('«%s» → %s', (entrada, esperado) => {
    expect(normalizarTelefono(entrada)).toBe(esperado)
  })

  it.each([
    [''],
    ['   '],
    ['abc'],
    ['12345'], // muy corto
    ['812944096'], // 9 dígitos pero no empieza con 9
    ['91294409'], // 8 dígitos sin prefijo: ambiguo, no se adivina
    ['5191294409'], // 51 + 8 dígitos que empiezan con 9: falta un dígito
    ['+51 812944096'], // +51 con un celular inválido
    ['9129440961'], // 10 dígitos
    ['+0123456789'], // un país no puede empezar con 0
    ['912944096 ext 3'], // letras
  ])('«%s» no es un teléfono reconocible → null', (entrada) => {
    expect(normalizarTelefono(entrada)).toBeNull()
  })

  it('null / undefined → null', () => {
    expect(normalizarTelefono(null)).toBeNull()
    expect(normalizarTelefono(undefined)).toBeNull()
  })

  it('es idempotente: normalizar un E.164 lo deja igual', () => {
    for (const t of ['+51912944096', '+5112345678', '+15551234567']) expect(normalizarTelefono(t)).toBe(t)
  })

  it('las distintas formas de escribir el mismo celular dan LA MISMA clave (así no hay duplicados)', () => {
    const formas = ['912944096', '51 912 944 096', '+51-912-944-096', '0051912944096']
    expect(new Set(formas.map(normalizarTelefono)).size).toBe(1)
  })
})

describe('normalizarTelefonoWhatsApp (wa_id de Meta, sin «+»)', () => {
  it('«51912944096» → +51912944096; acepta cualquier país', () => {
    expect(normalizarTelefonoWhatsApp('51912944096')).toBe('+51912944096')
    expect(normalizarTelefonoWhatsApp('15551234567')).toBe('+15551234567')
  })
  it('basura → null', () => {
    expect(normalizarTelefonoWhatsApp('')).toBeNull()
    expect(normalizarTelefonoWhatsApp('1234')).toBeNull()
    expect(normalizarTelefonoWhatsApp('0511234567')).toBeNull()
    expect(normalizarTelefonoWhatsApp(null)).toBeNull()
  })
})

describe('clientes: nombre y tamaño habitual', () => {
  it('claveNombreCliente ignora mayúsculas, tildes, espacios y puntuación', () => {
    expect(claveNombreCliente('Mirtha - Huánuco')).toBe('mirtha huanuco')
    expect(claveNombreCliente('  MIRTHA   HUANUCO ')).toBe('mirtha huanuco')
    expect(claveNombreCliente('EST. LIMA - CENTRO CIVICO')).toBe('est lima centro civico')
    expect(claveNombreCliente('COLINA2')).not.toBe(claveNombreCliente('COLINA'))
  })
  it('tamanoHabitualDesdeCodigo: GR → Grande, MED → Mediana, otra cosa → null', () => {
    expect(tamanoHabitualDesdeCodigo('GR')).toBe('Grande')
    expect(tamanoHabitualDesdeCodigo(' med ')).toBe('Mediana')
    expect(tamanoHabitualDesdeCodigo('')).toBeNull()
    expect(tamanoHabitualDesdeCodigo('XL')).toBeNull()
    expect(tamanoHabitualDesdeCodigo(undefined)).toBeNull()
  })
})

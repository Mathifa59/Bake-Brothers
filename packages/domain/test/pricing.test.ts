import { describe, it, expect } from 'vitest'
import { precioPorTamano, calcularPrecioLinea, calcularSubtotal } from '../src/index.js'

// Producto de referencia: torta de chocolate, precio base S/76 (de mock.js).
const BASE = 76

describe('precio por tamaño', () => {
  it('Personal usa el precio base intacto', () => {
    expect(precioPorTamano(BASE, 'Personal')).toBe(76)
  })

  it('sin tamaño (producto que no acepta tamaños) usa el precio base', () => {
    expect(precioPorTamano(BASE, null)).toBe(76)
    expect(precioPorTamano(BASE)).toBe(76)
  })

  it('Mediano multiplica ×1.35 con redondeo (igual que la UI original)', () => {
    expect(precioPorTamano(BASE, 'Mediano')).toBe(Math.round(76 * 1.35)) // 103
  })

  it('Grande multiplica ×1.7 con redondeo', () => {
    expect(precioPorTamano(BASE, 'Grande')).toBe(Math.round(76 * 1.7)) // 129
  })

  it('redondea a favor del valor más cercano (caso con decimales)', () => {
    // 110 × 1.35 = 148.5 → 149 (red velvet Mediano)
    expect(precioPorTamano(110, 'Mediano')).toBe(149)
  })
})

describe('precio de línea (tamaño + extras)', () => {
  it('sin extras equivale al precio por tamaño', () => {
    expect(calcularPrecioLinea({ precioBase: BASE, tamano: 'Personal' })).toBe(76)
  })

  it('cada extra suma S/8', () => {
    expect(calcularPrecioLinea({ precioBase: BASE, tamano: 'Personal', cantidadExtras: 1 })).toBe(84)
    expect(calcularPrecioLinea({ precioBase: BASE, tamano: 'Personal', cantidadExtras: 3 })).toBe(100)
  })

  it('combina tamaño y extras: Grande + 2 extras', () => {
    expect(calcularPrecioLinea({ precioBase: BASE, tamano: 'Grande', cantidadExtras: 2 })).toBe(129 + 16)
  })

  it('acepta un precio de extra distinto (config por tenant)', () => {
    expect(calcularPrecioLinea({ precioBase: BASE, cantidadExtras: 2, precioExtra: 5 })).toBe(86)
  })

  it('acepta precios individuales de extras leídos de la BD', () => {
    expect(calcularPrecioLinea({ precioBase: BASE, tamano: 'Personal', preciosExtras: [8, 8, 10] })).toBe(102)
    expect(calcularPrecioLinea({ precioBase: BASE, preciosExtras: [] })).toBe(76)
  })
})

describe('precio de tamaño real (catálogo 0006, sin relación de factor)', () => {
  it('precioTamano informado gana sobre el cálculo por factor', () => {
    // Torta de Chocolate con Manjar: precio_base 8.90 (individual), Familiar 24cm 79.90 —
    // no hay factor consistente entre esos dos valores, por eso el catálogo real
    // manda el precio absoluto de product_sizes.precio.
    expect(precioPorTamano(8.9, 'Familiar 24cm', 79.9)).toBe(79.9)
  })

  it('sin precioTamano, cae al cálculo por factor (compatibilidad con productos legados)', () => {
    expect(precioPorTamano(BASE, 'Mediano', null)).toBe(Math.round(76 * 1.35))
  })

  it('calcularPrecioLinea usa precioTamano + extras', () => {
    expect(
      calcularPrecioLinea({ precioBase: 8.9, tamano: 'Familiar 24cm', precioTamano: 79.9, cantidadExtras: 1 })
    ).toBe(87.9)
  })
})

describe('subtotal', () => {
  it('suma precio de línea × cantidad', () => {
    expect(
      calcularSubtotal([
        { precioLinea: 84, cantidad: 2 },
        { precioLinea: 20, cantidad: 1 },
      ])
    ).toBe(188)
  })

  it('carrito vacío = 0', () => {
    expect(calcularSubtotal([])).toBe(0)
  })
})

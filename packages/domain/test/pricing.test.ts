import { describe, it, expect } from 'vitest'
import {
  precioPorTamano,
  calcularPrecioLinea,
  calcularSubtotal,
  calcularDescuentoCupon,
  calcularDelivery,
  calcularTotales,
} from '../src/index.js'

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

describe('cupón', () => {
  const BAKE10 = { tipo: 'porcentaje' as const, valor: 10 }

  it('BAKE10 descuenta 10% redondeado a céntimos', () => {
    expect(calcularDescuentoCupon(100, BAKE10)).toBe(10)
    expect(calcularDescuentoCupon(76, BAKE10)).toBe(7.6)
    // 76.55 × 0.1 = 7.655 → 7.66 (mismo redondeo que la UI original)
    expect(calcularDescuentoCupon(76.55, BAKE10)).toBe(7.66)
  })

  it('sin cupón no descuenta nada', () => {
    expect(calcularDescuentoCupon(100, null)).toBe(0)
  })

  it('cupón de monto fijo nunca supera el subtotal', () => {
    expect(calcularDescuentoCupon(30, { tipo: 'monto_fijo', valor: 50 })).toBe(30)
    expect(calcularDescuentoCupon(100, { tipo: 'monto_fijo', valor: 50 })).toBe(50)
  })
})

describe('delivery', () => {
  it('cuesta S/12 por debajo del umbral', () => {
    expect(calcularDelivery({ subtotalConDescuento: 149.99, hayItems: true })).toBe(12)
  })

  it('es gratis exactamente en S/150 (>=, igual que la UI original)', () => {
    expect(calcularDelivery({ subtotalConDescuento: 150, hayItems: true })).toBe(0)
  })

  it('es gratis por encima de S/150', () => {
    expect(calcularDelivery({ subtotalConDescuento: 200, hayItems: true })).toBe(0)
  })

  it('es 0 con carrito vacío', () => {
    expect(calcularDelivery({ subtotalConDescuento: 0, hayItems: false })).toBe(0)
  })

  it('el umbral se evalúa DESPUÉS del descuento del cupón', () => {
    // subtotal 160, cupón 10% → 144 con descuento → ya no alcanza delivery gratis
    expect(calcularDelivery({ subtotalConDescuento: 144, hayItems: true })).toBe(12)
  })

  it('acepta tarifa por zona (config por tenant)', () => {
    expect(calcularDelivery({ subtotalConDescuento: 50, hayItems: true, tarifaDelivery: 15 })).toBe(15)
  })
})

describe('totales completos', () => {
  const BAKE10 = { tipo: 'porcentaje' as const, valor: 10 }

  it('replica el caso real: torta Mediano + 1 extra, sin cupón', () => {
    // 76 × 1.35 = 102.6 → 103; +8 extra = 111
    const t = calcularTotales({ lineas: [{ precioLinea: 111, cantidad: 1 }] })
    expect(t).toEqual({ subtotal: 111, descuentoCupon: 0, delivery: 12, total: 123 })
  })

  it('con BAKE10 y delivery gratis', () => {
    // subtotal 200 → desc 20 → 180 >= 150 → delivery gratis → total 180
    const t = calcularTotales({ lineas: [{ precioLinea: 100, cantidad: 2 }], cupon: BAKE10 })
    expect(t).toEqual({ subtotal: 200, descuentoCupon: 20, delivery: 0, total: 180 })
  })

  it('el cupón puede quitar el delivery gratis (caso borde)', () => {
    // subtotal 155 → desc 15.5 → 139.5 < 150 → delivery 12
    const t = calcularTotales({ lineas: [{ precioLinea: 155, cantidad: 1 }], cupon: BAKE10 })
    expect(t).toEqual({ subtotal: 155, descuentoCupon: 15.5, delivery: 12, total: 151.5 })
  })

  it('recojo en tienda: tarifa 0 explícita', () => {
    const t = calcularTotales({ lineas: [{ precioLinea: 50, cantidad: 1 }], tarifaDelivery: 0 })
    expect(t.delivery).toBe(0)
    expect(t.total).toBe(50)
  })

  it('el total nunca es negativo', () => {
    const t = calcularTotales({
      lineas: [{ precioLinea: 10, cantidad: 1 }],
      cupon: { tipo: 'monto_fijo', valor: 999 },
      tarifaDelivery: 0,
    })
    expect(t.total).toBe(0)
  })

  it('carrito vacío: todo en 0', () => {
    expect(calcularTotales({ lineas: [] })).toEqual({
      subtotal: 0,
      descuentoCupon: 0,
      delivery: 0,
      total: 0,
    })
  })
})

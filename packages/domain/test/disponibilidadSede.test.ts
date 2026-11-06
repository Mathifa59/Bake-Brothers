import { describe, expect, it } from 'vitest'
import { productoDisponibleEnSede, type FilaStockSede } from '../src/index.js'

const CEDROS = 'sede-cedros'
const SM = 'sede-santa-marina'
const SEDES = [CEDROS, SM]
const TALLA_A = 'size-a'
const TALLA_B = 'size-b'

const fila = (sedeId: string, over: Partial<FilaStockSede> = {}): FilaStockSede => ({
  sedeId,
  productSizeId: null,
  disponible: true,
  cantidad: null,
  ...over,
})

const consulta = (over: Partial<Parameters<typeof productoDisponibleEnSede>[0]> = {}) => ({
  productSizeId: null,
  cantidad: 1,
  sedeId: CEDROS as string | null,
  sedesActivas: SEDES,
  filas: [] as FilaStockSede[],
  ...over,
})

describe('productoDisponibleEnSede — con sede conocida', () => {
  it('sin fila de stock = disponible (así funciona Stock.jsx)', () => {
    expect(productoDisponibleEnSede(consulta())).toEqual({ disponible: true, enSedes: SEDES })
  })

  it('agotado en esa sede → no se vende, y dice dónde sí', () => {
    const r = productoDisponibleEnSede(consulta({ filas: [fila(CEDROS, { disponible: false })] }))
    expect(r).toMatchObject({ disponible: false, motivo: 'agotado', enSedes: [SM] })
  })

  it('agotado en OTRA sede no afecta a esta', () => {
    const r = productoDisponibleEnSede(consulta({ filas: [fila(SM, { disponible: false })] }))
    expect(r.disponible).toBe(true)
  })

  it('con conteo: alcanza → se vende; no alcanza → bloquea e informa lo que queda', () => {
    const filas = [fila(CEDROS, { cantidad: 3 })]
    expect(productoDisponibleEnSede(consulta({ filas, cantidad: 3 })).disponible).toBe(true)
    const r = productoDisponibleEnSede(consulta({ filas, cantidad: 4 }))
    expect(r).toMatchObject({ disponible: false, motivo: 'cantidad_insuficiente', cantidadDisponible: 3 })
  })

  it('conteo en 0 con disponible = true también bloquea (no hay unidades)', () => {
    const r = productoDisponibleEnSede(consulta({ filas: [fila(CEDROS, { cantidad: 0 })] }))
    expect(r).toMatchObject({ disponible: false, motivo: 'cantidad_insuficiente', cantidadDisponible: 0 })
  })

  it('sin conteo (cantidad null) nunca bloquea por cantidad, por grande que sea el pedido', () => {
    expect(productoDisponibleEnSede(consulta({ filas: [fila(CEDROS)], cantidad: 500 })).disponible).toBe(true)
  })

  it('el stock es por tamaño: agotar un tamaño no agota el otro', () => {
    const filas = [fila(CEDROS, { productSizeId: TALLA_A, disponible: false })]
    expect(productoDisponibleEnSede(consulta({ filas, productSizeId: TALLA_A })).disponible).toBe(false)
    expect(productoDisponibleEnSede(consulta({ filas, productSizeId: TALLA_B })).disponible).toBe(true)
  })

  it('la fila de un tamaño no cuenta para el producto sin tamaño', () => {
    expect(
      productoDisponibleEnSede(consulta({ filas: [fila(CEDROS, { productSizeId: TALLA_A, disponible: false })] })).disponible
    ).toBe(true)
  })

  it('una fila del producto entero (sin tamaño) agotada cubre TODOS sus tamaños — caso BB-2491', () => {
    const filas = [fila(CEDROS, { disponible: false })]
    expect(productoDisponibleEnSede(consulta({ filas, productSizeId: TALLA_A }))).toMatchObject({ disponible: false, motivo: 'agotado', enSedes: [SM] })
    expect(productoDisponibleEnSede(consulta({ filas, productSizeId: TALLA_B })).disponible).toBe(false)
    // …solo en la sede donde está agotada.
    expect(productoDisponibleEnSede(consulta({ filas, productSizeId: TALLA_A, sedeId: SM })).disponible).toBe(true)
  })

  it('producto entero agotado gana sobre la fila de un tamaño que dice disponible', () => {
    const filas = [fila(CEDROS, { disponible: false }), fila(CEDROS, { productSizeId: TALLA_A, disponible: true })]
    expect(productoDisponibleEnSede(consulta({ filas, productSizeId: TALLA_A })).disponible).toBe(false)
  })

  it('un tamaño sin fila propia hereda el conteo de la fila del producto; con fila propia manda la suya', () => {
    const conteoProducto = [fila(CEDROS, { cantidad: 2 })]
    expect(productoDisponibleEnSede(consulta({ filas: conteoProducto, productSizeId: TALLA_A, cantidad: 3 }))).toMatchObject({
      disponible: false,
      motivo: 'cantidad_insuficiente',
      cantidadDisponible: 2,
    })
    const conFilaPropia = [...conteoProducto, fila(CEDROS, { productSizeId: TALLA_A, cantidad: 10 })]
    expect(productoDisponibleEnSede(consulta({ filas: conFilaPropia, productSizeId: TALLA_A, cantidad: 3 })).disponible).toBe(true)
  })

  it('el producto entero agotado sin sede conocida: se acepta si alguna sede lo tiene', () => {
    const filas = [fila(CEDROS, { disponible: false })]
    expect(productoDisponibleEnSede(consulta({ filas, productSizeId: TALLA_A, sedeId: null }))).toEqual({ disponible: true, enSedes: [SM] })
  })

  it('una cantidad menor a 1 se trata como 1', () => {
    expect(productoDisponibleEnSede(consulta({ filas: [fila(CEDROS, { cantidad: 0 })], cantidad: 0 })).disponible).toBe(false)
  })
})

describe('productoDisponibleEnSede — sin sede (delivery del bot, web)', () => {
  const sinSede = { sedeId: null }

  it('si alguna sede lo tiene, se acepta', () => {
    const r = productoDisponibleEnSede(consulta({ ...sinSede, filas: [fila(CEDROS, { disponible: false })] }))
    expect(r).toEqual({ disponible: true, enSedes: [SM] })
  })

  it('agotado en TODAS las sedes activas → se rechaza', () => {
    const r = productoDisponibleEnSede(
      consulta({ ...sinSede, filas: [fila(CEDROS, { disponible: false }), fila(SM, { disponible: false })] })
    )
    expect(r).toMatchObject({ disponible: false, motivo: 'agotado', enSedes: [] })
  })

  it('una sede agotada y la otra sin unidades suficientes → rechaza por cantidad', () => {
    const r = productoDisponibleEnSede(
      consulta({ ...sinSede, cantidad: 5, filas: [fila(CEDROS, { disponible: false }), fila(SM, { cantidad: 2 })] })
    )
    expect(r).toMatchObject({ disponible: false, motivo: 'cantidad_insuficiente' })
  })

  it('una sede sin unidades alcanza si la otra sí puede', () => {
    const r = productoDisponibleEnSede(
      consulta({ ...sinSede, cantidad: 5, filas: [fila(CEDROS, { cantidad: 2 }), fila(SM, { cantidad: 9 })] })
    )
    expect(r).toEqual({ disponible: true, enSedes: [SM] })
  })

  it('ignora filas de sedes que ya no están activas', () => {
    const r = productoDisponibleEnSede(
      consulta({ ...sinSede, filas: [fila('sede-cerrada', { disponible: false }), fila(CEDROS, { disponible: false })] })
    )
    expect(r.disponible).toBe(true)
  })

  it('sin sedes activas no hay nada que contradiga: disponible', () => {
    expect(productoDisponibleEnSede(consulta({ ...sinSede, sedesActivas: [], filas: [] })).disponible).toBe(true)
  })
})

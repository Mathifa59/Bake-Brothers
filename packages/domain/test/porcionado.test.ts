import { describe, expect, it } from 'vitest'
import { planearPorcionado, planearReversion, puedePorcionar, reglaDeTamano } from '../src/index.js'

const con = (cantidad: number | null) => ({ existe: true, cantidad })
const sinFila = { existe: false, cantidad: null }

describe('porcionado: cuánto se resta y cuánto se suma', () => {
  it('2 enteras de 12 porciones: −2 enteras, +24 porciones, y lo que quedará', () => {
    expect(planearPorcionado({ enteras: 2, rendimiento: 12, entero: con(5), porcion: con(6) })).toEqual({
      ok: true,
      porcionesGeneradas: 24,
      enterasQuedan: 3,
      porcionesQuedan: 30,
    })
  })

  it('si la fila de porciones todavía no existe, se crea con lo porcionado', () => {
    const r = planearPorcionado({ enteras: 1, rendimiento: 10, entero: con(1), porcion: sinFila })
    expect(r).toMatchObject({ ok: true, porcionesGeneradas: 10, enterasQuedan: 0, porcionesQuedan: 10 })
  })

  it('no deja porcionar más de lo que hay', () => {
    const r = planearPorcionado({ enteras: 3, rendimiento: 12, entero: con(2), porcion: con(0) })
    expect(r).toMatchObject({ ok: false, error: 'STOCK_INSUFICIENTE' })
  })

  it('sin conteo de enteras (fila inexistente o sin cantidad) no se porciona', () => {
    expect(planearPorcionado({ enteras: 1, rendimiento: 12, entero: sinFila, porcion: sinFila })).toMatchObject({ ok: false, error: 'SIN_CONTEO_ENTERO' })
    expect(planearPorcionado({ enteras: 1, rendimiento: 12, entero: con(null), porcion: sinFila })).toMatchObject({ ok: false, error: 'SIN_CONTEO_ENTERO' })
  })

  it('si las porciones existen pero no llevan conteo, no se mezcla «no se cuenta» con un número', () => {
    expect(planearPorcionado({ enteras: 1, rendimiento: 12, entero: con(4), porcion: con(null) })).toMatchObject({ ok: false, error: 'SIN_CONTEO_PORCION' })
  })

  it('cantidades inválidas', () => {
    for (const enteras of [0, -1, 1.5, 201, Number.NaN]) {
      expect(planearPorcionado({ enteras, rendimiento: 12, entero: con(500), porcion: con(0) }), String(enteras)).toMatchObject({ ok: false, error: 'CANTIDAD_INVALIDA' })
    }
    expect(planearPorcionado({ enteras: 1, rendimiento: 0, entero: con(5), porcion: con(0) })).toMatchObject({ ok: false, error: 'CANTIDAD_INVALIDA' })
  })

  it('porcionar todas las enteras deja el conteo en 0', () => {
    expect(planearPorcionado({ enteras: 4, rendimiento: 12, entero: con(4), porcion: con(1) })).toMatchObject({ ok: true, enterasQuedan: 0, porcionesQuedan: 49 })
  })
})

describe('revertir un porcionado', () => {
  it('devuelve las enteras y quita las porciones', () => {
    expect(planearReversion({ enteras: 2, porcionesGeneradas: 24, entero: con(3), porcion: con(30) })).toEqual({ ok: true, enterasQuedan: 5, porcionesQuedan: 6 })
  })

  it('se bloquea (y dice cuántas faltan) si las porciones ya no están', () => {
    const r = planearReversion({ enteras: 2, porcionesGeneradas: 24, entero: con(3), porcion: con(10) })
    expect(r).toMatchObject({ ok: false, error: 'PORCIONES_INSUFICIENTES' })
    expect((r as { detalle: string }).detalle).toMatch(/faltan 14/)
    expect(planearReversion({ enteras: 2, porcionesGeneradas: 24, entero: con(3), porcion: sinFila })).toMatchObject({ ok: false, error: 'PORCIONES_INSUFICIENTES' })
  })

  it('sin conteo de enteras no se pueden devolver', () => {
    expect(planearReversion({ enteras: 2, porcionesGeneradas: 24, entero: con(null), porcion: con(30) })).toMatchObject({ ok: false, error: 'SIN_CONTEO_ENTERO' })
  })
})

describe('quién puede porcionar', () => {
  it('Administración sin ser Encargado; Caja solo si es Encargado; el resto nunca', () => {
    expect(puedePorcionar(['administracion'], false)).toBe(true)
    expect(puedePorcionar(['caja'], true)).toBe(true)
    expect(puedePorcionar(['caja'], false)).toBe(false)
    expect(puedePorcionar(['empleado_temporal'], true)).toBe(true)
    for (const p of ['venta_digital', 'ordenes', 'produccion'] as const) expect(puedePorcionar([p], true), p).toBe(false)
    expect(puedePorcionar([], true)).toBe(false)
    expect(puedePorcionar(null, true)).toBe(false)
  })
})

describe('botón «Porcionar» por tamaño', () => {
  const reglas = [
    { id: 'r1', size_entero_id: 'familiar', size_porcion_id: 'individual', porciones: 12, activo: true },
    { id: 'r2', size_entero_id: 'otro', size_porcion_id: 'individual', porciones: 8, activo: false },
  ]
  it('solo el tamaño con regla activa; las minis y las reglas apagadas no lo muestran', () => {
    expect(reglaDeTamano(reglas, 'familiar')?.porciones).toBe(12)
    expect(reglaDeTamano(reglas, 'mini')).toBeNull()
    expect(reglaDeTamano(reglas, 'otro')).toBeNull()
    expect(reglaDeTamano(null, 'familiar')).toBeNull()
  })
})

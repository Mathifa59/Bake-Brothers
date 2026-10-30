import { describe, it, expect } from 'vitest'
import { evaluarPagoReportado, type ExtraccionPago } from '../src/pagoReportado.js'

const HOY = '2026-10-30'
const buena: ExtraccionPago = {
  esComprobante: true,
  legible: true,
  monto: 25.9,
  moneda: 'PEN',
  fecha: '2026-10-30',
  numeroOperacion: '123456789',
  medio: 'yape',
}
const evaluar = (extra: Partial<ExtraccionPago> = {}, total = 25.9, operacionRepetida = false) =>
  evaluarPagoReportado({ total, hoyISO: HOY, extraccion: { ...buena, ...extra }, operacionRepetida })

describe('evaluarPagoReportado', () => {
  it('un comprobante legible, del monto exacto, de hoy y con número de operación NO requiere revisión', () => {
    expect(evaluar()).toEqual({ coincideTotal: true, requiereRevision: false, motivos: [] })
  })

  it('tolera un céntimo de diferencia, pero no más', () => {
    expect(evaluar({ monto: 25.91 }).coincideTotal).toBe(true)
    const r = evaluar({ monto: 25.5 })
    expect(r.coincideTotal).toBe(false)
    expect(r.requiereRevision).toBe(true)
    expect(r.motivos[0]).toMatch(/S\/ 25\.50.*no coincide.*S\/ 25\.90/)
  })

  it('un monto distinto (de menos o de más) se marca para revisión', () => {
    expect(evaluar({ monto: 10 }).requiereRevision).toBe(true)
    expect(evaluar({ monto: 100 }).requiereRevision).toBe(true)
  })

  it('sin monto legible: coincideTotal es null (no se sabe) y requiere revisión', () => {
    const r = evaluar({ monto: null })
    expect(r.coincideTotal).toBeNull()
    expect(r.requiereRevision).toBe(true)
    expect(r.motivos).toContain('No se pudo leer el monto.')
  })

  it('una imagen que no es un comprobante, o que no se lee, requiere revisión', () => {
    expect(evaluar({ esComprobante: false }).motivos[0]).toMatch(/no parece un comprobante/)
    expect(evaluar({ legible: false }).motivos[0]).toMatch(/no se lee con claridad/)
  })

  it('sin número de operación, o con uno que ya se usó en otro pedido, requiere revisión', () => {
    expect(evaluar({ numeroOperacion: null }).motivos).toContain('No se leyó el número de operación.')
    const repetida = evaluar({}, 25.9, true)
    expect(repetida.requiereRevision).toBe(true)
    expect(repetida.motivos[0]).toMatch(/123456789 ya aparece en otro pedido/)
  })

  it('la fecha: de hoy y ayer valen; muy antigua, futura o ilegible se revisa', () => {
    expect(evaluar({ fecha: '2026-10-29' }).requiereRevision).toBe(false)
    expect(evaluar({ fecha: '2026-10-27' }).requiereRevision).toBe(false) // 3 días: el límite
    expect(evaluar({ fecha: '2026-10-26' }).motivos[0]).toMatch(/antigua/)
    expect(evaluar({ fecha: '2026-11-15' }).motivos[0]).toMatch(/futura/)
    expect(evaluar({ fecha: null }).motivos).toContain('No se leyó la fecha.')
  })

  it('una moneda distinta de soles requiere revisión (aunque el número coincida)', () => {
    expect(evaluar({ moneda: 'USD' }).motivos[0]).toMatch(/USD/)
    expect(evaluar({ moneda: 'pen' }).requiereRevision).toBe(false)
  })

  it('junta TODOS los motivos, no solo el primero', () => {
    const r = evaluar({ monto: 10, numeroOperacion: null, fecha: null })
    expect(r.motivos.length).toBe(3)
  })
})

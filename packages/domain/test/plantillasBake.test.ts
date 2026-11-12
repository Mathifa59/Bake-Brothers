// Valida docs/plantillas-whatsapp.json (la lista que se crea en Meta) contra las reglas de Meta y comprueba que el panel
// (normalizarPlantillaMeta + completarPlantilla) puede enviar cada una tal como Meta la devolverá. Si se edita un texto
// y rompe una regla, este test falla antes de crearla en Meta (una plantilla creada no se puede editar).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { completarPlantilla, normalizarPlantillaMeta, variablesDeTexto } from '../src/index.js'

interface PlantillaDoc {
  nombre: string
  grupo: 'esencial' | 'opcional'
  categoria: string
  idioma: string
  cuerpo: string
  variables: { n: number; que_lleva: string; ejemplo: string }[]
}
const { plantillas } = JSON.parse(readFileSync(new URL('../../../docs/plantillas-whatsapp.json', import.meta.url), 'utf8')) as {
  plantillas: PlantillaDoc[]
}

describe('plantillas de Bake Brothers para Meta', () => {
  it('hay plantillas y los nombres no se repiten', () => {
    expect(plantillas.length).toBeGreaterThanOrEqual(9)
    expect(new Set(plantillas.map((p) => p.nombre)).size).toBe(plantillas.length)
  })

  describe.each(plantillas.map((p) => [p.nombre, p] as const))('%s', (_n, p) => {
    it('nombre, categoría e idioma válidos', () => {
      expect(p.nombre).toMatch(/^[a-z0-9_]{1,512}$/)
      expect(['UTILITY', 'MARKETING']).toContain(p.categoria)
      expect(p.categoria).toBe('UTILITY')
      expect(p.idioma).toBe('es')
    })

    it('cumple las reglas de Meta para el cuerpo', () => {
      const t = p.cuerpo
      expect(t.length).toBeLessThanOrEqual(1024)
      expect(t.trim()).toBe(t)
      expect(t).not.toMatch(/^\{\{\d+\}\}/) // no empieza con una variable
      expect(t).not.toMatch(/\{\{\d+\}\}[.!?¡¿\s]*$/) // no termina con una variable
      expect(t).not.toMatch(/\{\{\d+\}\}\s*\{\{\d+\}\}/) // dos variables pegadas
      expect(t).not.toMatch(/\n{3,}/) // más de dos saltos seguidos
      expect(t).not.toMatch(/ {4,}/)
      // las variables son {{1}}…{{n}}, en orden y sin saltos
      const nombres = variablesDeTexto(t)
      expect(nombres).toEqual(p.variables.map((v) => String(v.n)))
      expect(nombres).toEqual(nombres.map((_, i) => String(i + 1)))
      // Meta rechaza textos demasiado cortos para sus variables: al menos 3 palabras de texto por variable
      const palabras = t.replace(/\{\{\d+\}\}/g, ' ').split(/\s+/).filter((w) => /[A-Za-zÁÉÍÓÚáéíóúñÑ]/.test(w)).length
      expect(palabras).toBeGreaterThanOrEqual(3 * p.variables.length)
    })

    it('cada variable tiene un ejemplo sin saltos de línea ni tabuladores', () => {
      for (const v of p.variables) {
        expect(v.ejemplo.trim().length, `ejemplo de {{${v.n}}}`).toBeGreaterThan(0)
        expect(v.ejemplo).not.toMatch(/[\n\r\t]/)
        expect(v.que_lleva.length).toBeGreaterThan(0)
      }
    })

    it('tuteo peruano: nada de voseo', () => {
      expect(p.cuerpo).not.toMatch(/(?<![A-Za-zÁÉÍÓÚáéíóúñ])(vos|sos|tenés|querés|podés|mirá|escribí|avisá|fijate)(?![A-Za-zÁÉÍÓÚáéíóúñ])/i)
    })

    it('el panel la puede enviar tal como Meta la devolverá (idioma y variables incluidos)', () => {
      const deMeta = {
        name: p.nombre, language: p.idioma, status: 'APPROVED', category: p.categoria, parameter_format: 'POSITIONAL',
        components: [{ type: 'BODY', text: p.cuerpo, example: { body_text: [p.variables.map((v) => v.ejemplo)] } }],
      }
      const norm = normalizarPlantillaMeta(deMeta)!
      expect(norm.soportada).toBe(true)
      expect(norm.variables.map((v) => v.ejemplo)).toEqual(p.variables.map((v) => v.ejemplo))
      const valores = Object.fromEntries(norm.variables.map((v) => [v.clave, v.ejemplo ?? '']))
      const r = completarPlantilla(norm, valores)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.texto).not.toContain('{{')
      expect(r.texto).toContain(p.variables[0].ejemplo)
      expect(r.componentes[0].parameters).toHaveLength(p.variables.length)
    })
  })

  it('las esenciales son las que se crean primero (9)', () => {
    expect(plantillas.filter((p) => p.grupo === 'esencial').map((p) => p.nombre)).toEqual([
      'pedido_confirmado', 'pago_confirmado', 'pago_pendiente', 'envio_cotizado', 'pedido_listo_para_recoger',
      'pedido_en_camino', 'recordatorio_entrega', 'seguimiento_consulta', 'pedido_entregado',
    ])
  })
})

// El cliente es peruano: el bot y el dashboard hablan de "tú", nunca con voseo
// argentino ("podés", "tenés", "elegí", "llamá"...). El 2026-10-13 el simulador
// respondía "podés"/"pagás" porque el propio prompt estaba escrito con voseo y el
// modelo lo imitaba. Este test recorre el código que genera texto para personas
// (prompt y herramientas del bot, API y dashboard) y falla si vuelve a aparecer.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const RAIZ = resolve(import.meta.dirname, '../..')
const CARPETAS = [join(RAIZ, 'api/src'), join(RAIZ, 'admin/src')]

// Formas voseantes (verbo conjugado o imperativo + pronombre "vos"). "Pedí" (pretérito de
// "yo pedí") y palabras como "está" o "maracuyá" no son voseo y no están acá.
// OJO: en JavaScript `\b` no entiende las tildes ("avisándole" contiene "avisá"), por eso los
// límites son lookarounds de letras en vez de `\b`.
const L = 'a-záéíóúüñ'
const VOSEO = new RegExp(
  `(?<![${L}])(` +
    [
      'vos', 'sos', 'podés', 'tenés', 'sabés', 'querés', 'necesitás', 'pagás', 'hablás', 'elegís', 'decís', 'ponés',
      'llamá', 'usá', 'respondé', 'preguntá', 'escalá', 'seguí', 'ofrecé', 'mostrá', 'marcá', 'juntá', 'identificá',
      'escribí', 'elegí', 'anotá', 'admití', 'mirá', 'hacé', 'tené', 'vení', 'andá', 'probá', 'esperá', 'avisá',
      'contá', 'dejá', 'confirmá', 'revisá', 'cargá', 'guardá', 'buscá', 'agregá', 'borrá', 'cambiá', 'ingresá',
      'avisale', 'contale', 'ofrecele', 'mostrale', 'decile', 'decilo', 'pedile', 'pedíselo', 'preguntale', 'pasalo', 'usala',
      'dejame', 'avisame', 'contame', 'mandame', 'fijate', 'acordate',
    ].join('|') +
    `)(?![${L}])`,
  'i'
)

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) return archivos(ruta)
    return /\.(ts|tsx|js|jsx)$/.test(nombre) ? [ruta] : []
  })
}

describe('tuteo peruano (sin voseo) en el bot y el dashboard', () => {
  const todos = CARPETAS.flatMap(archivos)

  it('encuentra el código a revisar', () => {
    expect(todos.length).toBeGreaterThan(50)
    expect(todos.some((f) => f.endsWith('cerebro.ts'))).toBe(true)
  })

  it('el detector sí distingue: caza voseo y deja pasar tuteo y palabras parecidas', () => {
    for (const mal of ['Si podés venir', 'Elegí una opción', 'Llamá al local', 'pedile el teléfono', 'vos decidís']) {
      expect(VOSEO.test(mal), mal).toBe(true)
    }
    for (const bien of ['Si puedes venir', 'Elige una opción', 'avisándole al cliente', 'maracuyá', 'Pedí una torta ayer']) {
      expect(VOSEO.test(bien), bien).toBe(false)
    }
  })

  it('no hay formas de voseo en ningún texto ni comentario', () => {
    const hallazgos = todos.flatMap((f) =>
      readFileSync(f, 'utf-8')
        .split('\n')
        .flatMap((linea, i) => (VOSEO.test(linea) ? [`${f.slice(RAIZ.length + 1)}:${i + 1}: ${linea.trim().slice(0, 100)}`] : []))
    )
    expect(hallazgos).toEqual([])
  })
})

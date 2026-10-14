/**
 * Búsqueda por texto aproximado de productos/combos/ítems de catering, para
 * lo que escribe un cliente real ("1 caja de alfajores mix", "las empanadas
 * de carne", "un cheesecake de oreo").
 *
 * Antes era `nombre ilike '%<frase completa>%'`: la frase entera tenía que
 * estar dentro del nombre, así que "caja de alfajores mix" no encontraba
 * "Alfajor Mix" (plural, "caja de", cantidad) y el bot respondía que no
 * existía. Ahora se parte en palabras y se piden TODAS dentro del nombre, sin
 * importar tildes, mayúsculas, plural ni palabras de relleno. Es un
 * superconjunto de la búsqueda anterior: lo que antes coincidía sigue
 * coincidiendo.
 *
 * Dos juegos de patrones:
 *  - estrictos: todas las palabras (con cantidades y "caja"), para que
 *    "Pack 12 empanadas" no se confunda con "Pack 6 empanadas";
 *  - flexibles: sin cantidades ni palabras de empaque ("1 caja de alfajores
 *    mix" → alfajor + mix), para cuando el cliente agrega esas palabras.
 * Las coincidencias estrictas se ordenan primero.
 */

const RELLENO = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'con', 'para', 'por', 'en', 'al',
  'mi', 'me', 'quiero', 'quisiera', 'necesito', 'pedir', 'pido', 'dame', 'hay',
  'favor', 'porfa', 'gracias', 'hola', 'buenas', 'buenos', 'dias', 'tardes', 'noches',
])

// Palabras de empaque/cantidad que el cliente agrega pero que no suelen ser parte del nombre.
const EMPAQUE = new Set(['caja', 'paquete', 'unidad', 'porcion'])

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

function singular(t: string): string {
  if (t.length > 5 && t.endsWith('es')) return t.slice(0, -2) // alfajores → alfajor, cheesecakes → cheesecak
  if (t.length > 3 && t.endsWith('s')) return t.slice(0, -1) // empanadas → empanada, pies → pie
  return t
}

export interface BusquedaTexto {
  /** Patrones LIKE (`%palabra%`): TODOS deben aparecer en el nombre normalizado. */
  estrictos: string[]
  /** Igual, sin cantidades ni palabras de empaque. Vacío si no aporta nada distinto. */
  flexibles: string[]
}

export function construirBusqueda(texto: string): BusquedaTexto {
  const normalizado = sinTildes(texto.toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim()
  const palabras = normalizado
    .split(' ')
    .filter((p) => p && !RELLENO.has(p))
    .map(singular)

  // Sin ninguna palabra útil: se cae a la frase tal cual (mismo comportamiento que antes).
  if (palabras.length === 0) return { estrictos: [`%${normalizado}%`], flexibles: [] }

  const estrictos = palabras.map((p) => `%${p}%`)
  const utiles = palabras.filter((p) => !/^\d+$/.test(p) && !EMPAQUE.has(p))
  const flexibles = utiles.length > 0 && utiles.length < palabras.length ? utiles.map((p) => `%${p}%`) : []
  return { estrictos, flexibles }
}

/** Expresión SQL con el nombre sin tildes ni mayúsculas (mismo criterio que construirBusqueda). */
export const sqlNormalizada = (columna: string) => `translate(lower(${columna}), 'áéíóúüñ', 'aeiouun')`

/** Condición SQL: coincide con todas las palabras (estrictas) o, si no, con las flexibles. Recibe los números de parámetro ($N) de cada array de patrones. */
export function sqlCoincide(columna: string, paramEstrictos: string, paramFlexibles: string): string {
  const n = sqlNormalizada(columna)
  return `(${n} like all (${paramEstrictos}::text[]) or (cardinality(${paramFlexibles}::text[]) > 0 and ${n} like all (${paramFlexibles}::text[])))`
}

/** Para ordenar: true si coincide con TODAS las palabras, incluidas cantidades y "caja". */
export const sqlCoincideEstricto = (columna: string, paramEstrictos: string) =>
  `(${sqlNormalizada(columna)} like all (${paramEstrictos}::text[]))`

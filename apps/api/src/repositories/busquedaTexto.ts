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
  // Preguntas de catálogo: "¿qué tipo de empanadas hay?", "¿qué sabores tienen?"
  'que', 'cual', 'cuales', 'como', 'cuanto', 'cuanta', 'cuantos', 'tipo', 'tipos', 'sabor', 'sabores',
  'opcion', 'opciones', 'variedad', 'variedades', 'tienen', 'tienes', 'venden', 'ofrecen', 'manejan',
  'algun', 'alguna', 'algo', 'otro', 'otra', 'busco', 'buscando',
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

// ---------------------------------------------------------------------------
// Tamaño dentro de la frase del cliente
// ---------------------------------------------------------------------------
// Un cliente real mezcla producto y tamaño en la misma frase: "carrot cake individual", "porción de
// cheesecake de fresa", "torta de chocolate familiar", "mini red velvet", "caja de alfajores de 18",
// "alfajores x10". El nombre del producto NO trae el tamaño (viene de product_sizes: "Individual",
// "Mini 16cm", "Familiar 24cm", "200g", "Caja x18"), así que antes la búsqueda exigía una palabra que no
// estaba en el nombre y respondía "no existe". Ahora se separa el tamaño del producto, se busca el
// producto con el resto de la frase y el tamaño se resuelve contra los reales de ESE producto.

export type ClaseTamano = 'individual' | 'mini' | 'familiar'

export interface TamanoPedido {
  clase: ClaseTamano | null
  /** Medidas o cantidades que dijo el cliente: "24cm" → 24, "x10" → 10, "de 18" → 18. */
  numeros: number[]
  /** Peso pedido en gramos: "500g" → 500, "un kilo" → 1000. */
  gramos: number | null
  /** Lo que dijo el cliente, tal cual lo entendimos ("mini", "x10"), para devolvérselo al modelo. */
  dicho: string
}

const normalizar = (texto: string) => sinTildes(texto.toLowerCase()).replace(/\s+/g, ' ').trim()

/**
 * Separa el tamaño de la frase. Devuelve la frase SIN las palabras de tamaño (normalizada) y el tamaño
 * entendido; si no hay ningún tamaño devuelve la frase original intacta y `tamano: null`.
 *
 * Solo se reconocen formas que no se confunden con una cantidad de producto: "x10", "de 18", "24 cm",
 * "500 g", "1 kilo", y las palabras individual / porción / personal, mini, familiar. Un "2" suelto
 * ("2 carrot cake") es cantidad, no tamaño.
 */
export function extraerTamano(texto: string): { texto: string; tamano: TamanoPedido | null } {
  let t = ` ${normalizar(texto)} `
  const dichos: string[] = []
  const numeros: number[] = []
  let gramos: number | null = null
  let clase: ClaseTamano | null = null

  const quitar = (re: RegExp, alCoincidir: (...grupos: string[]) => void) => {
    t = t.replace(re, (coincidencia: string, ...grupos: string[]) => {
      dichos.push(coincidencia.trim())
      alCoincidir(...grupos)
      return ' '
    })
  }

  quitar(/\bmedio kilo\b/g, () => {
    gramos = 500
  })
  quitar(/\b(\d+(?:[.,]\d+)?)\s*(?:kg|kilos?)\b/g, (n) => {
    gramos = Math.round(parseFloat(n.replace(',', '.')) * 1000)
  })
  quitar(/\b(?:un |uno )?kilo\b/g, () => {
    gramos = 1000
  })
  quitar(/\b(\d{2,4})\s*(?:g|gr|grs|gramos)\b/g, (n) => {
    gramos = Number(n)
  })
  quitar(/\b(\d{1,3})\s*cm\b/g, (n) => {
    numeros.push(Number(n))
  })
  quitar(/\bx\s?(\d{1,3})\b/g, (n) => {
    numeros.push(Number(n))
  })
  quitar(/\bde\s+(\d{1,3})\b/g, (n) => {
    numeros.push(Number(n))
  })
  quitar(/\b(?:individual(?:es)?|porcion(?:es)?|personal(?:es)?)\b/g, () => {
    clase ??= 'individual'
  })
  quitar(/\bminis?\b/g, () => {
    clase ??= 'mini'
  })
  quitar(/\bfamiliar(?:es)?\b/g, () => {
    clase ??= 'familiar'
  })

  if (dichos.length === 0) return { texto, tamano: null }
  return {
    texto: t.replace(/\s+/g, ' ').trim(),
    tamano: { clase, numeros, gramos, dicho: dichos.join(' ') },
  }
}

/** ¿Queda algún nombre de producto en la frase (algo más que relleno, cantidades o empaque)? */
export function tienePalabrasDeProducto(texto: string): boolean {
  return normalizar(texto)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .some((p) => p && !RELLENO.has(p) && !EMPAQUE.has(p) && !/^\d+$/.test(p))
}

interface EtiquetaAnalizada {
  clase: ClaseTamano | null
  numeros: number[]
  gramos: number | null
}

function analizarEtiqueta(etiqueta: string): EtiquetaAnalizada {
  const n = normalizar(etiqueta)
  const clase = /^(individual|mini|familiar)\b/.exec(n)?.[1] as ClaseTamano | undefined
  const numeros = [...n.matchAll(/(?<!\d)\d+(?!\d)/g)].map((m) => Number(m[0]))
  let gramos: number | null = null
  const kg = /(\d+(?:[.,]\d+)?)\s*kg\b/.exec(n)
  const g = /(\d+)\s*g\b/.exec(n)
  if (kg) gramos = Math.round(parseFloat(kg[1].replace(',', '.')) * 1000)
  else if (g) gramos = Number(g[1])
  return { clase: clase ?? null, numeros, gramos }
}

/**
 * Elige, entre los tamaños REALES de un producto, el que pidió el cliente. Devuelve la etiqueta exacta
 * ("Familiar 24cm") o null si ninguno calza o si calzan varios (nunca adivina entre dos).
 */
export function resolverTamano(pedido: TamanoPedido, etiquetas: string[]): string | null {
  if (pedido.clase === null && pedido.numeros.length === 0 && pedido.gramos === null) return null
  const coinciden = etiquetas.filter((etiqueta) => {
    const a = analizarEtiqueta(etiqueta)
    if (pedido.gramos !== null && a.gramos !== pedido.gramos) return false
    if (pedido.clase !== null && a.clase !== pedido.clase) return false
    return pedido.numeros.every((n) => a.numeros.includes(n))
  })
  return coinciden.length === 1 ? coinciden[0] : null
}

/** Igual que `resolverTamano`, partiendo de un texto: primero la etiqueta exacta ("Caja x10"), si no, lo que se entienda de él. */
export function resolverTamanoTexto(texto: string, etiquetas: string[]): string | null {
  const exacta = etiquetas.find((e) => normalizar(e) === normalizar(texto))
  if (exacta) return exacta
  const { tamano } = extraerTamano(texto)
  return tamano ? resolverTamano(tamano, etiquetas) : null
}

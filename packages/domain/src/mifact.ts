/**
 * Cruce del catálogo de productos que exporta Mifact (facturación) con el
 * catálogo propio. Lógica pura, sin I/O:
 *   1. `filasDesdeMatriz`: de las filas crudas del Excel a filas de Mifact limpias.
 *   2. `compararCatalogoMifact`: cruza por nombre y arma la lista de diferencias.
 *
 * Regla del cliente: NUNCA se cambia un precio ni un nombre automáticamente. Lo
 * único que se guarda es el código de Mifact en los productos que coinciden por
 * nombre de forma EXACTA; todo lo demás (precio o nombre distinto, productos que
 * están de un solo lado, coincidencias dudosas) se muestra para revisar a mano.
 */

// ── 1. Del Excel a filas ──────────────────────────────────────────────────

export interface FilaMifact {
  codigo: string
  nombre: string
  categoria: string | null
  /** Precio de venta (tal cual lo exporta Mifact; null si venía vacío o ilegible). */
  precio: number | null
  controlStock: string | null
  /** Almacenes en los que aparece. Mifact puede repetir el producto por almacén. */
  almacenes: string[]
  /** true si el mismo código aparece con precios distintos en distintas filas. */
  preciosDistintos: boolean
}

export interface LecturaExcelMifact {
  filas: FilaMifact[]
  /** Filas del Excel con datos (sin contar el encabezado) — antes de juntar los repetidos por almacén. */
  filasLeidas: number
  /** Filas descartadas por no tener código o nombre. */
  filasIncompletas: number
  /** Encabezados que se reconocieron, para mostrarlos y detectar un archivo equivocado. */
  columnas: { codigo: string; nombre: string; categoria?: string; precio?: string; controlStock?: string; almacen?: string }
  error?: string
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const claveEncabezado = (s: unknown) =>
  sinTildes(String(s ?? '').toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim()

const celda = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim())

/** "S/ 1,234.50", "12,90", 12.9, "12.90 soles" → número. null si no hay un número legible. */
export function parsearPrecio(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null
  const crudo = celda(valor)
  const desdeElPrimerDigito = crudo.slice(Math.max(0, crudo.search(/\d/)))
  // "S/. 1,234.50 soles." → "1,234.50" (sin símbolo de moneda, ni texto, ni puntos sueltos al borde)
  let s = desdeElPrimerDigito.replace(/[^\d.,]/g, '').replace(/[.,]+$/, '')
  if (!s || !/\d/.test(s)) return null
  const ultimaComa = s.lastIndexOf(',')
  const ultimoPunto = s.lastIndexOf('.')
  if (ultimaComa > -1 && ultimoPunto > -1) {
    // El separador decimal es el que aparece al final: "1.234,50" o "1,234.50".
    s = ultimaComa > ultimoPunto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (ultimaComa > -1) {
    // Solo comas: "12,90" decimal, "1,234" miles.
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

const ENCABEZADOS = {
  codigo: [/^codigo( de)? producto$/, /^cod(igo)?( de)? prod(ucto)?$/, /^codigo$/, /^cod$/, /^sku$/],
  nombre: [/^nombre( de)? producto$/, /^descripcion( de)? producto$/, /^nombre$/, /^descripcion$/, /^producto$/],
  categoria: [/^categoria$/, /^categoria( de)? producto$/, /^linea$/, /^familia$/],
  precio: [/^precio( de)? venta$/, /^precio venta$/, /^pvp$/, /^precio$/],
  controlStock: [/^control( de)? stock$/, /^controla stock$/],
  almacen: [/^almacen$/, /^almacenes$/],
} as const

function buscarColumna(encabezados: string[], patrones: readonly RegExp[]): number {
  for (const p of patrones) {
    const i = encabezados.findIndex((h) => p.test(h))
    if (i >= 0) return i
  }
  return -1
}

/**
 * Convierte las filas crudas del Excel (matriz de celdas) en filas de Mifact.
 * Busca la fila de encabezados entre las primeras 15 (los exports suelen traer
 * un título o datos de la empresa arriba), reconoce las columnas por nombre sin
 * importar tildes/mayúsculas, descarta filas sin código o nombre y junta las que
 * repiten un mismo código (un producto por almacén).
 */
export function filasDesdeMatriz(matriz: unknown[][]): LecturaExcelMifact {
  const vacia: LecturaExcelMifact = { filas: [], filasLeidas: 0, filasIncompletas: 0, columnas: { codigo: '', nombre: '' } }

  let filaEncabezado = -1
  let indices = { codigo: -1, nombre: -1, categoria: -1, precio: -1, controlStock: -1, almacen: -1 }
  for (let i = 0; i < Math.min(matriz.length, 15); i++) {
    const hs = (matriz[i] ?? []).map(claveEncabezado)
    const codigo = buscarColumna(hs, ENCABEZADOS.codigo)
    const nombre = buscarColumna(hs, ENCABEZADOS.nombre)
    if (codigo >= 0 && nombre >= 0 && codigo !== nombre) {
      filaEncabezado = i
      indices = {
        codigo,
        nombre,
        categoria: buscarColumna(hs, ENCABEZADOS.categoria),
        precio: buscarColumna(hs, ENCABEZADOS.precio),
        controlStock: buscarColumna(hs, ENCABEZADOS.controlStock),
        almacen: buscarColumna(hs, ENCABEZADOS.almacen),
      }
      break
    }
  }
  if (filaEncabezado < 0) {
    return {
      ...vacia,
      error:
        'No encontré las columnas CODIGO PRODUCTO y NOMBRE PRODUCTO en las primeras filas del archivo. ¿Es el Excel de productos que exporta Mifact?',
    }
  }

  const encabezadoCrudo = matriz[filaEncabezado] ?? []
  const nombreColumna = (i: number) => (i >= 0 ? celda(encabezadoCrudo[i]) : undefined)
  const columnas = {
    codigo: celda(encabezadoCrudo[indices.codigo]),
    nombre: celda(encabezadoCrudo[indices.nombre]),
    categoria: nombreColumna(indices.categoria),
    precio: nombreColumna(indices.precio),
    controlStock: nombreColumna(indices.controlStock),
    almacen: nombreColumna(indices.almacen),
  }

  const porCodigo = new Map<string, FilaMifact>()
  let filasLeidas = 0
  let filasIncompletas = 0
  for (const fila of matriz.slice(filaEncabezado + 1)) {
    if (!fila || fila.every((c) => celda(c) === '')) continue // fila totalmente vacía
    filasLeidas++
    const codigo = celda(fila[indices.codigo])
    const nombre = celda(fila[indices.nombre]).replace(/\s+/g, ' ')
    if (!codigo || !nombre) {
      filasIncompletas++
      continue
    }
    const precio = indices.precio >= 0 ? parsearPrecio(fila[indices.precio]) : null
    const almacen = indices.almacen >= 0 ? celda(fila[indices.almacen]) : ''
    const existente = porCodigo.get(codigo)
    if (existente) {
      if (almacen && !existente.almacenes.includes(almacen)) existente.almacenes.push(almacen)
      if (existente.precio === null) existente.precio = precio
      else if (precio !== null && Math.abs(precio - existente.precio) > 0.005) existente.preciosDistintos = true
      continue
    }
    porCodigo.set(codigo, {
      codigo,
      nombre,
      categoria: indices.categoria >= 0 ? celda(fila[indices.categoria]) || null : null,
      precio,
      controlStock: indices.controlStock >= 0 ? celda(fila[indices.controlStock]) || null : null,
      almacenes: almacen ? [almacen] : [],
      preciosDistintos: false,
    })
  }

  return { filas: [...porCodigo.values()], filasLeidas, filasIncompletas, columnas }
}

// ── 2. Cruce con nuestro catálogo ─────────────────────────────────────────

/** Algo vendible de nuestro catálogo: un producto sin tamaños, o un tamaño de un producto. */
export interface ItemCatalogo {
  tipo: 'producto' | 'tamano'
  id: string
  /** Nombre completo con el que se compara: "Alfajor Mix Caja x10" o "Chocoalfajor". */
  nombre: string
  precio: number | null
  codigoMifact: string | null
}

export interface Coincidencia {
  item: ItemCatalogo
  fila: FilaMifact
  /** exacta: mismo nombre (ignorando tildes/mayúsculas/signos) → se puede guardar el código. probable: parecido, solo para revisar. */
  confianza: 'exacta' | 'probable'
  puntaje: number
  precioDistinto: boolean
  /** Precio Mifact − precio nuestro (null si falta alguno). */
  diferenciaPrecio: number | null
  /** El nombre se escribe distinto (aunque calcen al comparar). */
  nombreDistinto: boolean
  /** El producto ya tenía código: 'igual' al de Mifact, 'distinto' (no se pisa), o null si no tenía. */
  codigoActual: 'igual' | 'distinto' | null
}

export interface AmbiguaMifact {
  fila: FilaMifact
  motivo: string
  candidatos: ItemCatalogo[]
}

export interface ComparacionMifact {
  coincidencias: Coincidencia[]
  /** Productos de Mifact sin equivalente en nuestro catálogo (con una sugerencia si hay algo parecido). */
  soloMifact: (FilaMifact & { sugerencia?: { nombre: string; puntaje: number } })[]
  /** Productos nuestros sin equivalente en Mifact. */
  soloNuestro: ItemCatalogo[]
  /** Filas de Mifact que podrían ser de varios productos nuestros, o cuyo producto ya se asignó a otro código. */
  ambiguas: AmbiguaMifact[]
  resumen: {
    filasMifact: number
    itemsNuestros: number
    exactas: number
    probables: number
    conPrecioDistinto: number
    conNombreDistinto: number
    soloMifact: number
    soloNuestro: number
    ambiguas: number
    /** Cuántas coincidencias exactas se pueden guardar ahora (no tienen ya otro código). */
    codigosPorGuardar: number
  }
}

const RELLENO = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'y', 'e', 'en', 'un', 'una'])
const EMPAQUE = new Set(['caja', 'cajas', 'paquete', 'unidad', 'unidades', 'und', 'unid'])

function normalizarNombre(nombre: string): string {
  return sinTildes(nombre.toLowerCase())
    .replace(/&/g, ' y ')
    .replace(/\bx\s*(\d+)/g, 'x$1') // "x 10" → "x10"
    .replace(/(\d+)\s*(cm|gr|g|kg|ml|oz|l|lt)\b/g, '$1$2') // "16 cm" → "16cm"
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function singular(t: string): string {
  if (t.length > 5 && t.endsWith('es')) return t.slice(0, -2)
  if (t.length > 3 && t.endsWith('s')) return t.slice(0, -1)
  return t
}

const tokens = (nombre: string): Set<string> =>
  new Set(
    normalizarNombre(nombre)
      .split(' ')
      .filter((t) => t && !RELLENO.has(t))
      .map(singular)
  )

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let comunes = 0
  for (const t of a) if (b.has(t)) comunes++
  return comunes / (a.size + b.size - comunes)
}

// Para el puntaje, las palabras de empaque ("caja") no cuentan: "Alfajor Mix Caja x10" y "ALFAJOR MIX X10" son lo mismo.
const tokensParaPuntaje = (nombre: string) => new Set([...tokens(nombre)].filter((t) => !EMPAQUE.has(t)))

const UMBRAL_PROBABLE = 0.75
const UMBRAL_SUGERENCIA = 0.5

const claveExacta = (nombre: string) => [...tokensParaPuntaje(nombre)].sort().join(' ')
const nombreLiteral = (n: string) => n.toLowerCase().replace(/\s+/g, ' ').trim()

export function compararCatalogoMifact(filas: FilaMifact[], catalogo: ItemCatalogo[]): ComparacionMifact {
  const claveDeItem = new Map<string, ItemCatalogo[]>()
  for (const it of catalogo) {
    const k = claveExacta(it.nombre)
    claveDeItem.set(k, [...(claveDeItem.get(k) ?? []), it])
  }
  const tokensItem = new Map(catalogo.map((it) => [it.id, tokensParaPuntaje(it.nombre)]))

  const asignados = new Map<string, Coincidencia>() // item.id → coincidencia
  const coincidencias: Coincidencia[] = []
  const ambiguas: AmbiguaMifact[] = []
  const soloMifact: ComparacionMifact['soloMifact'] = []

  const armar = (item: ItemCatalogo, fila: FilaMifact, confianza: 'exacta' | 'probable', puntaje: number): Coincidencia => {
    const dif = item.precio !== null && fila.precio !== null ? Math.round((fila.precio - item.precio) * 100) / 100 : null
    return {
      item,
      fila,
      confianza,
      puntaje: Math.round(puntaje * 100) / 100,
      precioDistinto: dif !== null && Math.abs(dif) > 0.005,
      diferenciaPrecio: dif,
      nombreDistinto: nombreLiteral(item.nombre) !== nombreLiteral(fila.nombre),
      codigoActual: item.codigoMifact ? (item.codigoMifact === fila.codigo ? 'igual' : 'distinto') : null,
    }
  }

  // Primero las exactas, para que una coincidencia dudosa nunca le quite el producto a una exacta.
  const pendientes: FilaMifact[] = []
  for (const fila of filas) {
    const candidatos = claveDeItem.get(claveExacta(fila.nombre)) ?? []
    if (candidatos.length === 0) {
      pendientes.push(fila)
      continue
    }
    if (candidatos.length > 1) {
      ambiguas.push({ fila, motivo: 'El nombre calza con más de un producto nuestro.', candidatos })
      continue
    }
    const [item] = candidatos
    if (asignados.has(item.id)) {
      ambiguas.push({
        fila,
        motivo: `Nuestro producto ya calzó con otro código de Mifact (${asignados.get(item.id)!.fila.codigo}).`,
        candidatos,
      })
      continue
    }
    const c = armar(item, fila, 'exacta', 1)
    asignados.set(item.id, c)
    coincidencias.push(c)
  }

  for (const fila of pendientes) {
    const t = tokensParaPuntaje(fila.nombre)
    const puntuados = catalogo
      .map((item) => ({ item, puntaje: jaccard(t, tokensItem.get(item.id)!) }))
      .sort((a, b) => b.puntaje - a.puntaje)
    const mejor = puntuados[0]
    const segundo = puntuados[1]
    if (mejor && mejor.puntaje >= UMBRAL_PROBABLE) {
      if (segundo && segundo.puntaje === mejor.puntaje) {
        ambiguas.push({
          fila,
          motivo: 'Se parece por igual a más de un producto nuestro.',
          candidatos: puntuados.filter((p) => p.puntaje === mejor.puntaje).map((p) => p.item),
        })
      } else if (asignados.has(mejor.item.id)) {
        soloMifact.push({ ...fila, sugerencia: { nombre: mejor.item.nombre, puntaje: Math.round(mejor.puntaje * 100) / 100 } })
      } else {
        const c = armar(mejor.item, fila, 'probable', mejor.puntaje)
        asignados.set(mejor.item.id, c)
        coincidencias.push(c)
      }
    } else if (mejor && mejor.puntaje >= UMBRAL_SUGERENCIA) {
      soloMifact.push({ ...fila, sugerencia: { nombre: mejor.item.nombre, puntaje: Math.round(mejor.puntaje * 100) / 100 } })
    } else {
      soloMifact.push(fila)
    }
  }

  const soloNuestro = catalogo.filter((it) => !asignados.has(it.id))
  const exactas = coincidencias.filter((c) => c.confianza === 'exacta')

  return {
    coincidencias,
    soloMifact,
    soloNuestro,
    ambiguas,
    resumen: {
      filasMifact: filas.length,
      itemsNuestros: catalogo.length,
      exactas: exactas.length,
      probables: coincidencias.length - exactas.length,
      conPrecioDistinto: coincidencias.filter((c) => c.precioDistinto).length,
      conNombreDistinto: coincidencias.filter((c) => c.nombreDistinto).length,
      soloMifact: soloMifact.length,
      soloNuestro: soloNuestro.length,
      ambiguas: ambiguas.length,
      codigosPorGuardar: exactas.filter((c) => c.codigoActual === null).length,
    },
  }
}

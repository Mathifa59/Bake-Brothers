/**
 * Cruce del catálogo de productos que exporta Mifact (facturación) con el
 * catálogo propio. Lógica pura, sin I/O:
 *   1. `filasDesdeMatriz`: de las filas crudas del Excel a filas de Mifact limpias.
 *   2. `compararCatalogoMifact`: cruza por nombre y arma la lista de diferencias.
 *
 * Regla del cliente: NUNCA se cambia un precio ni un nombre automáticamente. Lo
 * único que se guarda son los códigos de Mifact de los productos que coinciden por
 * nombre de forma EXACTA; todo lo demás (precio o nombre distinto, productos que
 * están de un solo lado, coincidencias dudosas) se muestra para revisar a mano.
 *
 * Formato REAL del export de Mifact (PRODUCTOS_MIFACT_<RUC>.xlsx, verificado con el
 * archivo del cliente, 347 filas): una fila por producto POR ALMACÉN, cada una con su
 * propio CODIGO (único) — "Mini Carrot cake" aparece como CENTRAL, santa marina y/o
 * TODOS, con códigos distintos y a veces precios distintos. Columnas: CODIGO,
 * CODIGO BARRAS, NOMBRE PRODUCTO, VALOR UNITARIO (sin IGV), PRECIO UNITARIO (con IGV
 * 18 %, el precio de venta al público), CATEGORIA, STOCK, CONTROL STOCK, ALMACEN…
 */

// ── 1. Del Excel a filas ──────────────────────────────────────────────────

export interface FilaMifact {
  codigo: string
  codigoBarras: string | null
  nombre: string
  categoria: string | null
  /** Precio de venta CON IGV (PRECIO UNITARIO). null si venía vacío o ilegible. */
  precio: number | null
  controlStock: string | null
  /** Almacén de esa fila, tal cual lo escribe Mifact ("CENTRAL", "santa marina", "TODOS"). */
  almacen: string | null
}

export interface LecturaExcelMifact {
  filas: FilaMifact[]
  /** Filas del Excel con datos (sin contar el encabezado). */
  filasLeidas: number
  /** Filas descartadas por no tener código o nombre. */
  filasIncompletas: number
  /** Filas repetidas (mismo código) que se juntaron en una. */
  filasRepetidas: number
  /** Encabezados que se reconocieron, para mostrarlos y detectar un archivo equivocado. */
  columnas: { codigo: string; nombre: string; categoria?: string; precio?: string; almacen?: string; controlStock?: string }
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

// Los patrones van en orden de preferencia. OJO con el precio: "VALOR UNITARIO" es el precio
// SIN IGV — no se usa; el de venta al público (el que comparamos con el nuestro) es "PRECIO UNITARIO".
const ENCABEZADOS = {
  codigo: [/^codigo( de)? producto$/, /^cod(igo)?( de)? prod(ucto)?$/, /^codigo$/, /^cod$/, /^sku$/],
  nombre: [/^nombre( de)? producto$/, /^descripcion( de)? producto$/, /^nombre$/, /^descripcion$/, /^producto$/],
  categoria: [/^categoria$/, /^categoria( de)? producto$/, /^linea$/, /^familia$/],
  precio: [/^precio unitario$/, /^precio( de)? venta$/, /^precio venta$/, /^pvp$/, /^precio$/],
  controlStock: [/^control( de)? stock$/, /^controla stock$/],
  almacen: [/^almacen$/, /^almacenes$/],
  codigoBarras: [/^codigo( de)? barras?$/],
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
 * importar tildes/mayúsculas y descarta filas sin código o nombre. Cada fila
 * (producto + almacén) conserva su propio código; solo se juntan filas con el
 * MISMO código repetido.
 */
export function filasDesdeMatriz(matriz: unknown[][]): LecturaExcelMifact {
  const vacia: LecturaExcelMifact = {
    filas: [], filasLeidas: 0, filasIncompletas: 0, filasRepetidas: 0, columnas: { codigo: '', nombre: '' },
  }

  let filaEncabezado = -1
  let indices = { codigo: -1, nombre: -1, categoria: -1, precio: -1, controlStock: -1, almacen: -1, codigoBarras: -1 }
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
        codigoBarras: buscarColumna(hs, ENCABEZADOS.codigoBarras),
      }
      break
    }
  }
  if (filaEncabezado < 0) {
    return {
      ...vacia,
      error:
        'No encontré las columnas CODIGO y NOMBRE PRODUCTO en las primeras filas del archivo. ¿Es el Excel de productos que exporta Mifact?',
    }
  }

  const encabezadoCrudo = matriz[filaEncabezado] ?? []
  const nombreColumna = (i: number) => (i >= 0 ? celda(encabezadoCrudo[i]) : undefined)
  const columnas = {
    codigo: celda(encabezadoCrudo[indices.codigo]),
    nombre: celda(encabezadoCrudo[indices.nombre]),
    categoria: nombreColumna(indices.categoria),
    precio: nombreColumna(indices.precio),
    almacen: nombreColumna(indices.almacen),
    controlStock: nombreColumna(indices.controlStock),
  }

  const porCodigo = new Map<string, FilaMifact>()
  let filasLeidas = 0
  let filasIncompletas = 0
  let filasRepetidas = 0
  for (const fila of matriz.slice(filaEncabezado + 1)) {
    if (!fila || fila.every((c) => celda(c) === '')) continue // fila totalmente vacía
    filasLeidas++
    const codigo = celda(fila[indices.codigo])
    const nombre = celda(fila[indices.nombre]).replace(/\s+/g, ' ')
    if (!codigo || !nombre) {
      filasIncompletas++
      continue
    }
    if (porCodigo.has(codigo)) {
      filasRepetidas++
      continue
    }
    porCodigo.set(codigo, {
      codigo,
      codigoBarras: indices.codigoBarras >= 0 ? celda(fila[indices.codigoBarras]) || null : null,
      nombre,
      categoria: indices.categoria >= 0 ? celda(fila[indices.categoria]) || null : null,
      precio: indices.precio >= 0 ? parsearPrecio(fila[indices.precio]) : null,
      controlStock: indices.controlStock >= 0 ? celda(fila[indices.controlStock]) || null : null,
      almacen: indices.almacen >= 0 ? celda(fila[indices.almacen]) || null : null,
    })
  }

  return { filas: [...porCodigo.values()], filasLeidas, filasIncompletas, filasRepetidas, columnas }
}

// ── 2. Cruce con nuestro catálogo ─────────────────────────────────────────

/** Código de Mifact ya guardado en una unidad vendible nuestra, para un almacén. */
export interface CodigoGuardado {
  almacen: string
  codigo: string
}

/** Algo vendible de nuestro catálogo: un producto sin tamaños, o un tamaño de un producto. */
export interface ItemCatalogo {
  tipo: 'producto' | 'tamano'
  id: string
  /** Nombre completo con el que se compara: "Alfajor Mix Caja x10" o "Chocoalfajor". */
  nombre: string
  precio: number | null
  /** Categoría nuestra, solo para agrupar la lista de "solo en nuestro catálogo". */
  categoria?: string | null
  /** Códigos de Mifact que ya tiene guardados (uno por almacén). */
  codigos: CodigoGuardado[]
}

/** Un producto de Mifact: todas las filas con el mismo nombre (una por almacén). */
export interface ProductoMifact {
  nombre: string
  categoria: string | null
  variantes: FilaMifact[]
}

/** Estado de UNA variante (un código de un almacén) frente a lo que ya tenemos guardado. */
export interface VarianteCruzada {
  fila: FilaMifact
  /** nuevo: se puede guardar · igual: ya está guardado · distinto: ese almacén ya tiene otro código (no se pisa). */
  codigo: 'nuevo' | 'igual' | 'distinto'
  /** Código que ya tiene guardado ese almacén (solo si `codigo === 'distinto'`). */
  codigoActual?: string
  precioDistinto: boolean
  /** Precio Mifact − precio nuestro (null si falta alguno). */
  diferenciaPrecio: number | null
}

export interface Coincidencia {
  item: ItemCatalogo
  producto: ProductoMifact
  /** exacta: mismo nombre (ignorando tildes/mayúsculas/signos/orden) → se pueden guardar los códigos. probable: parecido, solo para revisar. */
  confianza: 'exacta' | 'probable'
  puntaje: number
  variantes: VarianteCruzada[]
  /** El nombre se escribe distinto (aunque calcen al comparar). */
  nombreDistinto: boolean
  /** Algún almacén trae un precio distinto al nuestro. */
  precioDistinto: boolean
  /** Los almacenes de Mifact no se ponen de acuerdo en el precio entre ellos. */
  preciosDistintosEntreAlmacenes: boolean
}

export interface AmbiguaMifact {
  producto: ProductoMifact
  motivo: string
  candidatos: ItemCatalogo[]
}

export interface SoloMifact extends ProductoMifact {
  sugerencia?: { nombre: string; puntaje: number }
}

export interface ComparacionMifact {
  coincidencias: Coincidencia[]
  /** Productos de Mifact sin equivalente en nuestro catálogo (con una sugerencia si hay algo parecido). */
  soloMifact: SoloMifact[]
  /** Productos nuestros sin equivalente en Mifact. */
  soloNuestro: ItemCatalogo[]
  /** Productos de Mifact que podrían ser de varios productos nuestros, o cuyo producto ya se asignó a otro. */
  ambiguas: AmbiguaMifact[]
  resumen: {
    filasMifact: number
    productosMifact: number
    itemsNuestros: number
    exactas: number
    probables: number
    conPrecioDistinto: number
    conNombreDistinto: number
    soloMifact: number
    soloNuestro: number
    ambiguas: number
    /** Códigos (uno por almacén) de coincidencias exactas que se pueden guardar ahora. */
    codigosPorGuardar: number
  }
}

const RELLENO = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'y', 'e', 'en', 'un', 'una'])
// Palabras de empaque/cantidad que no distinguen un producto: "Caja de alfajor x 18 ud." ≈ "Alfajor Caja x18".
const EMPAQUE = new Set(['caja', 'cajas', 'paquete', 'unidad', 'unidades', 'und', 'unid', 'ud', 'uds'])
// Mifact llama "porción" a lo que nosotros llamamos tamaño "Individual".
const SINONIMOS: Record<string, string> = { porcion: 'individual', porciones: 'individual' }

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

function tokensDe(nombre: string): Set<string> {
  const salida = new Set<string>()
  for (const t of normalizarNombre(nombre).split(' ')) {
    if (!t || RELLENO.has(t) || EMPAQUE.has(t)) continue
    salida.add(SINONIMOS[t] ?? singular(t))
  }
  return salida
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let comunes = 0
  for (const t of a) if (b.has(t)) comunes++
  return comunes / (a.size + b.size - comunes)
}

const UMBRAL_PROBABLE = 0.75
const UMBRAL_SUGERENCIA = 0.5

const claveExacta = (nombre: string) => [...tokensDe(nombre)].sort().join(' ')
const nombreLiteral = (n: string) => n.toLowerCase().replace(/\s+/g, ' ').trim()
const redondear = (n: number) => Math.round(n * 100) / 100
const claveAlmacen = (a: string | null) => (a ?? '').trim().toLowerCase()

/** Junta las filas de Mifact con el mismo nombre (una por almacén) en un solo producto. */
export function agruparPorProducto(filas: FilaMifact[]): ProductoMifact[] {
  const grupos = new Map<string, ProductoMifact>()
  for (const f of filas) {
    const k = claveExacta(f.nombre) || nombreLiteral(f.nombre)
    const g = grupos.get(k)
    if (g) g.variantes.push(f)
    else grupos.set(k, { nombre: f.nombre, categoria: f.categoria, variantes: [f] })
  }
  return [...grupos.values()]
}

export function compararCatalogoMifact(filas: FilaMifact[], catalogo: ItemCatalogo[]): ComparacionMifact {
  const productos = agruparPorProducto(filas)

  const itemsPorClave = new Map<string, ItemCatalogo[]>()
  for (const it of catalogo) {
    const k = claveExacta(it.nombre)
    itemsPorClave.set(k, [...(itemsPorClave.get(k) ?? []), it])
  }
  const tokensItem = new Map(catalogo.map((it) => [it.id, tokensDe(it.nombre)]))

  const asignados = new Map<string, Coincidencia>() // item.id → coincidencia
  const coincidencias: Coincidencia[] = []
  const ambiguas: AmbiguaMifact[] = []
  const soloMifact: SoloMifact[] = []

  const armar = (item: ItemCatalogo, producto: ProductoMifact, confianza: 'exacta' | 'probable', puntaje: number): Coincidencia => {
    const variantes: VarianteCruzada[] = producto.variantes.map((fila) => {
      const guardado = item.codigos.find((c) => claveAlmacen(c.almacen) === claveAlmacen(fila.almacen))
      const dif = item.precio !== null && fila.precio !== null ? redondear(fila.precio - item.precio) : null
      return {
        fila,
        codigo: !guardado ? 'nuevo' : guardado.codigo === fila.codigo ? 'igual' : 'distinto',
        codigoActual: guardado && guardado.codigo !== fila.codigo ? guardado.codigo : undefined,
        precioDistinto: dif !== null && Math.abs(dif) > 0.005,
        diferenciaPrecio: dif,
      }
    })
    const preciosMifact = producto.variantes.map((v) => v.precio).filter((p): p is number => p !== null)
    return {
      item,
      producto,
      confianza,
      puntaje: redondear(puntaje),
      variantes,
      nombreDistinto: nombreLiteral(item.nombre) !== nombreLiteral(producto.nombre),
      precioDistinto: variantes.some((v) => v.precioDistinto),
      preciosDistintosEntreAlmacenes: preciosMifact.some((p) => Math.abs(p - preciosMifact[0]) > 0.005),
    }
  }

  // Primero las exactas, para que una coincidencia dudosa nunca le quite el producto a una exacta.
  const pendientes: ProductoMifact[] = []
  for (const producto of productos) {
    const candidatos = itemsPorClave.get(claveExacta(producto.nombre)) ?? []
    if (candidatos.length === 0) {
      pendientes.push(producto)
      continue
    }
    if (candidatos.length > 1) {
      ambiguas.push({ producto, motivo: 'El nombre calza con más de un producto nuestro.', candidatos })
      continue
    }
    const [item] = candidatos
    if (asignados.has(item.id)) {
      ambiguas.push({
        producto,
        motivo: `Nuestro producto ya calzó con otro producto de Mifact (${asignados.get(item.id)!.producto.nombre}).`,
        candidatos,
      })
      continue
    }
    const c = armar(item, producto, 'exacta', 1)
    asignados.set(item.id, c)
    coincidencias.push(c)
  }

  for (const producto of pendientes) {
    const t = tokensDe(producto.nombre)
    const puntuados = catalogo
      .map((item) => ({ item, puntaje: jaccard(t, tokensItem.get(item.id)!) }))
      .sort((a, b) => b.puntaje - a.puntaje)
    const mejor = puntuados[0]
    const segundo = puntuados[1]
    // Los ítems "(catering)" de Mifact son unidades de catering (precio por pieza), no el producto de tienda:
    // no se sugiere un parecido ("Alfajor con manjar (catering)" ≠ "Alfajor con Manjar Caja x10").
    const esCatering = t.has('catering')
    const sugerencia =
      mejor && mejor.puntaje >= UMBRAL_SUGERENCIA && !esCatering ? { nombre: mejor.item.nombre, puntaje: redondear(mejor.puntaje) } : undefined
    if (mejor && mejor.puntaje >= UMBRAL_PROBABLE && !esCatering) {
      if (segundo && segundo.puntaje === mejor.puntaje) {
        ambiguas.push({
          producto,
          motivo: 'Se parece por igual a más de un producto nuestro.',
          candidatos: puntuados.filter((p) => p.puntaje === mejor.puntaje).map((p) => p.item),
        })
      } else if (asignados.has(mejor.item.id)) {
        soloMifact.push({ ...producto, sugerencia })
      } else {
        const c = armar(mejor.item, producto, 'probable', mejor.puntaje)
        asignados.set(mejor.item.id, c)
        coincidencias.push(c)
      }
    } else {
      soloMifact.push(sugerencia ? { ...producto, sugerencia } : producto)
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
      productosMifact: productos.length,
      itemsNuestros: catalogo.length,
      exactas: exactas.length,
      probables: coincidencias.length - exactas.length,
      conPrecioDistinto: coincidencias.filter((c) => c.precioDistinto).length,
      conNombreDistinto: coincidencias.filter((c) => c.nombreDistinto).length,
      soloMifact: soloMifact.length,
      soloNuestro: soloNuestro.length,
      ambiguas: ambiguas.length,
      codigosPorGuardar: exactas.reduce((n, c) => n + c.variantes.filter((v) => v.codigo === 'nuevo').length, 0),
    },
  }
}

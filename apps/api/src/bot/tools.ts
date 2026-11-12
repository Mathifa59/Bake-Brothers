import type pg from 'pg'
import { evaluarSemaforoCatering, type SemaforoCatering } from '@bakebrothers/domain'
import {
  construirBusqueda,
  extraerTamano,
  resolverTamano,
  tienePalabrasDeProducto,
  sqlCoincide,
  sqlCoincideEstricto,
} from '../repositories/busquedaTexto.js'
import { buscarProductosPorTexto } from '../repositories/productsRepo.js'
import { cargarContextoStock, disponibilidadDeSku } from '../repositories/stockRepo.js'

/**
 * Funciones de solo lectura contra el catálogo real — pensadas para que un
 * futuro LLM las invoque como "tools" (function calling) cuando el bot
 * responda preguntas de precio/disponibilidad/combos/catering. Ninguna
 * inventa un valor: si no hay match, devuelven `null`/`[]` explícito.
 *
 * La búsqueda acepta el slug exacto o un texto aproximado (`ilike`) porque
 * un cliente de WhatsApp nunca va a escribir el slug — va a escribir "el
 * carrot cake" o "cuánto cuesta el red velvet".
 */

export interface TamanoConPrecio {
  tamano: string
  precio: number
  /** true si este tamaño está agotado (en la sede de la conversación, o en todas si no hay sede). No lo ofrezcas. */
  agotado?: boolean
  /** Solo si `agotado`: nombres de los OTROS locales donde este tamaño sí hay. Ausente si en ningún otro. */
  disponibleEn?: string[]
}

/** Un local donde sí se puede vender el producto, con su dirección para dársela al cliente tal cual. */
export interface LocalConStock {
  sede: string
  direccion: string | null
}

/** Dónde está agotado un producto (solo filas de stock explícitas). */
export interface AgotadoEn {
  sede: string
  /** null = el producto entero (sin tamaño). */
  tamano: string | null
  /** 'agotado' o 'cantidad_insuficiente' (con conteo en 0). */
  motivo: 'agotado' | 'sin_unidades'
}

export interface PrecioProducto {
  slug: string
  nombre: string
  precioBase: number
  /**
   * Si se puede vender: el flag general del catálogo Y que haya al menos una presentación con stock (en la sede de la
   * conversación si la hay; si no, en alguna sede). Si es false, dilo y no tomes el pedido de ese producto.
   */
  disponible: boolean
  tamanos: TamanoConPrecio[]
  /** Dónde está agotado, para decirle al cliente (p. ej. "en Cedros sí, en Santa Marina no"). Ausente si en ningún lado. */
  agotadoEn?: AgotadoEn[]
  /** Nombre del local de esta conversación (ausente con el número del bot, que todavía no sabe el local). */
  localDeLaConversacion?: string
  /**
   * Los OTROS locales donde SÍ hay este producto (al menos un tamaño), cada uno con su dirección. Solo viene cuando
   * hay algo agotado (el producto o un tamaño) y existe al menos otro local con stock. Si viene, ofrécele ese local
   * con su dirección además de otros productos; si no viene, no hay otro local que ofrecer.
   */
  disponibleEn?: LocalConStock[]
  /**
   * Solo si el cliente mencionó un tamaño en la frase ("carrot cake individual", "mini red velvet",
   * "alfajores x10") y el producto tiene tamaños. Si `encontrado` es false, el producto SÍ existe pero no
   * viene en ese tamaño: hay que decirlo y ofrecer `tamanosDisponibles`, nunca decir que el producto no existe.
   */
  tamanoSolicitado?: {
    /** Lo que dijo el cliente ("mini", "x10", "24cm"). */
    pedido: string
    encontrado: boolean
    /** El tamaño real que calza (con su precio), si se encontró. */
    tamano?: TamanoConPrecio
    /** Los tamaños que sí tiene el producto, si no se encontró el pedido. */
    tamanosDisponibles?: TamanoConPrecio[]
  }
  /**
   * Otros productos que calzan IGUAL de bien con lo que escribió el cliente ("alfajores x10" → hay 5
   * sabores). Si viene, no elijas por él: pregúntale cuál quiere.
   */
  otrasCoincidencias?: string[]
}

export async function consultarPrecio(
  client: pg.PoolClient,
  tenantId: string,
  busqueda: string,
  sedeId: string | null = null
): Promise<PrecioProducto | null> {
  const { tamano: pedido, mejor, otras } = await buscarProductosPorTexto(client, tenantId, busqueda)
  if (!mejor) return null

  // Stock: la misma regla que usan los pedidos (productoDisponibleEnSede) — lo agotado no se ofrece.
  const ctx = await cargarContextoStock(client, [mejor.id])
  const conPrecio = mejor.tamanos.filter((t) => t.precio !== null && t.precio !== undefined)
  const tamanos: TamanoConPrecio[] = conPrecio
    .map((t) => {
      const r = disponibilidadDeSku(ctx, { productId: mejor.id, productSizeId: t.id ?? null }, sedeId)
      if (r.disponible) return { tamano: t.tamano, precio: Number(t.precio) }
      const enOtros = r.enSedes.filter((id) => id !== sedeId).map((id) => ctx.sedes.find((x) => x.id === id)?.nombre).filter((n): n is string => !!n)
      return { tamano: t.tamano, precio: Number(t.precio), agotado: true, ...(enOtros.length > 0 ? { disponibleEn: enOtros } : {}) }
    })
    .sort((x, y) => x.precio - y.precio)

  const hayStock =
    conPrecio.length > 0
      ? tamanos.some((t) => !t.agotado)
      : disponibilidadDeSku(ctx, { productId: mejor.id, productSizeId: null }, sedeId).disponible

  const etiquetaDeTamano = new Map(mejor.tamanos.map((t) => [t.id, t.tamano] as const))
  const nombreDeSede = new Map(ctx.sedes.map((x) => [x.id, x.nombre] as const))
  const agotadoEn: AgotadoEn[] = (ctx.filasPorProducto.get(mejor.id) ?? [])
    .filter((f) => nombreDeSede.has(f.sedeId) && (!f.disponible || f.cantidad === 0))
    .map((f) => ({
      sede: nombreDeSede.get(f.sedeId)!,
      tamano: f.productSizeId ? (etiquetaDeTamano.get(f.productSizeId) ?? null) : null,
      motivo: f.disponible ? ('sin_unidades' as const) : ('agotado' as const),
    }))

  // Otros locales donde sí hay (algún tamaño, o el producto si no tiene tamaños). Solo importa si hay algo agotado.
  const hayEnSede = (sId: string) =>
    conPrecio.length > 0
      ? conPrecio.some((t) => disponibilidadDeSku(ctx, { productId: mejor.id, productSizeId: t.id ?? null }, sId).disponible)
      : disponibilidadDeSku(ctx, { productId: mejor.id, productSizeId: null }, sId).disponible
  // Con local conocido solo importa si el problema es EN ESE local (si en Cedros se agotó algo pero esta conversación es
  // de Santa Marina y allí hay todo, no hay nada que ofrecer en otro lado); sin local, si hay algo agotado en cualquiera.
  const hayAlgoAgotado = sedeId ? !hayStock || tamanos.some((t) => t.agotado) : agotadoEn.length > 0
  const disponibleEn: LocalConStock[] = hayAlgoAgotado
    ? ctx.sedes.filter((x) => x.id !== sedeId && hayEnSede(x.id)).map((x) => ({ sede: x.nombre, direccion: x.direccion }))
    : []
  const localDeLaConversacion = sedeId ? nombreDeSede.get(sedeId) : undefined

  const resultado: PrecioProducto = {
    slug: mejor.slug,
    nombre: mejor.nombre,
    precioBase: Number(mejor.precio_base),
    disponible: mejor.disponible && hayStock,
    tamanos,
    ...(agotadoEn.length > 0 ? { agotadoEn } : {}),
    ...(localDeLaConversacion ? { localDeLaConversacion } : {}),
    ...(disponibleEn.length > 0 ? { disponibleEn } : {}),
  }

  if (pedido && tamanos.length > 0) {
    const etiqueta = resolverTamano(pedido, tamanos.map((t) => t.tamano))
    resultado.tamanoSolicitado = etiqueta
      ? { pedido: pedido.dicho, encontrado: true, tamano: tamanos.find((t) => t.tamano === etiqueta) }
      : { pedido: pedido.dicho, encontrado: false, tamanosDisponibles: tamanos }
  }
  if (otras.length > 0) resultado.otrasCoincidencias = otras

  return resultado
}

export interface StockPorSede {
  sedeId: string
  sedeNombre: string
  disponible: boolean
  cantidad: number | null
}

export interface Disponibilidad {
  slug: string
  nombre: string
  // Flag general del catálogo (products.disponible) — no depende de ninguna
  // sede. `stockPorSede` es más específico y gana cuando hay una fila.
  disponibleGlobal: boolean
  stockPorSede: StockPorSede[]
}

export async function consultarDisponibilidad(
  client: pg.PoolClient,
  tenantId: string,
  busqueda: string,
  sedeId?: string
): Promise<Disponibilidad | null> {
  // Mismo criterio que consultarPrecio: el tamaño que mencione el cliente en la frase no impide hallar el producto.
  const { mejor: producto } = await buscarProductosPorTexto(client, tenantId, busqueda)
  if (!producto) return null

  // stock no tiene tenant_id — product_id (ya resuelto contra el tenant
  // arriba) alcanza para acotar la consulta.
  const condicionSede = sedeId ? 'and s.sede_id = $2' : ''
  const params = sedeId ? [producto.id, sedeId] : [producto.id]
  const stock = await client.query(
    `select s.disponible, s.cantidad, se.id as sede_id, se.nombre as sede_nombre
     from stock s
     join sedes se on se.id = s.sede_id
     where s.product_id = $1 and se.activo ${condicionSede}
     order by se.nombre`,
    params
  )

  return {
    slug: producto.slug,
    nombre: producto.nombre,
    disponibleGlobal: producto.disponible,
    stockPorSede: stock.rows.map((r) => ({
      sedeId: r.sede_id as string,
      sedeNombre: r.sede_nombre as string,
      disponible: r.disponible as boolean,
      cantidad: r.cantidad === null ? null : Number(r.cantidad),
    })),
  }
}

export interface ProductoListado {
  nombre: string
  /** Precio más bajo: el del tamaño más barato, o el precio base si no tiene tamaños. */
  precioDesde: number
  /** true si tiene varios tamaños/presentaciones (hay que preguntar cuál). */
  variosTamanos: boolean
}

export interface CatalogoListado {
  busqueda: string
  /** Productos disponibles que coinciden (puede ser mayor que los listados). */
  total: number
  truncado: boolean
  grupos: { categoria: string; productos: ProductoListado[] }[]
  /**
   * Productos que coinciden pero están agotados (en la sede de la conversación, o en todas si no hay sede) y por eso
   * NO están en la lista. Si el cliente pregunta por uno, dile que hoy está agotado.
   */
  agotadosOmitidos?: string[]
  /** Solo si no hubo búsqueda o no coincidió nada: qué categorías existen, para orientar al cliente. */
  categoriasDisponibles?: { categoria: string; cantidad: number }[]
}

// Tope de productos que se le devuelven al modelo en una sola consulta: más que
// esto no se puede leer en un mensaje de WhatsApp; el modelo pide acotar.
const MAX_PRODUCTOS_LISTADOS = 24

/**
 * Para pedidos genéricos o preguntas de "qué hay": "quiero alfajores", "¿qué
 * empanadas tienen?", "un postre dulce". `consultarPrecio` devuelve UN producto
 * (el que mejor calza con un nombre), así que con estas frases elegiría uno por
 * el cliente o no tendría cómo mostrar las opciones. Acá se listan los
 * productos disponibles cuyo nombre, categoría o rubro (dulces/salados/bebidas)
 * coinciden con TODAS las palabras del texto — "postre dulce" → los postres,
 * "empanadas" → las 10 empanadas. Sin texto, o si nada coincide, devuelve las
 * categorías que existen. Solo lectura, nunca inventa.
 */
export async function listarCatalogo(
  client: pg.PoolClient,
  tenantId: string,
  busqueda: string,
  sedeId: string | null = null
): Promise<CatalogoListado> {
  const texto = busqueda.trim()

  const categorias = async () => {
    const { rows } = await client.query(
      `select coalesce(c.nombre, 'Otros') as categoria, count(*)::int as cantidad
       from products p left join categories c on c.id = p.category_id
       where p.tenant_id = $1 and p.disponible
       group by 1 order by 1`,
      [tenantId]
    )
    return rows.map((r) => ({ categoria: r.categoria as string, cantidad: r.cantidad as number }))
  }

  if (!texto) {
    return { busqueda: texto, total: 0, truncado: false, grupos: [], categoriasDisponibles: await categorias() }
  }

  // "cheesecakes individuales", "tortas familiares": el tamaño no es parte del nombre ni de la categoría.
  const sinTamano = extraerTamano(texto)
  const b = construirBusqueda(sinTamano.tamano && tienePalabrasDeProducto(sinTamano.texto) ? sinTamano.texto : texto)
  const { rows } = await client.query(
    `select p.id, p.nombre, coalesce(c.nombre, 'Otros') as categoria,
            coalesce(min(ps.precio), p.precio_base) as precio_desde,
            count(ps.id) > 1 as varios_tamanos,
            coalesce(jsonb_agg(ps.id) filter (where ps.id is not null), '[]') as tamanos_ids
     from products p
     left join categories c on c.id = p.category_id
     left join product_sizes ps on ps.product_id = p.id and ps.precio is not null and ps.activo
     where p.tenant_id = $1 and p.disponible
       and ${sqlCoincide(`(p.nombre || ' ' || coalesce(c.nombre, '') || ' ' || coalesce(p.categoria_negocio, ''))`, '$2', '$3')}
     group by p.id, c.id
     order by coalesce(c.nombre, 'Otros'), p.nombre`,
    [tenantId, b.estrictos, b.flexibles]
  )

  // Lo agotado no se lista (misma regla que los pedidos). Un producto con tamaños se lista si algún tamaño tiene stock.
  const ctx = await cargarContextoStock(client, rows.map((r) => r.id as string))
  const hayStock = (r: (typeof rows)[number]) => {
    const ids = r.tamanos_ids as string[]
    return ids.length > 0
      ? ids.some((id) => disponibilidadDeSku(ctx, { productId: r.id, productSizeId: id }, sedeId).disponible)
      : disponibilidadDeSku(ctx, { productId: r.id, productSizeId: null }, sedeId).disponible
  }
  const conStock = rows.filter(hayStock)
  const agotadosOmitidos = rows.filter((r) => !hayStock(r)).map((r) => r.nombre as string)
  const omitidos = agotadosOmitidos.length > 0 ? { agotadosOmitidos } : {}

  if (conStock.length === 0) {
    return { busqueda: texto, total: 0, truncado: false, grupos: [], ...omitidos, categoriasDisponibles: await categorias() }
  }

  const grupos = new Map<string, ProductoListado[]>()
  for (const r of conStock.slice(0, MAX_PRODUCTOS_LISTADOS)) {
    const lista = grupos.get(r.categoria) ?? []
    lista.push({ nombre: r.nombre, precioDesde: Number(r.precio_desde), variosTamanos: r.varios_tamanos })
    grupos.set(r.categoria, lista)
  }
  return {
    busqueda: texto,
    total: conStock.length,
    truncado: conStock.length > MAX_PRODUCTOS_LISTADOS,
    grupos: [...grupos].map(([categoria, productos]) => ({ categoria, productos })),
    ...omitidos,
  }
}

export interface ItemCombo {
  productoNombre: string
  tamano: string | null
  cantidad: number
}

export interface ComboInfo {
  id: string
  nombre: string
  precioNormal: number | null
  precioPromo: number
  canalPermitido: string
  permiteCambios: boolean
  condicionTexto: string | null
  items: ItemCombo[]
}

// combos/combo_items no llevan tenant_id (0004) — mismo caso que catering.
export async function consultarCombo(
  client: pg.PoolClient,
  busqueda: string
): Promise<ComboInfo | null> {
  const b = construirBusqueda(busqueda)
  const { rows } = await client.query(
    `select c.id, c.nombre, c.precio_normal, c.precio_promo, c.canal_permitido,
            c.permite_cambios, c.condicion_texto
     from combos c
     where c.activo and (c.id::text = $1 or ${sqlCoincide('c.nombre', '$2', '$3')})
     order by ${sqlCoincideEstricto('c.nombre', '$2')} desc, length(c.nombre), c.nombre
     limit 1`,
    [busqueda, b.estrictos, b.flexibles]
  )
  const combo = rows[0]
  if (!combo) return null

  const items = await client.query(
    `select p.nombre as producto_nombre, ps.tamano, ci.cantidad
     from combo_items ci
     join products p on p.id = ci.product_id
     left join product_sizes ps on ps.id = ci.product_size_id
     where ci.combo_id = $1
     order by p.nombre`,
    [combo.id]
  )

  return {
    id: combo.id,
    nombre: combo.nombre,
    precioNormal: combo.precio_normal === null ? null : Number(combo.precio_normal),
    precioPromo: Number(combo.precio_promo),
    canalPermitido: combo.canal_permitido,
    permiteCambios: combo.permite_cambios,
    condicionTexto: combo.condicion_texto,
    items: items.rows.map((r) => ({
      productoNombre: r.producto_nombre as string,
      tamano: r.tamano as string | null,
      cantidad: Number(r.cantidad),
    })),
  }
}

export interface ReglaCatering {
  // uuid real de catering_items — lo necesita crearPedido para guardar la
  // línea del pedido (order_items.catering_item_id, ver 0019). No se lo
  // exponemos al modelo como algo que tenga que manejar, es un detalle
  // interno de wiring.
  itemId: string
  itemNombre: string
  categoria: string
  unidadesMinimas: number
  saleMismoDia: boolean
  anticipacionHoras: number
  requiereAutoObligatorio: boolean
  consultarDomingo: boolean
  // null = la fuente no confirma el dato para este ítem (ver 0007_catering_items.sql) — no se asume ni true ni false.
  necesitaTicket: boolean | null
  admiteCorteNocheAnterior: boolean
}

// catering_items/reglas_catering no llevan tenant_id (0007) — Bake Brothers
// es el único negocio del proyecto, no hace falta filtrar por tenant acá.
export async function consultarReglasCatering(
  client: pg.PoolClient,
  busqueda: string
): Promise<ReglaCatering | null> {
  const b = construirBusqueda(busqueda)
  const { rows } = await client.query(
    `select ci.id, ci.nombre, ci.categoria, r.unidades_minimas, r.sale_mismo_dia,
            r.anticipacion_horas, r.requiere_auto_obligatorio, r.consultar_domingo,
            r.necesita_ticket, r.admite_corte_noche_anterior
     from catering_items ci
     join reglas_catering r on r.catering_item_id = ci.id
     where ci.activo and ${sqlCoincide('ci.nombre', '$1', '$2')}
     order by ${sqlCoincideEstricto('ci.nombre', '$1')} desc, length(ci.nombre), ci.nombre
     limit 1`,
    [b.estrictos, b.flexibles]
  )
  const regla = rows[0]
  if (!regla) return null

  return {
    itemId: regla.id,
    itemNombre: regla.nombre,
    categoria: regla.categoria,
    unidadesMinimas: Number(regla.unidades_minimas),
    saleMismoDia: regla.sale_mismo_dia,
    anticipacionHoras: Number(regla.anticipacion_horas),
    requiereAutoObligatorio: regla.requiere_auto_obligatorio,
    consultarDomingo: regla.consultar_domingo,
    necesitaTicket: regla.necesita_ticket,
    admiteCorteNocheAnterior: regla.admite_corte_noche_anterior,
  }
}

export interface PedidoCateringConsulta {
  cantidadSolicitada: number
  /** YYYY-MM-DD — el día en que el cliente quiere la entrega. */
  fechaEntregaISO: string
}

/**
 * Semáforo de catering para un pedido real — junta el dato real de
 * reglas_catering (nunca inventado; null si el ítem no existe) con la
 * función pura `evaluarSemaforoCatering` de packages/domain (la lógica de
 * negocio vive ahí, esto solo la alimenta con datos reales).
 *
 * La usa el cerebro del bot (apps/api/src/bot/cerebro.ts) antes de confirmar
 * cualquier pedido de catering, y `crearPedido` (más abajo) la vuelve a
 * llamar server-side antes de persistir — nunca confía en que el modelo ya
 * la haya llamado.
 */
export async function evaluarSemaforoCateringPedido(
  client: pg.PoolClient,
  busquedaItem: string,
  pedido: PedidoCateringConsulta
): Promise<SemaforoCatering | null> {
  const regla = await consultarReglasCatering(client, busquedaItem)
  if (!regla) return null

  return evaluarSemaforoCatering(
    {
      unidadesMinimas: regla.unidadesMinimas,
      saleMismoDia: regla.saleMismoDia,
      anticipacionHoras: regla.anticipacionHoras,
      admiteCorteNocheAnterior: regla.admiteCorteNocheAnterior,
    },
    pedido
  )
}

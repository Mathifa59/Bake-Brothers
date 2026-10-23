import type pg from 'pg'
import {
  construirBusqueda,
  extraerTamano,
  resolverTamano,
  tienePalabrasDeProducto,
  sqlCoincide,
  sqlCoincideEstricto,
  type TamanoPedido,
} from './busquedaTexto.js'

/**
 * DTO con los MISMOS nombres de campo que usaba `mock.js` en el front:
 * los componentes visuales no se tocan. `id` es el slug público, nunca el uuid.
 */
export interface ProductoDTO {
  id: string
  nombre: string
  categoria: string
  tipo: string
  precio: number
  precioAnterior: number | null
  emoji: string | null
  foto: string | null
  g: [string, string]
  descripcion: string | null
  tamanos: boolean
  porciones: string | null
  preparacion: string
  anticipacionHoras: number
  conservacion: string | null
  popular: boolean
  masVendido: boolean
  disponible: boolean
}

const aDTO = (r: Record<string, unknown>): ProductoDTO => ({
  id: r.slug as string,
  nombre: r.nombre as string,
  categoria: r.categoria_negocio as string,
  tipo: r.tipo as string,
  precio: Number(r.precio_base),
  precioAnterior: r.precio_anterior === null ? null : Number(r.precio_anterior),
  emoji: r.emoji as string | null,
  foto: r.foto_url as string | null,
  g: [r.gradiente_desde as string, r.gradiente_hasta as string],
  descripcion: r.descripcion as string | null,
  tamanos: r.tiene_tamanos as boolean,
  porciones: r.porciones as string | null,
  preparacion: r.anticipacion_texto as string,
  anticipacionHoras: r.anticipacion_horas as number,
  conservacion: r.conservacion as string | null,
  popular: r.popular as boolean,
  masVendido: r.mas_vendido as boolean,
  disponible: r.disponible as boolean,
})

const SELECT_BASE = `
  select p.*, exists(select 1 from product_sizes ps where ps.product_id = p.id) as tiene_tamanos
  from products p
  where p.tenant_id = $1
`

export async function listarProductos(
  client: pg.PoolClient,
  tenantId: string,
  filtros: { categoria?: string; tipo?: string } = {}
): Promise<ProductoDTO[]> {
  const condiciones: string[] = []
  const params: unknown[] = [tenantId]
  if (filtros.categoria) {
    params.push(filtros.categoria)
    condiciones.push(`and p.categoria_negocio = $${params.length}`)
  }
  if (filtros.tipo) {
    params.push(filtros.tipo)
    condiciones.push(`and p.tipo = $${params.length}`)
  }
  const { rows } = await client.query(
    `${SELECT_BASE} ${condiciones.join(' ')} order by p.orden`,
    params
  )
  return rows.map(aDTO)
}

export async function productoPorSlug(
  client: pg.PoolClient,
  tenantId: string,
  slug: string
): Promise<ProductoDTO | null> {
  const { rows } = await client.query(`${SELECT_BASE} and p.slug = $2`, [tenantId, slug])
  return rows[0] ? aDTO(rows[0]) : null
}

/** Fila interna para armar un pedido (uuid, precios, tamaños válidos). */
export interface ProductoParaPedido {
  id: string
  slug: string
  nombre: string
  precio_base: string
  disponible: boolean
  anticipacion_horas: number | null
  category_id: string | null
  tamanos: { tamano: string; precio: string }[]
}

/** Extras activos del tenant, indexados por slug (para validar y valorizar pedidos). */
export async function extrasActivos(
  client: pg.PoolClient,
  tenantId: string
): Promise<Map<string, { slug: string; nombre: string; precio: number }>> {
  const { rows } = await client.query(
    `select slug, nombre, precio from extras where tenant_id = $1 and activo`,
    [tenantId]
  )
  return new Map(rows.map((r) => [r.slug, { slug: r.slug, nombre: r.nombre, precio: Number(r.precio) }]))
}

/** Un producto que calza con lo que escribió el cliente, con sus tamaños reales. */
export interface CandidatoProducto extends ProductoParaPedido {
  /** Precio por tamaño tal cual está en la base (puede venir null si el tamaño no tiene precio cargado). */
  tamanos: { tamano: string; precio: string }[]
}

export interface ResultadoBusquedaProducto {
  /** Tamaño que pidió el cliente (en la frase o explícito), o null si no mencionó ninguno. */
  tamano: TamanoPedido | null
  /** El mejor producto, o null si nada calzó. */
  mejor: CandidatoProducto | null
  /** Nombres de otros productos que calzan IGUAL de bien que el mejor (hay que preguntarle cuál). Máx. 5. */
  otras: string[]
}

/**
 * Busca UN producto por slug exacto o texto aproximado, entendiendo el tamaño mencionado en la misma frase
 * ("carrot cake individual", "mini red velvet", "alfajores x10"): el tamaño se separa del producto, el
 * producto se busca con el resto y, si hay varios que calzan, gana el que SÍ tiene ese tamaño (p. ej.
 * "torta de chocolate familiar" → la que viene en familiar). Un producto cuyo nombre ya contiene lo que
 * dijo el cliente ("Pionono Familiar", "Empanada 3 Quesos") gana siempre. Sin tamaño en la frase el
 * comportamiento es el mismo de siempre.
 *
 * `tamanoExplicito` es el tamaño que el modelo pasó aparte (campo `tamano` del pedido): se usa igual para
 * desempatar y tiene prioridad sobre el de la frase.
 */
export async function buscarProductosPorTexto(
  client: pg.PoolClient,
  tenantId: string,
  busqueda: string,
  tamanoExplicito?: string | null
): Promise<ResultadoBusquedaProducto> {
  const enFrase = extraerTamano(busqueda)
  const explicito = tamanoExplicito ? extraerTamano(tamanoExplicito).tamano : null
  const tamano = explicito ?? enFrase.tamano

  // Si la frase era solo el tamaño ("individual"), no queda producto que buscar: se usa la frase entera.
  const textoProducto = enFrase.tamano && tienePalabrasDeProducto(enFrase.texto) ? enFrase.texto : busqueda
  const bProducto = construirBusqueda(textoProducto)
  const bLiteral = construirBusqueda(busqueda)

  const { rows } = await client.query(
    `select p.id, p.slug, p.nombre, p.precio_base, p.disponible, p.anticipacion_horas, p.category_id,
            (p.slug = $2) as es_slug,
            ${sqlCoincideEstricto('p.nombre', '$5')} as literal,
            ${sqlCoincideEstricto('p.nombre', '$3')} as estricto,
            coalesce(
              (select jsonb_agg(jsonb_build_object('tamano', ps.tamano, 'precio', ps.precio) order by ps.precio)
                 from product_sizes ps where ps.product_id = p.id and ps.tamano is not null),
              '[]'
            ) as tamanos
     from products p
     where p.tenant_id = $1
       and (p.slug = $2 or ${sqlCoincide('p.nombre', '$3', '$4')} or ${sqlCoincide('p.nombre', '$5', '$6')})
     order by es_slug desc, literal desc, estricto desc, length(p.nombre), p.nombre
     limit 25`,
    [tenantId, busqueda, bProducto.estrictos, bProducto.flexibles, bLiteral.estrictos, bLiteral.flexibles]
  )

  const candidatos = rows.map((r, orden) => {
    const tamanos = r.tamanos as { tamano: string; precio: string }[]
    const tieneTamano = tamano ? resolverTamano(tamano, tamanos.map((t) => t.tamano)) !== null : false
    return { r, orden, tieneTamano, tamanos }
  })
  // Orden final: slug exacto > el nombre contiene lo que dijo > tiene el tamaño pedido > calza todas las palabras
  // del producto > (el orden de la consulta: nombre más corto, alfabético).
  const clave = (c: (typeof candidatos)[number]) =>
    `${c.r.es_slug ? 1 : 0}${c.r.literal ? 1 : 0}${c.tieneTamano ? 1 : 0}${c.r.estricto ? 1 : 0}`
  candidatos.sort((a, b) => clave(b).localeCompare(clave(a)) || a.orden - b.orden)

  const mejor = candidatos[0]
  if (!mejor) return { tamano, mejor: null, otras: [] }

  const otras = mejor.r.es_slug
    ? []
    : candidatos
        .slice(1)
        .filter((c) => clave(c) === clave(mejor))
        .slice(0, 5)
        .map((c) => c.r.nombre as string)

  return {
    tamano,
    mejor: {
      id: mejor.r.id,
      slug: mejor.r.slug,
      nombre: mejor.r.nombre,
      precio_base: mejor.r.precio_base,
      disponible: mejor.r.disponible,
      anticipacion_horas: mejor.r.anticipacion_horas,
      category_id: mejor.r.category_id,
      tamanos: mejor.tamanos,
    },
    otras,
  }
}

/**
 * Resuelve UN producto por slug exacto o texto aproximado — el bot (a
 * diferencia de apps/web, que ya conoce el slug real del catálogo
 * estructurado) solo tiene el nombre que escribió el cliente, mismo
 * criterio de búsqueda que ya usa consultarPrecio en bot/tools.ts. El slug
 * exacto sigue matcheando primero — no cambia el comportamiento para quien
 * ya manda el slug real. Entiende el tamaño en la frase (ver buscarProductosPorTexto).
 */
export async function productoParaPedidoPorBusqueda(
  client: pg.PoolClient,
  tenantId: string,
  busqueda: string,
  tamanoExplicito?: string | null
): Promise<ProductoParaPedido | null> {
  return (await buscarProductosPorTexto(client, tenantId, busqueda, tamanoExplicito)).mejor
}

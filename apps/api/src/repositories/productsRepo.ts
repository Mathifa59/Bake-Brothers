import type pg from 'pg'

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
  anticipacion_horas: number
  category_id: string | null
  tamanos_validos: string[]
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

export async function productosParaPedido(
  client: pg.PoolClient,
  tenantId: string,
  slugs: string[]
): Promise<ProductoParaPedido[]> {
  const { rows } = await client.query(
    `select p.id, p.slug, p.nombre, p.precio_base, p.disponible, p.anticipacion_horas, p.category_id,
            coalesce(array_agg(ps.tamano) filter (where ps.tamano is not null), '{}') as tamanos_validos
     from products p
     left join product_sizes ps on ps.product_id = p.id
     where p.tenant_id = $1 and p.slug = any($2)
     group by p.id`,
    [tenantId, slugs]
  )
  return rows
}

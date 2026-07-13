import type pg from 'pg'

/**
 * Cupo máximo configurado para una categoría en una fecha.
 * `null` = sin límite configurado. Un día bloqueado equivale a cupo 0.
 */
export async function cupoMaximoDelDia(
  client: pg.PoolClient,
  tenantId: string,
  categoryId: string,
  fechaISO: string
): Promise<number | null> {
  const { rows } = await client.query(
    `select cupo_maximo, bloqueado from production_capacity
     where tenant_id = $1 and category_id = $2 and fecha = $3`,
    [tenantId, categoryId, fechaISO]
  )
  if (!rows[0]) return null
  return rows[0].bloqueado ? 0 : rows[0].cupo_maximo
}

/** Unidades ya comprometidas (pedidos no cancelados) para esa categoría y fecha. */
export async function unidadesReservadas(
  client: pg.PoolClient,
  tenantId: string,
  categoryId: string,
  fechaISO: string
): Promise<number> {
  const { rows } = await client.query(
    `select coalesce(sum(oi.cantidad), 0)::int as total
     from order_items oi
     join orders o on o.id = oi.order_id
     join products p on p.id = oi.product_id
     where oi.tenant_id = $1 and p.category_id = $2
       and o.fecha_entrega = $3 and o.estado <> 'cancelled'`,
    [tenantId, categoryId, fechaISO]
  )
  return rows[0].total
}

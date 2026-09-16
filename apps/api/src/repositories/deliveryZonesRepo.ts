import type pg from 'pg'

export async function listarZonas(client: pg.PoolClient, tenantId: string): Promise<string[]> {
  const { rows } = await client.query(
    `select nombre from delivery_zones where tenant_id = $1 and activo order by orden`,
    [tenantId]
  )
  return rows.map((r) => r.nombre)
}

// La tarifa automática por zona se retiró en 0004_rediseno_alcance.sql: el
// delivery ahora lo cotiza el operador manualmente (ver POST /api/orders).

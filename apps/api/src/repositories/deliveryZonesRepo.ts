import type pg from 'pg'

export async function listarZonas(client: pg.PoolClient, tenantId: string): Promise<string[]> {
  const { rows } = await client.query(
    `select nombre from delivery_zones where tenant_id = $1 and activo order by orden`,
    [tenantId]
  )
  return rows.map((r) => r.nombre)
}

/** Devuelve la tarifa de la zona (null = usar la tarifa global del dominio), o undefined si la zona no existe/está inactiva. */
export async function tarifaDeZona(
  client: pg.PoolClient,
  tenantId: string,
  nombre: string
): Promise<number | null | undefined> {
  const { rows } = await client.query(
    `select tarifa_delivery from delivery_zones where tenant_id = $1 and nombre = $2 and activo`,
    [tenantId, nombre]
  )
  if (!rows[0]) return undefined
  return rows[0].tarifa_delivery === null ? null : Number(rows[0].tarifa_delivery)
}

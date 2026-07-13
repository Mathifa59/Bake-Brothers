import type pg from 'pg'
import type { Cupon } from '@bakebrothers/domain'

export async function cuponVigente(
  client: pg.PoolClient,
  tenantId: string,
  codigo: string
): Promise<(Cupon & { codigo: string }) | null> {
  const { rows } = await client.query(
    `select codigo, tipo, valor from coupons
     where tenant_id = $1 and codigo = $2 and activo
       and (valido_desde is null or valido_desde <= now())
       and (valido_hasta is null or valido_hasta >= now())`,
    [tenantId, codigo.trim().toUpperCase()]
  )
  if (!rows[0]) return null
  return { codigo: rows[0].codigo, tipo: rows[0].tipo, valor: Number(rows[0].valor) }
}

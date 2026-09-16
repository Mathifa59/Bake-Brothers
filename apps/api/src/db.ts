import pg from 'pg'
import { env } from './env.js'

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  // Supabase exige TLS; en local (localhost) no hace falta.
  ssl: env.DATABASE_URL.includes('localhost') ? undefined : { rejectUnauthorized: false },
})

/**
 * Ejecuta `fn` dentro de una transacción. Bake Brothers es el único negocio
 * de este proyecto (0004_rediseno_alcance.sql retiró el aislamiento
 * multi-tenant y sus políticas RLS), así que ya no hace falta fijar ningún
 * GUC de tenant — `tenantId` se conserva como parámetro porque cada
 * repositorio sigue filtrando por columna `tenant_id` en su SQL.
 */
export async function withTenantTx<T>(
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export interface Tenant {
  id: string
  slug: string
  nombre: string
  codigo_prefijo: string
}

const cacheTenants = new Map<string, Tenant>()

/** Resuelve un tenant por slug (la tabla tenants es de solo lectura para la API). */
export async function tenantPorSlug(slug: string): Promise<Tenant | null> {
  const cacheado = cacheTenants.get(slug)
  if (cacheado) return cacheado
  const { rows } = await pool.query<Tenant>(
    'select id, slug, nombre, codigo_prefijo from tenants where slug = $1',
    [slug]
  )
  const tenant = rows[0] ?? null
  if (tenant) cacheTenants.set(slug, tenant)
  return tenant
}

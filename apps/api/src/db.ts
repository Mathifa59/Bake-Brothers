import pg from 'pg'
import { env } from './env.js'

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  // Supabase exige TLS; en local (localhost) no hace falta.
  ssl: env.DATABASE_URL.includes('localhost') ? undefined : { rejectUnauthorized: false },
})

/**
 * Ejecuta `fn` dentro de una transacción con `app.tenant_id` fijado, de modo
 * que las políticas RLS filtren todo por tenant. El GUC es transaccional
 * (`set_config(..., true)`), así que no puede filtrarse a otro request que
 * reutilice la misma conexión del pool.
 */
export async function withTenantTx<T>(
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query("select set_config('app.tenant_id', $1, true)", [tenantId])
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

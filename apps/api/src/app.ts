import Fastify, { type FastifyError } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { ZodError } from 'zod'
import { env } from './env.js'
import { tenantPorSlug } from './db.js'
import { productsRoutes } from './routes/products.js'
import { categoriesRoutes } from './routes/categories.js'
import { availabilityRoutes } from './routes/availability.js'
import { ordersRoutes } from './routes/orders.js'
import { webhookRoutes } from './routes/webhook.js'
import { dashboardOrdersRoutes } from './routes/dashboardOrders.js'
import { dashboardConversacionesRoutes } from './routes/dashboardConversaciones.js'

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string
    tenantSlug: string
  }
}

// Orígenes con permiso para llamar a la API. `origin: true` (reflejar
// cualquier origen) era razonable mientras nada estaba desplegado; ahora que
// apps/web sí lo está, se restringe a una lista explícita: la landing real
// en Vercel (con su alias de rama) + localhost para desarrollo.
const ORIGENES_PERMITIDOS = [
  'https://bake-brothers.com',
  // El dominio raíz redirige a "www" como versión oficial en Vercel — el
  // navegador manda Origin con "www", así que hace falta el permiso aparte
  // (CORS no considera un dominio y su "www" el mismo origen).
  'https://www.bake-brothers.com',
  'https://bake-brothers-git-main-mathias-projects-eaced134.vercel.app',
  'http://localhost:5173',
  // apps/admin — el puente nuevo (POST /api/dashboard/orders) lo llama
  // directo desde el navegador del operador.
  'https://bake-brothers-admin.vercel.app',
  'http://localhost:5174',
]

export async function buildApp() {
  const app = Fastify({ logger: true })

  // Cross-Origin-Resource-Policy: 'cross-origin' porque esta API la consume
  // apps/web desde otro origen (bake-brothers.com) — el default de helmet
  // ('same-origin') bloquearía esas respuestas en el navegador aunque CORS
  // (abajo) las permita: son dos mecanismos independientes del browser.
  await app.register(helmet, { crossOriginResourcePolicy: { policy: 'cross-origin' } })

  // Límite razonable por IP para los endpoints públicos (catálogo, webhook
  // de Meta) — hoy no hay ningún límite, cualquiera puede pegarle sin freno.
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })

  await app.register(cors, { origin: ORIGENES_PERMITIDOS })

  app.decorateRequest('tenantId', '')
  app.decorateRequest('tenantSlug', '')

  // Resuelve el tenant del request (header X-Tenant-Slug, con default en dev).
  // Toda ruta /api/* corre después con app.tenant_id fijado vía withTenantTx.
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return
    const slug = (req.headers['x-tenant-slug'] as string | undefined) ?? env.DEFAULT_TENANT_SLUG
    const tenant = await tenantPorSlug(slug)
    if (!tenant) {
      return reply.code(404).send({ error: 'TENANT_NO_ENCONTRADO', tenant: slug })
    }
    req.tenantId = tenant.id
    req.tenantSlug = tenant.slug
  })

  app.setErrorHandler((err: FastifyError, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: 'VALIDACION',
        detalles: err.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
      })
    }
    // Errores de plugins de confianza (rate-limit → 429, body JSON malformado
    // → 400, etc.) ya traen su propio statusCode 4xx — antes se pisaban acá
    // con un 500 genérico sin importar cuál fuera. Solo lo que de verdad no
    // se esperaba (5xx o sin statusCode) sigue devolviendo 500 sin detalle.
    if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.message })
    }
    app.log.error(err)
    return reply.code(500).send({ error: 'ERROR_INTERNO' })
  })

  app.get('/health', async () => ({ ok: true }))

  productsRoutes(app)
  categoriesRoutes(app)
  availabilityRoutes(app)
  ordersRoutes(app)
  webhookRoutes(app)
  dashboardOrdersRoutes(app)
  dashboardConversacionesRoutes(app)

  return app
}

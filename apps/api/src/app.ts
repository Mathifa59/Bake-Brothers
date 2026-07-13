import Fastify from 'fastify'
import cors from '@fastify/cors'
import { ZodError } from 'zod'
import { env } from './env.js'
import { tenantPorSlug } from './db.js'
import { productsRoutes } from './routes/products.js'
import { categoriesRoutes } from './routes/categories.js'
import { deliveryZonesRoutes } from './routes/deliveryZones.js'
import { availabilityRoutes } from './routes/availability.js'
import { ordersRoutes } from './routes/orders.js'

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string
    tenantSlug: string
  }
}

export async function buildApp() {
  const app = Fastify({ logger: true })

  await app.register(cors, { origin: true })

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

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: 'VALIDACION',
        detalles: err.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
      })
    }
    app.log.error(err)
    return reply.code(500).send({ error: 'ERROR_INTERNO' })
  })

  app.get('/health', async () => ({ ok: true }))

  productsRoutes(app)
  categoriesRoutes(app)
  deliveryZonesRoutes(app)
  availabilityRoutes(app)
  ordersRoutes(app)

  return app
}

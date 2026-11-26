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
import { dashboardPushRoutes } from './routes/dashboardPush.js'
import { dashboardProduccionRoutes } from './routes/dashboardProduccion.js'
import { dashboardWhatsAppRoutes } from './routes/dashboardWhatsApp.js'
import { dashboardSimuladorRoutes } from './routes/dashboardSimulador.js'
import { dashboardMifactRoutes } from './routes/dashboardMifact.js'
import { dashboardComprobantesRoutes } from './routes/dashboardComprobantes.js'
import { dashboardEquipoRoutes } from './routes/dashboardEquipo.js'
import { dashboardPorcionadoRoutes } from './routes/dashboardPorcionado.js'
import { dashboardUnidadesRoutes } from './routes/dashboardUnidades.js'
import { commitDesplegado } from './version.js'

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string
    tenantSlug: string
  }
}

// Orígenes con permiso para llamar a la API. `origin: true` (reflejar cualquier origen) era razonable mientras nada
// estaba desplegado; ahora es una lista explícita: los dominios propios de la landing y del panel + localhost para
// desarrollo + las vistas previas del panel en Vercel.
//
// Limpieza del 2026-11-26: se quitaron los dominios anteriores (bake-brothers.com y su www, dashboard.bake-brothers.com,
// bake-brothers-admin.vercel.app y el alias de rama de la landing en Vercel). Todos redirigen (307/308) a los dominios
// nuevos, así que el navegador ya no llama a la API desde ellos. (api.bake-brothers.com es esta API, no un origen.)
const ORIGENES_PERMITIDOS = [
  // La landing vive en www.bakebrothers.pe (el dominio raíz redirige ahí) y el panel en dashboard.bakebrothers.pe.
  'https://www.bakebrothers.pe',
  'https://bakebrothers.pe',
  'https://dashboard.bakebrothers.pe',
  // Desarrollo local: la landing (Vite, 5173) y el panel (Vite, 5174).
  'http://localhost:5173',
  'http://localhost:5174',
  // Vistas previas de apps/admin que Vercel genera por rama/commit (p. ej. la
  // de feature/bake-os, antes de mergear a main). El host exacto cambia en
  // cada deploy y Vercel trunca los nombres largos, así que no se puede
  // listar uno por uno: se acepta el patrón <proyecto>-<...>-<equipo>.vercel.app
  // del proyecto bake-brothers-admin en el equipo de Bake Brothers. La API se
  // autentica con el JWT en el header Authorization (no con cookies), así que
  // un origen ajeno no podría usar CORS para actuar en nombre de nadie.
  /^https:\/\/bake-brothers-admin-[a-z0-9-]+-mathias-projects-eaced134\.vercel\.app$/,
]

export async function buildApp() {
  const app = Fastify({ logger: true })

  // Cross-Origin-Resource-Policy: 'cross-origin' porque esta API la consume
  // la web desde otro origen (www.bakebrothers.pe) — el default de helmet
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

  // Healthcheck de Coolify + verificación externa de qué commit corre. Solo el hash corto; nada más.
  app.get('/health', async () => ({ ok: true, commit: commitDesplegado() }))

  productsRoutes(app)
  categoriesRoutes(app)
  availabilityRoutes(app)
  ordersRoutes(app)
  webhookRoutes(app)
  dashboardOrdersRoutes(app)
  dashboardConversacionesRoutes(app)
  dashboardProduccionRoutes(app)
  dashboardWhatsAppRoutes(app)
  dashboardSimuladorRoutes(app)
  dashboardMifactRoutes(app)
  dashboardComprobantesRoutes(app)
  dashboardEquipoRoutes(app)
  dashboardPorcionadoRoutes(app)
  dashboardUnidadesRoutes(app)
  dashboardPushRoutes(app)

  return app
}

import type { FastifyInstance } from 'fastify'
import { withTenantTx } from '../db.js'

export function categoriesRoutes(app: FastifyInstance) {
  // Mismo shape que el array `categorias` del mock original.
  app.get('/api/categories', async (req) => {
    return withTenantTx(req.tenantId, async (client) => {
      const { rows } = await client.query(
        `select slug, nombre, tipo_producto, emoji, foto_url, gradiente_desde, gradiente_hasta, descripcion
         from categories where tenant_id = $1 order by orden`,
        [req.tenantId]
      )
      return rows.map((r) => ({
        id: r.slug,
        nombre: r.nombre,
        tipo: r.tipo_producto,
        emoji: r.emoji,
        foto: r.foto_url,
        g: [r.gradiente_desde, r.gradiente_hasta],
        texto: r.descripcion,
      }))
    })
  })
}

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { withTenantTx } from '../db.js'
import { listarProductos, productoPorSlug } from '../repositories/productsRepo.js'

const filtrosSchema = z.object({
  categoria: z.string().optional(),
  tipo: z.string().optional(),
})

export function productsRoutes(app: FastifyInstance) {
  app.get('/api/products', async (req) => {
    const filtros = filtrosSchema.parse(req.query)
    return withTenantTx(req.tenantId, (client) => listarProductos(client, req.tenantId, filtros))
  })

  app.get('/api/products/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params)
    const producto = await withTenantTx(req.tenantId, (client) =>
      productoPorSlug(client, req.tenantId, id)
    )
    if (!producto) return reply.code(404).send({ error: 'PRODUCTO_NO_ENCONTRADO' })
    return producto
  })
}

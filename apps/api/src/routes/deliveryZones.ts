import type { FastifyInstance } from 'fastify'
import { withTenantTx } from '../db.js'
import { listarZonas } from '../repositories/deliveryZonesRepo.js'

export function deliveryZonesRoutes(app: FastifyInstance) {
  // Devuelve string[] — idéntico al array `distritos` del mock original.
  app.get('/api/delivery-zones', async (req) => {
    return withTenantTx(req.tenantId, (client) => listarZonas(client, req.tenantId))
  })
}

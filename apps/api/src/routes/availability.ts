import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { cupoRestante } from '@bakebrothers/domain'
import { withTenantTx } from '../db.js'
import { cupoMaximoDelDia, unidadesReservadas } from '../repositories/capacityRepo.js'

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date debe ser YYYY-MM-DD'),
  type: z.string().min(1), // slug de categoría ('tortas', 'bocaditos', …)
})

export function availabilityRoutes(app: FastifyInstance) {
  app.get('/api/availability', async (req, reply) => {
    const { date, type } = querySchema.parse(req.query)
    return withTenantTx(req.tenantId, async (client) => {
      const categoria = await client.query(
        `select id from categories where tenant_id = $1 and slug = $2`,
        [req.tenantId, type]
      )
      if (!categoria.rows[0]) {
        return reply.code(404).send({ error: 'CATEGORIA_NO_ENCONTRADA' })
      }
      const categoryId = categoria.rows[0].id
      const cupoMaximo = await cupoMaximoDelDia(client, req.tenantId, categoryId, date)
      const reservadas = await unidadesReservadas(client, req.tenantId, categoryId, date)
      return {
        fecha: date,
        tipo: type,
        cupoMaximo,             // null = sin límite configurado
        unidadesReservadas: reservadas,
        cupoDisponible: cupoRestante({ cupoMaximo, unidadesReservadas: reservadas }),
      }
    })
  })
}

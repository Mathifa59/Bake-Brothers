import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { withTenantTx } from '../db.js'
import { verificarJwtOperador } from '../auth/verificarJwtOperador.js'
import { soloAdmin } from '../auth/soloAdmin.js'
import { guardarCodigosMifact } from '../services/mifactCodigos.js'

const bodySchema = z.object({
  asignaciones: z
    .array(
      z.object({
        tipo: z.enum(['producto', 'tamano']),
        id: z.string().uuid(),
        // Texto corto sin saltos de línea ni caracteres de control (se guarda tal cual lo escribe Mifact).
        almacen: z.string().trim().min(1).max(40).regex(/^[^\x00-\x1f\x7f]+$/),
        codigo: z
          .string()
          .trim()
          .min(1)
          .max(60)
          .regex(/^[^\x00-\x1f\x7f]+$/, 'el código no puede traer saltos de línea ni caracteres de control'),
        codigoBarras: z.string().trim().max(60).nullish(),
      })
    )
    .min(1)
    .max(500),
})

/**
 * Importador del catálogo de Mifact (pantalla solo admin de apps/admin). El Excel se
 * lee y se cruza en el navegador; lo único que llega acá es la lista de códigos a
 * guardar — se guarda SOLO el código, jamás un precio ni un nombre.
 */
export function dashboardMifactRoutes(app: FastifyInstance) {
  app.post(
    '/api/dashboard/mifact/codigos',
    { preHandler: [verificarJwtOperador, soloAdmin] },
    async (req, reply) => {
      const { asignaciones } = bodySchema.parse(req.body)
      const resultados = await withTenantTx(req.tenantId, (client) =>
        guardarCodigosMifact(client, req.tenantId, asignaciones)
      )
      const cuenta = (r: string) => resultados.filter((x) => x.resultado === r).length
      return reply.code(200).send({
        resultados,
        resumen: {
          guardados: cuenta('guardado'),
          iguales: cuenta('igual'),
          rechazados: resultados.length - cuenta('guardado') - cuenta('igual'),
        },
      })
    }
  )
}

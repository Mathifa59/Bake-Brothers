import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { withTenantTx } from '../db.js'
import { verificarJwtOperador } from '../auth/verificarJwtOperador.js'
import { responderConversacion } from '../services/responderConversacion.js'

const ERROR_A_CODIGO_HTTP: Record<string, number> = {
  CONVERSACION_NO_ENCONTRADA: 404,
  SIN_ACCESO_A_LA_CONVERSACION: 403,
  CONVERSACION_SIN_SEDE_ASIGNADA: 422,
  SEDE_SIN_WHATSAPP_CONFIGURADO: 422,
  // El envío falló contra la Cloud API real de Meta (o falta el token
  // todavía) — es un fallo de un servicio externo, no un error del cliente.
  ENVIO_FALLIDO: 502,
}

const responderConversacionSchema = z.object({
  texto: z.string().trim().min(1),
})

/** Rutas del puente apps/admin → apps/api para la bandeja de Conversaciones. Exigen JWT real — ver auth/verificarJwtOperador.ts. */
export function dashboardConversacionesRoutes(app: FastifyInstance) {
  app.post(
    '/api/dashboard/conversaciones/:id/responder',
    { preHandler: verificarJwtOperador },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params)
      const { texto } = responderConversacionSchema.parse(req.body)
      const operador = req.operador!

      const resultado = await withTenantTx(req.tenantId, (client) =>
        responderConversacion(client, req.tenantId, operador, id, texto)
      )

      if (!resultado.ok) {
        const codigo = ERROR_A_CODIGO_HTTP[resultado.error] ?? 502
        return reply.code(codigo).send(resultado)
      }
      return reply.code(200).send(resultado)
    }
  )
}

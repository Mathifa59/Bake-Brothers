import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { withTenantTx } from '../db.js'
import { exigirAdmin, verificarJwtOperador } from '../auth/verificarJwtOperador.js'
import { responderConversacion } from '../services/responderConversacion.js'
import { asignarSedeDeConversacion, gestionarConversacion, type AccionConversacion } from '../services/gestionarConversacion.js'

const ERROR_A_CODIGO_HTTP: Record<string, number> = {
  CONVERSACION_NO_ENCONTRADA: 404,
  SIN_ACCESO_A_LA_CONVERSACION: 403,
  CONVERSACION_SIN_SEDE_ASIGNADA: 422,
  SEDE_SIN_WHATSAPP_CONFIGURADO: 422,
  SEDE_NO_VALIDA: 422,
  // Pasaron más de 24 h desde el último mensaje del cliente: solo plantillas aprobadas.
  VENTANA_24H_CERRADA: 409,
  TRANSICION_NO_VALIDA: 409,
  // El envío falló contra la Cloud API real de Meta (o falta el token
  // todavía) — es un fallo de un servicio externo, no un error del cliente.
  ENVIO_FALLIDO: 502,
}

const responderConversacionSchema = z.object({
  texto: z.string().trim().min(1),
})

const idSchema = z.object({ id: z.string().uuid() })

/** Rutas del puente apps/admin → apps/api para la bandeja de Conversaciones. Exigen JWT real — ver auth/verificarJwtOperador.ts. */
export function dashboardConversacionesRoutes(app: FastifyInstance) {
  app.post(
    '/api/dashboard/conversaciones/:id/responder',
    { preHandler: verificarJwtOperador },
    async (req, reply) => {
      const { id } = idSchema.parse(req.params)
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

  // Tomar / devolver al bot / cerrar. Solo cambian el estado de la conversación (y, al tomar una sin local, le
  // ponen el local de quien la toma); no mandan ningún mensaje.
  for (const accion of ['tomar', 'devolver', 'cerrar'] as AccionConversacion[]) {
    app.post(`/api/dashboard/conversaciones/:id/${accion}`, { preHandler: verificarJwtOperador }, async (req, reply) => {
      const { id } = idSchema.parse(req.params)
      const { sedeId } = z.object({ sedeId: z.string().uuid().nullish() }).parse(req.body ?? {})
      const operador = req.operador!

      const resultado = await withTenantTx(req.tenantId, (client) =>
        gestionarConversacion(client, req.tenantId, operador, id, accion, { sedeId })
      )
      if (!resultado.ok) return reply.code(ERROR_A_CODIGO_HTTP[resultado.error] ?? 400).send(resultado)
      return reply.code(200).send(resultado)
    })
  }

  // Solo dirección: asignar el local de una conversación sin tomarla.
  app.post(
    '/api/dashboard/conversaciones/:id/sede',
    { preHandler: [verificarJwtOperador, exigirAdmin] },
    async (req, reply) => {
      const { id } = idSchema.parse(req.params)
      const { sedeId } = z.object({ sedeId: z.string().uuid().nullable() }).parse(req.body)
      const resultado = await withTenantTx(req.tenantId, (client) => asignarSedeDeConversacion(client, req.tenantId, id, sedeId))
      if (!resultado.ok) return reply.code(ERROR_A_CODIGO_HTTP[resultado.error] ?? 400).send(resultado)
      return reply.code(200).send(resultado)
    }
  )
}

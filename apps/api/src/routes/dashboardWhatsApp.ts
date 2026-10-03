import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { withTenantTx } from '../db.js'
import { verificarJwtOperador, exigirAdmin } from '../auth/verificarJwtOperador.js'
import { cifrarTokenWhatsApp } from '../bot/tokensWhatsApp.js'
import { registrarConexionWhatsApp, SedeNoEncontradaError } from '../repositories/whatsappConexionesRepo.js'

const registroManualSchema = z.object({
  sedeId: z.string().uuid(),
  wabaId: z.string().trim().min(1),
  phoneNumberId: z.string().trim().min(1),
  token: z.string().trim().min(10),
  // 'prueba' por defecto: el uso previsto de esta ruta es el número de prueba
  // de DevHorses (ensayos y videos del App Review antes de que el Embedded
  // Signup esté aprobado). Un token de negocio real también se acepta.
  tipoToken: z.enum(['prueba', 'negocio']).default('prueba'),
})

/**
 * Rutas de administración de las conexiones de WhatsApp. Solo admin — el
 * token entra por el cuerpo UNA vez, se cifra antes de tocar la base y no
 * vuelve a salir por ninguna ruta (ni en la respuesta de esta misma).
 */
export function dashboardWhatsAppRoutes(app: FastifyInstance) {
  app.post(
    '/api/dashboard/whatsapp/conexiones/manual',
    { preHandler: [verificarJwtOperador, exigirAdmin] },
    async (req, reply) => {
      const datos = registroManualSchema.parse(req.body)
      try {
        const conexion = await withTenantTx(req.tenantId, (client) =>
          registrarConexionWhatsApp(client, {
            sedeId: datos.sedeId,
            wabaId: datos.wabaId,
            phoneNumberId: datos.phoneNumberId,
            tokenCifrado: cifrarTokenWhatsApp(datos.token),
            tipoToken: datos.tipoToken,
            origen: 'manual',
          })
        )
        return reply.code(200).send({
          ok: true,
          conexion: {
            id: conexion.id,
            sedeId: conexion.sedeId,
            wabaId: conexion.wabaId,
            phoneNumberId: conexion.phoneNumberId,
            tipoToken: conexion.tipoToken,
            origen: conexion.origen,
            estado: conexion.estado,
          },
        })
      } catch (err) {
        if (err instanceof SedeNoEncontradaError) {
          return reply.code(404).send({ error: 'SEDE_NO_ENCONTRADA' })
        }
        throw err
      }
    }
  )
}

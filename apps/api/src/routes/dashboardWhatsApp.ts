import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { withTenantTx } from '../db.js'
import { verificarJwtOperador, exigirAdmin } from '../auth/verificarJwtOperador.js'
import { cifrarTokenWhatsApp } from '../bot/tokensWhatsApp.js'
import { registrarConexionWhatsApp, SedeNoEncontradaError } from '../repositories/whatsappConexionesRepo.js'

const registroManualSchema = z
  .object({
    // Número de un local (uso 'sede'): lleva sedeId. Número del bot (uso 'bot'): no pertenece a una sede.
    uso: z.enum(['sede', 'bot']).default('sede'),
    sedeId: z.string().uuid().nullish(),
    wabaId: z.string().trim().min(1),
    phoneNumberId: z.string().trim().min(1),
    token: z.string().trim().min(10),
    // 'sistema' = token de usuario del sistema (permanente), el del número del bot. 'prueba' por defecto:
    // un número de prueba. Un token de negocio real también se acepta.
    tipoToken: z.enum(['prueba', 'negocio', 'sistema']).default('prueba'),
  })
  .refine((d) => (d.uso === 'bot') === !d.sedeId, {
    message: 'El número de un local necesita sedeId; el del bot no debe llevarlo',
    path: ['sedeId'],
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
            sedeId: datos.sedeId ?? null,
            uso: datos.uso,
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
            uso: conexion.uso,
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

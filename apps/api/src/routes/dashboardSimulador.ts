import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { withTenantTx } from '../db.js'
import { verificarJwtOperador } from '../auth/verificarJwtOperador.js'
import { simularTurno } from '../services/simuladorBot.js'

/** Solo admin: el simulador gasta tokens reales de Claude y crea pedidos (marcados como prueba) en cualquier sede. */
async function exigirAdminSimulador(req: FastifyRequest, reply: FastifyReply) {
  if (req.operador?.rol !== 'admin') {
    return reply.code(403).send({ error: 'SOLO_ADMIN' })
  }
}

const turnoSchema = z.object({
  rol: z.enum(['cliente', 'bot', 'operador']),
  texto: z.string().max(4000),
  en: z.string().max(64),
})

const simuladorSchema = z.object({
  mensaje: z.string().trim().min(1).max(1000),
  // null = simular el NÚMERO DEL BOT (sin sede): el bot pregunta en qué local recoge el cliente, como en producción.
  sedeId: z.string().uuid().nullable(),
  estado: z.enum(['activa', 'escalada', 'atendida_por_operador', 'cerrada']).default('activa'),
  // El historial viaja en cada turno (la conversación vive en el navegador).
  // Tope para que una conversación de prueba no crezca sin límite.
  historial: z.array(turnoSchema).max(60).default([]),
})

const ERROR_A_CODIGO_HTTP: Record<string, number> = {
  SEDE_NO_ENCONTRADA: 404,
}

/**
 * Puente apps/admin → apps/api para la pantalla "Simulador del bot". Protegido
 * con el mismo JWT real que el resto del dashboard + rol admin. NO envía nada
 * por WhatsApp — ver services/simuladorBot.ts.
 */
export function dashboardSimuladorRoutes(app: FastifyInstance) {
  app.post(
    '/api/dashboard/simulador/mensaje',
    {
      preHandler: [verificarJwtOperador, exigirAdminSimulador],
      // Más estricto que el límite global (100/min): cada turno puede costar
      // varias llamadas a Claude.
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const body = simuladorSchema.parse(req.body)

      if (!process.env.ANTHROPIC_API_KEY) {
        return reply.code(503).send({
          error: 'SIMULADOR_NO_CONFIGURADO',
          detalle: 'Falta ANTHROPIC_API_KEY en el servidor de la API.',
        })
      }

      try {
        const resultado = await withTenantTx(req.tenantId, (client) =>
          simularTurno(client, req.tenantId, {
            sedeId: body.sedeId,
            historial: body.historial,
            estado: body.estado === 'cerrada' ? 'activa' : body.estado,
            mensaje: body.mensaje,
          })
        )
        if (!resultado.ok) {
          return reply.code(ERROR_A_CODIGO_HTTP[resultado.error] ?? 400).send(resultado)
        }
        return reply.code(200).send(resultado)
      } catch (err) {
        // Un fallo del modelo (clave inválida, sobrecarga, timeout) no es un
        // error del admin ni de la base: se devuelve legible en vez de un 500
        // genérico. La transacción ya hizo rollback (ningún pedido a medias).
        req.log.error(err, 'simulador del bot: falló el turno')
        return reply.code(502).send({
          error: 'MODELO_NO_DISPONIBLE',
          detalle: err instanceof Error ? err.message : 'Error desconocido al consultar el modelo.',
        })
      }
    }
  )
}

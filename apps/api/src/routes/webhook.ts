import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { env } from '../env.js'

const verificacionSchema = z.object({
  'hub.mode': z.string(),
  'hub.verify_token': z.string(),
  'hub.challenge': z.string(),
})

/**
 * Webhook de Meta (WhatsApp/Messenger/Instagram comparten un solo endpoint).
 * GET es el handshake de verificación que Meta exige al configurar el
 * webhook en su dashboard. POST todavía no responde mensajes — solo loggea
 * el payload crudo; la lógica real llega cuando haya credenciales reales de
 * Meta para probarla de punta a punta (fuera de alcance de Semana 2).
 */
export function webhookRoutes(app: FastifyInstance) {
  app.get('/webhook', async (req, reply) => {
    const parseo = verificacionSchema.safeParse(req.query)
    if (!parseo.success) {
      return reply.code(400).send({ error: 'PARAMETROS_INVALIDOS' })
    }
    const { 'hub.mode': modo, 'hub.verify_token': token, 'hub.challenge': challenge } = parseo.data
    if (modo !== 'subscribe' || token !== env.META_VERIFY_TOKEN) {
      return reply.code(403).send({ error: 'VERIFICACION_FALLIDA' })
    }
    // Meta exige el challenge como texto plano, no JSON.
    return reply.code(200).type('text/plain').send(challenge)
  })

  app.post('/webhook', async (req, reply) => {
    app.log.info({ payload: req.body }, 'webhook de Meta recibido')
    return reply.code(200).send()
  })
}

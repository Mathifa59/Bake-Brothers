import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { env } from '../env.js'
import { verificarFirmaWebhook } from '../bot/meta.js'

declare module 'fastify' {
  interface FastifyRequest {
    // Body sin parsear, capturado solo en este router — hace falta tal cual
    // llegó (antes del JSON.parse) porque la firma de Meta se calcula sobre
    // esos bytes exactos, no sobre el objeto ya parseado.
    rawBody?: Buffer
  }
}

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
  // Encapsulado aparte (no directo sobre `app`) para que el content-type
  // parser de abajo — que guarda el body crudo — solo aplique acá, no a
  // /api/orders ni al resto de rutas JSON del servidor.
  app.register(async (instance) => {
    instance.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
      req.rawBody = body as Buffer
      if (body.length === 0) return done(null, {})
      try {
        done(null, JSON.parse(body.toString('utf8')))
      } catch (err) {
        done(err as Error, undefined)
      }
    })

    instance.get('/webhook', async (req, reply) => {
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

    instance.post('/webhook', async (req, reply) => {
      // META_APP_SECRET todavía no existe (falta el App Secret real de Meta,
      // llega junto con las demás credenciales) — mientras no esté seteada,
      // el comportamiento actual no cambia en nada. En cuanto se configure,
      // esto empieza a exigir la firma sin tocar código, y cualquier request
      // sin firma válida se rechaza.
      const appSecret = process.env.META_APP_SECRET
      if (appSecret) {
        const firma = req.headers['x-hub-signature-256'] as string | undefined
        if (!req.rawBody || !verificarFirmaWebhook(req.rawBody, firma, appSecret)) {
          return reply.code(401).send({ error: 'FIRMA_INVALIDA' })
        }
      }
      app.log.info({ payload: req.body }, 'webhook de Meta recibido')
      return reply.code(200).send()
    })
  })
}

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { env } from '../env.js'
import { verificarFirmaWebhook } from '../bot/meta.js'
import { parsearMensajesWhatsApp, detectarCanalNoWhatsApp } from '../bot/parsearMensajesWhatsApp.js'
import { procesarMensajeWhatsAppEnBackground } from '../bot/procesarWebhookWhatsApp.js'
import { marcarMensajeComoProcesado } from '../repositories/conversacionesRepo.js'
import { guardarEventoMetaSinProcesar } from '../repositories/eventosMetaRepo.js'
import { pool, tenantPorSlug } from '../db.js'

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
 * Webhook de Meta (WhatsApp/Messenger/Instagram comparten un solo endpoint,
 * aunque hoy solo WhatsApp tiene parser real — ver parsearMensajesWhatsApp.ts).
 * GET es el handshake de verificación que Meta exige al configurar el
 * webhook en su dashboard.
 *
 * POST responde 200 apenas valida el mensaje (idempotencia incluida) y
 * procesa el resto EN SEGUNDO PLANO, sin esperarlo — Meta considera fallido
 * cualquier webhook que tarde más de ~3s en responder y reintenta el mismo
 * mensaje, y el cerebro del bot (cerebro.ts) puede hacer varias vueltas de
 * tool-use contra Claude, mucho más lento que eso. La única parte síncrona
 * antes de responder es la marca de idempotencia (una sola query rápida) —
 * necesaria ANTES de responder, no después: si se hiciera en el background,
 * un reintento de Meta que llegue muy rápido podría pasar la validación dos
 * veces antes de que la primera corrida termine de marcarlo.
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

      const canalNoWhatsApp = detectarCanalNoWhatsApp(req.body)
      if (canalNoWhatsApp) {
        // Todavía sin parser real para Messenger/Instagram (ver
        // parsearMensajesWhatsApp.ts) — se guarda el payload crudo completo
        // para construirlo después contra ejemplos reales, no a ciegas
        // contra la documentación de Meta. Síncrono (una sola query rápida),
        // antes de responder, mismo criterio que la marca de idempotencia.
        await guardarEventoMetaSinProcesar(pool, canalNoWhatsApp, req.body)
        app.log.info({ canal: canalNoWhatsApp }, 'Evento de Meta fuera de WhatsApp guardado para revisión — sin procesar')
        return reply.code(200).send()
      }

      const mensajes = parsearMensajesWhatsApp(req.body)
      const mensajesNuevos = []
      for (const mensaje of mensajes) {
        // Síncrono a propósito (ver docstring de arriba) — una sola query rápida.
        const esNuevo = await marcarMensajeComoProcesado(pool, mensaje.mensajeId)
        if (esNuevo) mensajesNuevos.push(mensaje)
        else app.log.info({ mensajeId: mensaje.mensajeId }, 'Mensaje de WhatsApp ya procesado antes — Meta reintentó, se ignora')
      }

      reply.code(200).send()

      if (mensajesNuevos.length === 0) return

      const tenant = await tenantPorSlug(env.DEFAULT_TENANT_SLUG)
      if (!tenant) {
        app.log.error({ slug: env.DEFAULT_TENANT_SLUG }, 'Webhook de Meta: no se pudo resolver el tenant por defecto')
        return
      }

      for (const mensaje of mensajesNuevos) {
        // Fire-and-forget: la respuesta ya se mandó arriba, esto sigue
        // corriendo en el mismo proceso (apps/api es un servidor persistente
        // en Coolify, no serverless) sin bloquear nada más.
        void procesarMensajeWhatsAppEnBackground(app.log, tenant.id, mensaje).catch((err) => {
          app.log.error({ err, mensajeId: mensaje.mensajeId }, 'Fallo inesperado no atrapado procesando un mensaje de WhatsApp')
        })
      }
    })
  })
}

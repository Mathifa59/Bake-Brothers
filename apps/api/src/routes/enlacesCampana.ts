import type { FastifyInstance } from 'fastify'
import { enlaceWhatsAppCampana } from '@bakebrothers/domain'
import { pool } from '../db.js'
import { env } from '../env.js'
import { sumarClic } from '../repositories/respuestasAutomaticasRepo.js'

const REFERENCIA_VALIDA = /^[a-z0-9][a-z0-9_-]{1,31}$/

/**
 * Link corto de las respuestas automáticas: GET /w/ig-alfajor. Cuenta el clic y redirige al chat de WhatsApp con el
 * mensaje de la campaña y «(ref: ig-alfajor)» al final (el bot guarda esa referencia en el pedido). Público a propósito:
 * es el link que recibe el cliente en el DM. Una referencia que no es de ninguna regla abre WhatsApp sin campaña (nunca
 * un error para el cliente, y la referencia no se inventa).
 */
export function enlacesCampanaRoutes(app: FastifyInstance) {
  // Llega por el rewrite de Vercel (bakebrothers.pe/w/… → esta ruta): todos los clics comparten las IP de Vercel, así que
  // el límite general (100/min por IP) frenaría un reel viral. Este link solo redirige y suma un clic.
  const opciones = { config: { rateLimit: { max: 1000, timeWindow: '1 minute' } } }
  app.get<{ Params: { referencia: string } }>('/w/:referencia', opciones, async (req, reply) => {
    const referencia = String(req.params.referencia ?? '').toLowerCase()
    const regla = REFERENCIA_VALIDA.test(referencia) ? await sumarClic(pool, referencia).catch(() => null) : null
    const destino = enlaceWhatsAppCampana({
      numero: env.WHATSAPP_ATENCION,
      referencia: regla?.referencia ?? null,
      mensaje: regla?.mensajeWhatsapp ?? 'Hola Bake Brothers 👋',
    })
    return reply.header('Cache-Control', 'no-store').redirect(destino, 302)
  })
}

import crypto from 'node:crypto'
import { env } from '../env.js'
import { obtenerTokenWhatsApp } from './tokensWhatsApp.js'

/**
 * Verifica X-Hub-Signature-256 de un webhook de Meta: HMAC-SHA256 del body
 * crudo (antes de parsear JSON) con el App Secret, formato `sha256=<hex>`.
 * Comparación en tiempo constante (timingSafeEqual) — nunca con `===`, para
 * no filtrar la firma esperada por temporización.
 *
 * Pura y sin efectos — quien la llama decide qué hacer con el resultado
 * (ver routes/webhook.ts: hoy no se enforza porque META_APP_SECRET todavía
 * no existe; en cuanto exista, se activa sin tocar esta función).
 */
export function verificarFirmaWebhook(
  rawBody: Buffer,
  firmaHeader: string | undefined,
  appSecret: string
): boolean {
  if (!firmaHeader) return false
  const [algoritmo, firmaRecibidaHex] = firmaHeader.split('=')
  if (algoritmo !== 'sha256' || !firmaRecibidaHex) return false

  const firmaEsperadaHex = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')

  let bufEsperada: Buffer
  let bufRecibida: Buffer
  try {
    bufEsperada = Buffer.from(firmaEsperadaHex, 'hex')
    bufRecibida = Buffer.from(firmaRecibidaHex, 'hex')
  } catch {
    return false
  }
  if (bufEsperada.length !== bufRecibida.length) return false
  return crypto.timingSafeEqual(bufEsperada, bufRecibida)
}

// Envío real contra la Cloud API de WhatsApp — bot/procesarWebhookWhatsApp.ts
// la llama después de procesarMensajeEntrante, con el texto real que generó
// el cerebro, y la bandeja del dashboard (services/responderConversacion.ts)
// la reusa para las respuestas de un operador. Solo WhatsApp por ahora
// (Messenger/Instagram no tienen parser de entrada real todavía, ver
// bot/parsearMensajesWhatsApp.ts — no tendría sentido implementar su envío
// antes que su recepción).
//
// El token sale de la conexión del número emisor (whatsapp_conexiones, ver
// bot/tokensWhatsApp.ts) — un token de negocio por número, obtenido en el
// Embedded Signup de la app de DevHorses (o registrado a mano para el número
// de prueba). Ya NO existe un token global en una variable de entorno. Sin
// conexión para ese número, falla visiblemente (nunca en silencio, nunca con
// el token de otro número) — mismo criterio de siempre.
export interface ResultadoEnvioMeta {
  /** wamid que devuelve Meta (messages[0].id) — null si la respuesta no lo trae. */
  wamid: string | null
}

export async function enviarMensajeMeta(
  canal: 'whatsapp' | 'facebook' | 'instagram',
  remitentePhoneNumberId: string,
  destinatarioId: string,
  texto: string
): Promise<ResultadoEnvioMeta> {
  if (canal !== 'whatsapp') {
    throw new Error(`enviarMensajeMeta: envío real para el canal "${canal}" todavía no implementado (solo WhatsApp)`)
  }
  const token = await obtenerTokenWhatsApp(remitentePhoneNumberId)

  const res = await fetch(`https://graph.facebook.com/${env.META_GRAPH_VERSION}/${remitentePhoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: destinatarioId,
      type: 'text',
      text: { body: texto },
    }),
  })

  const cuerpo = await res.text().catch(() => '')
  if (!res.ok) {
    throw new Error(`enviarMensajeMeta: la Cloud API de Meta respondió ${res.status} — ${cuerpo}`)
  }
  return { wamid: extraerWamid(cuerpo) }
}

function extraerWamid(cuerpo: string): string | null {
  try {
    const id = (JSON.parse(cuerpo) as { messages?: { id?: unknown }[] }).messages?.[0]?.id
    return typeof id === 'string' ? id : null
  } catch {
    return null
  }
}

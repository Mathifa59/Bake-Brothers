import crypto from 'node:crypto'

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
// el cerebro. Solo WhatsApp por ahora (Messenger/Instagram no tienen parser
// de entrada real todavía, ver bot/parsearMensajesWhatsApp.ts — no tendría
// sentido implementar su envío antes que su recepción).
//
// Gateada por META_WHATSAPP_TOKEN (igual que META_APP_SECRET en
// routes/webhook.ts: se lee directo de process.env, no está en env.ts,
// porque todavía no existe — se configura en Coolify junto con el resto de
// credenciales reales de Meta). Sin la variable, sigue fallando
// visiblemente (nunca en silencio) — mismo criterio de siempre, ahora
// aplicado a la llamada real en vez de a un stub incondicional.
export async function enviarMensajeMeta(
  canal: 'whatsapp' | 'facebook' | 'instagram',
  remitentePhoneNumberId: string,
  destinatarioId: string,
  texto: string
): Promise<void> {
  if (canal !== 'whatsapp') {
    throw new Error(`enviarMensajeMeta: envío real para el canal "${canal}" todavía no implementado (solo WhatsApp)`)
  }
  const token = process.env.META_WHATSAPP_TOKEN
  if (!token) {
    throw new Error(
      'enviarMensajeMeta: falta META_WHATSAPP_TOKEN — no se puede mandar el mensaje real todavía (ver CLAUDE.md §9)'
    )
  }

  const res = await fetch(`https://graph.facebook.com/v21.0/${remitentePhoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: destinatarioId,
      type: 'text',
      text: { body: texto },
    }),
  })

  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    throw new Error(`enviarMensajeMeta: la Cloud API de Meta respondió ${res.status} — ${detalle}`)
  }
}

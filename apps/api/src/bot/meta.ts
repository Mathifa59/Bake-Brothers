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

// TODO(Semana 2/3 — credenciales reales de Meta): implementar el envío real
// contra la Cloud API de WhatsApp/Messenger/Instagram
// (https://graph.facebook.com/v21.0/{phone_number_id}/messages) una vez que
// exista el token permanente de la app de Meta. Necesita, como mínimo:
// META_WHATSAPP_TOKEN (o el que corresponda por canal) y el
// phone_number_id/page_id de la sede que corresponda (ver
// sedes.whatsapp_phone_number_id).
//
// Stub a propósito: nadie en este repo debe poder mandar un mensaje real a
// un cliente todavía sin darse cuenta. No se simula una respuesta exitosa de
// Meta — si algo llega a invocar esta función antes de que esté
// implementada, tiene que fallar visiblemente (excepción), nunca en
// silencio. Ahora mismo nada del código la invoca — ni el bandeja de
// conversaciones de apps/admin (que solo escribe historial/estado en
// Supabase directo), ni ninguna ruta de apps/api.
export async function enviarMensajeMeta(
  _canal: 'whatsapp' | 'facebook' | 'instagram',
  _destinatarioId: string,
  _texto: string
): Promise<never> {
  throw new Error(
    'enviarMensajeMeta no está implementado — falta el token permanente de la Cloud API de Meta (ver CLAUDE.md §9)'
  )
}

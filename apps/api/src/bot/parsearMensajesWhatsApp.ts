/**
 * El mismo webhook de Meta recibe eventos de Messenger (`object: "page"`) e
 * Instagram (`object: "instagram"`) — ninguno de los dos tiene parser real
 * todavía (ver routes/webhook.ts). Se usa solo para saber a qué canal
 * corresponde un evento que se va a guardar sin procesar, no para leer nada
 * de su contenido.
 */
export function detectarCanalNoWhatsApp(payload: unknown): 'facebook' | 'instagram' | null {
  if (typeof payload !== 'object' || payload === null) return null
  const object = (payload as Record<string, unknown>).object
  if (object === 'page') return 'facebook'
  if (object === 'instagram') return 'instagram'
  return null
}

export interface MensajeWhatsAppEntrante {
  mensajeId: string
  telefono: string
  texto: string
  phoneNumberId: string
}

/**
 * Extrae los mensajes de TEXTO reales de un payload crudo de WhatsApp Cloud
 * API (POST /webhook). Un solo delivery de Meta puede traer varios mensajes
 * agrupados (entry[]/changes[]), y también trae eventos que no son mensajes
 * (statuses de entrega/lectura) — esos se ignoran acá, no son un error.
 *
 * Solo texto: el bot (cerebro.ts) hoy no puede ver imágenes/audio/ubicación,
 * así que cualquier otro tipo de mensaje se ignora a propósito en vez de
 * mandarlo al modelo con contenido vacío.
 *
 * Nunca lanza — un payload con forma inesperada simplemente no aporta
 * mensajes (devuelve []), no rompe el webhook.
 */
export function parsearMensajesWhatsApp(payload: unknown): MensajeWhatsAppEntrante[] {
  const mensajes: MensajeWhatsAppEntrante[] = []
  if (typeof payload !== 'object' || payload === null) return mensajes
  const body = payload as Record<string, unknown>
  if (body.object !== 'whatsapp_business_account') return mensajes
  if (!Array.isArray(body.entry)) return mensajes

  for (const entry of body.entry) {
    const changes = (entry as Record<string, unknown> | null)?.changes
    if (!Array.isArray(changes)) continue

    for (const change of changes) {
      const value = (change as Record<string, unknown> | null)?.value as Record<string, unknown> | undefined
      const phoneNumberId = (value?.metadata as Record<string, unknown> | undefined)?.phone_number_id
      const listaMensajes = value?.messages
      if (typeof phoneNumberId !== 'string' || !Array.isArray(listaMensajes)) continue

      for (const msg of listaMensajes) {
        const m = msg as Record<string, unknown>
        if (m.type !== 'text') continue
        const texto = (m.text as Record<string, unknown> | undefined)?.body
        if (typeof m.id !== 'string' || typeof m.from !== 'string' || typeof texto !== 'string') continue
        mensajes.push({ mensajeId: m.id, telefono: m.from, texto, phoneNumberId })
      }
    }
  }
  return mensajes
}

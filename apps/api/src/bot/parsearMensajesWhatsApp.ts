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
  /** Texto del mensaje; en una imagen es el pie de foto (puede venir vacío). */
  texto: string
  phoneNumberId: string
  /** Nombre del perfil de WhatsApp de quien escribe (`contacts[].profile.name`), si Meta lo manda. */
  nombrePerfil?: string
  /**
   * Solo si el mensaje es una imagen (ej. la captura de un pago): el cerebro conversacional no la ve, la procesa
   * bot/procesarCapturaPago.ts. Los demás tipos (audio, video, ubicación, documentos) se siguen ignorando.
   */
  imagen?: { mediaId: string; mimeType: string }
}

/**
 * Extrae los mensajes de TEXTO reales de un payload crudo de WhatsApp Cloud
 * API (POST /webhook). Un solo delivery de Meta puede traer varios mensajes
 * agrupados (entry[]/changes[]), y también trae eventos que no son mensajes
 * (statuses de entrega/lectura) — esos se ignoran acá, no son un error.
 *
 * Texto e imágenes: el texto va al cerebro (cerebro.ts); las imágenes (capturas de pago) las lee aparte
 * bot/procesarCapturaPago.ts. Audio, video, ubicación y documentos se ignoran a propósito en vez de mandarlos al
 * modelo con contenido vacío.
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

      // Meta manda el nombre del perfil aparte, en `contacts`, enlazado por wa_id.
      const nombres = new Map<string, string>()
      if (Array.isArray(value?.contacts)) {
        for (const c of value.contacts as Record<string, unknown>[]) {
          const nombre = (c?.profile as Record<string, unknown> | undefined)?.name
          if (typeof c?.wa_id === 'string' && typeof nombre === 'string' && nombre.trim()) nombres.set(c.wa_id, nombre.trim())
        }
      }

      for (const msg of listaMensajes) {
        const m = msg as Record<string, unknown>
        const nombrePerfil = typeof m.from === 'string' ? nombres.get(m.from) : undefined
        if (m.type === 'image') {
          const imagen = m.image as Record<string, unknown> | undefined
          if (typeof m.id !== 'string' || typeof m.from !== 'string' || typeof imagen?.id !== 'string') continue
          mensajes.push({
            mensajeId: m.id,
            telefono: m.from,
            texto: typeof imagen.caption === 'string' ? imagen.caption : '',
            phoneNumberId,
            ...(nombrePerfil ? { nombrePerfil } : {}),
            imagen: { mediaId: imagen.id, mimeType: typeof imagen.mime_type === 'string' ? imagen.mime_type : 'image/jpeg' },
          })
          continue
        }
        if (m.type !== 'text') continue
        const texto = (m.text as Record<string, unknown> | undefined)?.body
        if (typeof m.id !== 'string' || typeof m.from !== 'string' || typeof texto !== 'string') continue
        mensajes.push({ mensajeId: m.id, telefono: m.from, texto, phoneNumberId, ...(nombrePerfil ? { nombrePerfil } : {}) })
      }
    }
  }
  return mensajes
}

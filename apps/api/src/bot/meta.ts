import crypto from 'node:crypto'
import { env } from '../env.js'
import { normalizarPlantillaMeta, type ComponenteEnvio, type PlantillaWhatsApp } from '@bakebrothers/domain'
import { obtenerConexionConToken, obtenerTokenWhatsApp } from './tokensWhatsApp.js'

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

/**
 * Las plantillas APROBADAS del WABA de ese número, leídas de Meta (`GET /{waba_id}/message_templates`): no se
 * escriben a mano en Bake OS. Devuelve todas las aprobadas, con `soportada` indicando cuáles se pueden mandar desde el
 * panel (solo texto). Sigue la paginación de Meta (hasta 5 páginas de 100). Falla visible si Meta responde error.
 */
export async function listarPlantillasMeta(remitentePhoneNumberId: string): Promise<PlantillaWhatsApp[]> {
  const { wabaId, token } = await obtenerConexionConToken(remitentePhoneNumberId)
  const campos = 'name,language,status,category,parameter_format,components'
  let url: string | null = `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${encodeURIComponent(wabaId)}/message_templates?fields=${campos}&status=APPROVED&limit=100`
  const plantillas: PlantillaWhatsApp[] = []
  for (let pagina = 0; url && pagina < 5; pagina++) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const cuerpo = await res.text().catch(() => '')
    if (!res.ok) throw new Error(`listarPlantillasMeta: la Cloud API de Meta respondió ${res.status} — ${cuerpo}`)
    let json: { data?: unknown[]; paging?: { next?: unknown } } = {}
    try {
      json = JSON.parse(cuerpo)
    } catch {
      throw new Error('listarPlantillasMeta: Meta devolvió una respuesta que no es JSON')
    }
    for (const t of json.data ?? []) {
      const status = (t as { status?: unknown })?.status
      if (status !== undefined && status !== 'APPROVED') continue
      const p = normalizarPlantillaMeta(t)
      if (p) plantillas.push(p)
    }
    url = typeof json.paging?.next === 'string' ? json.paging.next : null
  }
  return plantillas.sort((a, b) => a.nombre.localeCompare(b.nombre) || a.idioma.localeCompare(b.idioma))
}

/** Envía una plantilla aprobada (`type: template`). Los `componentes` salen de `completarPlantilla` del dominio. */
export async function enviarPlantillaMeta(
  remitentePhoneNumberId: string,
  destinatarioId: string,
  nombre: string,
  idioma: string,
  componentes: ComponenteEnvio[]
): Promise<ResultadoEnvioMeta> {
  const token = await obtenerTokenWhatsApp(remitentePhoneNumberId)
  const res = await fetch(`https://graph.facebook.com/${env.META_GRAPH_VERSION}/${remitentePhoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: destinatarioId,
      type: 'template',
      template: { name: nombre, language: { code: idioma }, ...(componentes.length ? { components: componentes } : {}) },
    }),
  })
  const cuerpo = await res.text().catch(() => '')
  if (!res.ok) throw new Error(`enviarPlantillaMeta: la Cloud API de Meta respondió ${res.status} — ${cuerpo}`)
  return { wamid: extraerWamid(cuerpo) }
}

/** Imagen descargada de WhatsApp, lista para mandarla al modelo. */
export interface MediaDescargada {
  bytes: Buffer
  mimeType: string
}

/** Tope de lo que se descarga (una captura de pantalla pesa unos cientos de KB): evita bajar archivos enormes. */
export const MAX_BYTES_MEDIA = 5 * 1024 * 1024
const MIMES_IMAGEN_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Descarga una imagen que mandó el cliente (WhatsApp Cloud API, dos pasos): primero `GET /{media_id}` devuelve
 * la URL temporal del archivo y su tipo; después se baja esa URL con el mismo token. Usa el token del número que
 * recibió el mensaje (whatsapp_conexiones), igual que el envío. Falla visible si Meta responde error, si el
 * tipo no es una imagen soportada o si pesa más de MAX_BYTES_MEDIA — nunca devuelve algo a medias.
 */
export async function descargarMediaWhatsApp(phoneNumberId: string, mediaId: string): Promise<MediaDescargada> {
  const token = await obtenerTokenWhatsApp(phoneNumberId)
  const cabeceras = { Authorization: `Bearer ${token}` }

  const meta = await fetch(`https://graph.facebook.com/${env.META_GRAPH_VERSION}/${encodeURIComponent(mediaId)}`, { headers: cabeceras })
  if (!meta.ok) throw new Error(`descargarMediaWhatsApp: Meta respondió ${meta.status} al pedir el archivo ${mediaId}`)
  const info = (await meta.json().catch(() => ({}))) as { url?: unknown; mime_type?: unknown; file_size?: unknown }
  if (typeof info.url !== 'string') throw new Error('descargarMediaWhatsApp: Meta no devolvió la URL del archivo')
  const mimeType = typeof info.mime_type === 'string' ? info.mime_type : ''
  if (!MIMES_IMAGEN_PERMITIDOS.includes(mimeType)) throw new Error(`descargarMediaWhatsApp: tipo de archivo no soportado (${mimeType || 'desconocido'})`)
  if (typeof info.file_size === 'number' && info.file_size > MAX_BYTES_MEDIA) throw new Error('descargarMediaWhatsApp: el archivo es demasiado grande')

  const archivo = await fetch(info.url, { headers: cabeceras })
  if (!archivo.ok) throw new Error(`descargarMediaWhatsApp: la descarga respondió ${archivo.status}`)
  const bytes = Buffer.from(await archivo.arrayBuffer())
  if (bytes.length > MAX_BYTES_MEDIA) throw new Error('descargarMediaWhatsApp: el archivo es demasiado grande')
  return { bytes, mimeType }
}

function extraerWamid(cuerpo: string): string | null {
  try {
    const id = (JSON.parse(cuerpo) as { messages?: { id?: unknown }[] }).messages?.[0]?.id
    return typeof id === 'string' ? id : null
  } catch {
    return null
  }
}

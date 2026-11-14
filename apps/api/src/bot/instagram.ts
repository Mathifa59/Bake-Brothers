import { env } from '../env.js'

/**
 * Instagram: lectura de comentarios que llegan por el webhook de Meta y las dos llamadas para responderlos (en público
 * y por DM, «private reply»). Solo comentarios: los mensajes directos de Instagram siguen guardándose crudos en
 * eventos_meta_sin_procesar (el bot no conversa por Instagram).
 *
 * Forma del webhook (campo «comments» de la cuenta profesional):
 *   { object: 'instagram', entry: [{ id: <ig_user_id>, time, changes: [{ field: 'comments',
 *     value: { id: <comment_id>, text, from: { id, username }, media: { id, media_product_type }, parent_id? } }] }] }
 */
export interface ComentarioInstagram {
  /** La cuenta que recibió el comentario (entry[].id): con eso se busca la conexión. */
  igUserId: string
  comentarioId: string
  texto: string
  autorId: string | null
  autorUsuario: string | null
  mediaId: string | null
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

/**
 * Todos los comentarios nuevos de un payload de Instagram. Descarta lo que no es un comentario y los comentarios de la
 * propia cuenta (sus respuestas públicas también llegan como «comments»: contestarlas sería un bucle).
 */
export function parsearComentariosInstagram(payload: unknown): ComentarioInstagram[] {
  if (!esObjeto(payload) || payload.object !== 'instagram' || !Array.isArray(payload.entry)) return []
  const comentarios: ComentarioInstagram[] = []
  for (const entry of payload.entry) {
    if (!esObjeto(entry) || !Array.isArray(entry.changes)) continue
    const igUserId = texto(entry.id)
    if (!igUserId) continue
    for (const change of entry.changes) {
      if (!esObjeto(change) || change.field !== 'comments' || !esObjeto(change.value)) continue
      const v = change.value
      const comentarioId = texto(v.id)
      const cuerpo = typeof v.text === 'string' ? v.text : ''
      if (!comentarioId) continue
      const de = esObjeto(v.from) ? v.from : {}
      const autorId = texto(de.id)
      if (autorId && autorId === igUserId) continue
      comentarios.push({
        igUserId,
        comentarioId,
        texto: cuerpo,
        autorId,
        autorUsuario: texto(de.username),
        mediaId: esObjeto(v.media) ? texto(v.media.id) : null,
      })
    }
  }
  return comentarios
}

export interface ConexionInstagramParaEnviar {
  igUserId: string
  tipo: 'facebook_login' | 'instagram_login'
  pageId: string | null
  token: string
}

/** Error de Meta con el detalle que devuelve (código y mensaje): queda en el registro del comentario y en el panel. */
export class ErrorMetaInstagram extends Error {
  constructor(
    public readonly estado: number,
    public readonly detalle: string
  ) {
    super(`Meta respondió ${estado}: ${detalle}`)
    this.name = 'ErrorMetaInstagram'
  }
}

function host(conexion: ConexionInstagramParaEnviar): string {
  const base = conexion.tipo === 'instagram_login' ? 'https://graph.instagram.com' : 'https://graph.facebook.com'
  return `${base}/${env.META_GRAPH_VERSION}`
}

async function llamarMeta(url: string, token: string, cuerpo: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(cuerpo),
  })
  const datos = await res.json().catch(() => ({}))
  if (!res.ok) {
    const error = esObjeto(datos) && esObjeto(datos.error) ? datos.error : {}
    const detalle = [error.code, error.error_subcode, error.message].filter((x) => x !== undefined && x !== '').join(' · ')
    throw new ErrorMetaInstagram(res.status, (detalle || `HTTP ${res.status}`).slice(0, 400))
  }
  return datos
}

/** Respuesta pública, debajo del comentario. */
export async function responderComentarioEnPublico(
  conexion: ConexionInstagramParaEnviar,
  comentarioId: string,
  mensaje: string
): Promise<void> {
  await llamarMeta(`${host(conexion)}/${encodeURIComponent(comentarioId)}/replies`, conexion.token, { message: mensaje })
}

/**
 * DM a quien comentó («private reply»): se dirige al comentario, no a la persona. Meta permite uno por comentario y
 * dentro de los 7 días siguientes. Con facebook_login sale por la página vinculada; con instagram_login, por la cuenta.
 */
export async function enviarRespuestaPrivada(
  conexion: ConexionInstagramParaEnviar,
  comentarioId: string,
  mensaje: string
): Promise<void> {
  const emisor = conexion.tipo === 'instagram_login' ? conexion.igUserId : conexion.pageId
  if (!emisor) throw new Error('La conexión de Instagram (facebook_login) no tiene page_id: no se puede mandar el DM')
  await llamarMeta(`${host(conexion)}/${encodeURIComponent(emisor)}/messages`, conexion.token, {
    recipient: { comment_id: comentarioId },
    message: { text: mensaje },
  })
}

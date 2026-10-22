/**
 * Atribución de campañas, sin herramientas de analítica externas.
 *
 * Flujo: la landing conserva los parámetros utm de la URL por la que llegó la
 * persona, arma una referencia corta (`tt-halloween`) y la agrega al mensaje
 * prellenado de WhatsApp como "(ref: tt-halloween)". Cuando ese mensaje llega
 * al bot, `extraerReferencia` la saca del texto (el modelo nunca la ve) y se
 * guarda en la conversación; el pedido que cree el bot la lleva en
 * `orders.campana`. Estas funciones son puras y las comparten la landing
 * (armar la referencia) y la API (leerla) — un solo formato para los dos lados.
 */

const LARGO_MAX = 32

// Fuentes frecuentes → abreviatura. Cualquier otra se usa tal cual (recortada).
const ABREVIATURAS_FUENTE: Record<string, string> = {
  tiktok: 'tt',
  instagram: 'ig',
  facebook: 'fb',
  meta: 'fb',
  whatsapp: 'wa',
  google: 'gg',
  youtube: 'yt',
  linkedin: 'li',
  twitter: 'x',
  email: 'em',
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Minúsculas, sin tildes, solo [a-z0-9-], sin guiones de más ni en las puntas. Vacío si no queda nada. */
export function limpiarReferencia(texto: string): string {
  return sinTildes(texto.toLowerCase())
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

type ParametrosUrl = URLSearchParams | Record<string, string | null | undefined>

function leer(params: ParametrosUrl, clave: string): string {
  const valor = params instanceof URLSearchParams ? params.get(clave) : params[clave]
  return (valor ?? '').trim()
}

/**
 * Arma la referencia corta a partir de los parámetros de la URL.
 *  - `?ref=tt-halloween` (a mano) se respeta tal cual, limpiado.
 *  - utm_source + utm_campaign → `tt-halloween` (la fuente abreviada si es conocida).
 *  - Solo una de las dos → esa. Si no hay ninguna, utm_medium. Nada → null.
 * Máximo 32 caracteres (cabe de sobra en un mensaje y en la columna).
 */
export function referenciaDeUtm(params: ParametrosUrl): string | null {
  const manual = limpiarReferencia(leer(params, 'ref'))
  if (manual.length >= 2) return manual.slice(0, LARGO_MAX).replace(/-+$/, '')

  const fuenteCruda = limpiarReferencia(leer(params, 'utm_source'))
  const fuente = ABREVIATURAS_FUENTE[fuenteCruda] ?? fuenteCruda.slice(0, 8).replace(/-+$/, '')
  const campana = limpiarReferencia(leer(params, 'utm_campaign')).slice(0, 24).replace(/-+$/, '')
  const medio = limpiarReferencia(leer(params, 'utm_medium')).slice(0, 12).replace(/-+$/, '')

  const partes = [fuente, campana].filter(Boolean)
  if (partes.length === 0 && medio) partes.push(medio)
  const ref = partes.join('-').slice(0, LARGO_MAX).replace(/-+$/, '')
  return ref.length >= 2 ? ref : null
}

/** Agrega la referencia al final del mensaje de WhatsApp: `Hola… (ref: tt-halloween)`. Sin referencia, el mensaje queda igual. */
export function agregarReferenciaAlMensaje(mensaje: string, referencia: string | null | undefined): string {
  return referencia ? `${mensaje} (ref: ${referencia})` : mensaje
}

// "(ref: tt-halloween)" o "ref: tt-halloween", como palabra suelta (no dentro de otra).
const PATRON_REFERENCIA = /(^|\s)\(?ref:\s*([a-z0-9][a-z0-9_-]{1,31})\)?/i

/**
 * Lee la referencia del texto que escribió el cliente y la quita: devuelve el
 * texto limpio (lo que ve el bot) y la referencia en minúsculas, o null si no
 * traía. Solo se toma la primera.
 */
export function extraerReferencia(texto: string): { texto: string; referencia: string | null } {
  const m = PATRON_REFERENCIA.exec(texto)
  if (!m) return { texto, referencia: null }
  const limpio = (texto.slice(0, m.index) + m[1] + texto.slice(m.index + m[0].length)).replace(/[ \t]{2,}/g, ' ').trim()
  return { texto: limpio, referencia: m[2].toLowerCase() }
}

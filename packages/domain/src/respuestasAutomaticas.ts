/**
 * Respuestas automáticas a comentarios de Instagram («comenta ALFAJOR y te mandamos el link»). Lógica pura y
 * compartida: la API decide con esto si un comentario dispara una regla y qué mandar; el panel la usa para validar y
 * mostrar la vista previa. El envío (Meta) y el guardado viven en apps/api.
 */

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Minúsculas, sin tildes, solo letras y números separados por un espacio. */
export function normalizarPalabras(texto: string): string {
  return sinTildes((texto ?? '').toLowerCase())
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim()
}

/** Formas que se aceptan de una palabra clave: la palabra, y su plural simple (alfajor → alfajores, torta → tortas). */
function formasDe(palabra: string): string[] {
  const base = normalizarPalabras(palabra)
  if (!base) return []
  if (base.includes(' ')) return [base]
  const formas = new Set([base])
  if (/[aeiou]$/.test(base)) formas.add(`${base}s`)
  else formas.add(`${base}es`)
  if (base.endsWith('es')) formas.add(base.slice(0, -2))
  else if (base.endsWith('s')) formas.add(base.slice(0, -1))
  return [...formas].filter((f) => f.length >= 2)
}

/**
 * ¿El comentario trae alguna de las palabras clave? Sin importar mayúsculas, tildes, signos ni emojis, como palabra
 * completa (ALFAJOR no se dispara con «alfajorería»), aceptando el plural simple. Una palabra clave de varias palabras
 * («día de la madre») tiene que aparecer seguida.
 */
export function coincidePalabraClave(comentario: string, palabras: readonly string[]): boolean {
  const texto = ` ${normalizarPalabras(comentario)} `
  if (texto.trim() === '') return false
  return palabras.some((p) => formasDe(p).some((f) => texto.includes(` ${f} `)))
}

export interface ReglaRespuestaAutomatica {
  id: string
  palabras: readonly string[]
  activa: boolean
}

/** La primera regla activa (en el orden recibido: el más antiguo primero) cuyo listado de palabras coincide. */
export function reglaParaComentario<T extends ReglaRespuestaAutomatica>(comentario: string, reglas: readonly T[]): T | null {
  return reglas.find((r) => r.activa && coincidePalabraClave(comentario, r.palabras)) ?? null
}

/**
 * Elige una de las respuestas públicas para un comentario, siempre la misma para el mismo comentario (si Meta reintenta,
 * no cambia) y repartidas entre comentarios distintos para que no se vea robótico. Sin variantes, null (no se responde
 * en público).
 */
export function elegirRespuestaPublica(variantes: readonly string[], comentarioId: string): string | null {
  const validas = variantes.map((v) => v.trim()).filter(Boolean)
  if (validas.length === 0) return null
  let h = 0
  for (const c of comentarioId) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return validas[h % validas.length]
}

/** Texto del DM: el mensaje de la campaña y, al final, el link corto a WhatsApp. */
export function textoDelDm(mensaje: string, enlace: string): string {
  return `${mensaje.trim()}\n\n👉 Pídelo por WhatsApp: ${enlace}`
}

/** Límites que comparten la base (checks de la migración) y el formulario del panel. */
export const LIMITES_RESPUESTA_AUTOMATICA = {
  palabras: 10,
  largoPalabra: 40,
  respuestasPublicas: 4,
  largoRespuestaPublica: 300,
  largoMensajeDm: 800,
  largoMensajeWhatsApp: 200,
} as const

/** Respuestas públicas que el panel propone al crear una regla (se pueden cambiar). */
export const RESPUESTAS_PUBLICAS_SUGERIDAS = [
  '¡Listo! Te escribimos por DM 🍪',
  'Revisa tus mensajes, ahí te dejamos todo 💛',
  '¡Te mandamos la info por interno! 📩',
] as const

/** Horas durante las que la misma persona no vuelve a recibir el DM de la misma campaña (sí la respuesta pública). */
export const HORAS_ENTRE_DMS_MISMA_CAMPANA = 24

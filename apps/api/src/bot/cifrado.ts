import crypto from 'node:crypto'

/**
 * Cifrado de los tokens de negocio de WhatsApp (uno por número conectado, ver
 * migración 0030 / whatsapp_conexiones). AES-256-GCM: confidencialidad +
 * integridad (un token alterado en la base no descifra, en vez de devolver
 * basura). Formato guardado: `v1.<iv>.<tag>.<ciphertext>`, cada parte en
 * base64 — el prefijo de versión deja rotar el esquema después sin adivinar.
 *
 * Sin dependencias de env/db a propósito (la clave entra por parámetro): así
 * `env.ts` puede validar la clave al arrancar sin ciclos de importación, y
 * los tests no necesitan ninguna variable.
 */

const VERSION = 'v1'

/**
 * Acepta 32 bytes en hex (64 caracteres) o base64 (44 caracteres con padding).
 * Devuelve null si no es una clave AES-256 válida — quien la llama decide si
 * eso es un error fatal (env.ts lo es al arrancar).
 */
export function parsearClaveCifrado(valor: string): Buffer | null {
  const limpio = valor.trim()
  if (/^[0-9a-fA-F]{64}$/.test(limpio)) return Buffer.from(limpio, 'hex')
  if (/^[A-Za-z0-9+/]{43}=$/.test(limpio)) {
    const buf = Buffer.from(limpio, 'base64')
    return buf.length === 32 ? buf : null
  }
  return null
}

export function cifrarToken(tokenEnClaro: string, clave: Buffer): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', clave, iv)
  const ct = Buffer.concat([cipher.update(tokenEnClaro, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.')
}

/** Lanza si el formato es inválido, la clave no es la correcta o el valor fue alterado. */
export function descifrarToken(valorCifrado: string, clave: Buffer): string {
  const partes = valorCifrado.split('.')
  if (partes.length !== 4 || partes[0] !== VERSION) {
    throw new Error('descifrarToken: formato de token cifrado no reconocido')
  }
  const [, ivB64, tagB64, ctB64] = partes
  const decipher = crypto.createDecipheriv('aes-256-gcm', clave, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8')
}

import { env } from '../env.js'
import { pool } from '../db.js'
import { conexionActivaPorPhoneNumberId } from '../repositories/whatsappConexionesRepo.js'
import { cifrarToken, descifrarToken, parsearClaveCifrado } from './cifrado.js'

/** El número desde el que se quiere mandar no tiene una conexión activa — nunca se manda con un token "por defecto" de otro número. */
export class ConexionWhatsAppNoEncontradaError extends Error {
  constructor(phoneNumberId: string) {
    super(
      `No hay una conexión de WhatsApp activa para el número ${phoneNumberId} (whatsapp_conexiones) — conéctalo desde el dashboard o regístralo a mano antes de enviar`
    )
    this.name = 'ConexionWhatsAppNoEncontradaError'
  }
}

/**
 * Clave AES-256 de WHATSAPP_TOKEN_ENCRYPTION_KEY. env.ts ya exige que exista
 * en producción y que sea válida si está presente — acá solo cubre dev/test
 * sin la variable: falla visible al primer uso, nunca devuelve una clave
 * inventada.
 */
export function claveCifradoTokens(): Buffer {
  const valor = env.WHATSAPP_TOKEN_ENCRYPTION_KEY
  const clave = valor ? parsearClaveCifrado(valor) : null
  if (!clave) {
    throw new Error('Falta WHATSAPP_TOKEN_ENCRYPTION_KEY — no se pueden cifrar/descifrar los tokens de WhatsApp')
  }
  return clave
}

export function cifrarTokenWhatsApp(tokenEnClaro: string): string {
  return cifrarToken(tokenEnClaro, claveCifradoTokens())
}

/**
 * El token de negocio con el que se manda desde ese número — sale de la base
 * (whatsapp_conexiones), una conexión por número, descifrado en el momento.
 * Reemplaza al antiguo META_WHATSAPP_TOKEN (un token único por variable de
 * entorno, pensado para una app de Bake Brothers que ya no existe: la app es
 * de DevHorses y el token sale del Embedded Signup). Una consulta por envío:
 * el volumen es de mensajes de un cliente humano por vez, un caché solo
 * agregaría el riesgo de usar un token rotado/revocado.
 */
export async function obtenerTokenWhatsApp(phoneNumberId: string): Promise<string> {
  const conexion = await conexionActivaPorPhoneNumberId(pool, phoneNumberId)
  if (!conexion) throw new ConexionWhatsAppNoEncontradaError(phoneNumberId)
  return descifrarToken(conexion.tokenCifrado, claveCifradoTokens())
}

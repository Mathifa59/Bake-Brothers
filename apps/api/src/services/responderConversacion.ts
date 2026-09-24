import type pg from 'pg'
import { puedeTransicionarConversacion, type EstadoConversacion } from '@bakebrothers/domain'
import type { OperadorAutenticado } from '../auth/verificarJwtOperador.js'
import { conversacionPorId, phoneNumberIdPorSede, agregarMensajeOperador } from '../repositories/conversacionesRepo.js'
import { enviarMensajeMeta } from '../bot/meta.js'

export type ResultadoResponderConversacion =
  | { ok: true }
  | { ok: false; error: string; detalle?: unknown }

/**
 * Bandeja de Conversaciones del dashboard: un operador responde de verdad
 * por WhatsApp. Reusa enviarMensajeMeta — la misma función real que ya usa
 * el bot (bot/procesarWebhookWhatsApp.ts), no una segunda implementación.
 *
 * Orden estricto a propósito: primero se manda el mensaje real, y SOLO si
 * el envío tiene éxito se actualiza historial/estado — un "listo" falso acá
 * dejaría al operador pensando que el cliente recibió algo que nunca le
 * llegó. Si el envío falla, se devuelve el motivo real (nunca en silencio,
 * mismo criterio que ya aplica procesarMensajeWhatsAppEnBackground del lado
 * del bot) para que el operador lo vea en pantalla y decida qué hacer.
 *
 * Nunca confía en sede_id que mande el cliente: la sede sale de la propia
 * fila de la conversación en la base, y el acceso de un operador (no admin)
 * se verifica contra su propia sede — mismo criterio que crearPedidoDashboard.
 */
export async function responderConversacion(
  client: pg.PoolClient,
  tenantId: string,
  operador: OperadorAutenticado,
  conversacionId: string,
  texto: string
): Promise<ResultadoResponderConversacion> {
  const conversacion = await conversacionPorId(client, tenantId, conversacionId)
  if (!conversacion) {
    return { ok: false, error: 'CONVERSACION_NO_ENCONTRADA' }
  }

  if (operador.rol !== 'admin' && conversacion.sedeId !== operador.sedeId) {
    return { ok: false, error: 'SIN_ACCESO_A_LA_CONVERSACION' }
  }

  if (!conversacion.sedeId) {
    return { ok: false, error: 'CONVERSACION_SIN_SEDE_ASIGNADA' }
  }

  const phoneNumberId = await phoneNumberIdPorSede(client, conversacion.sedeId)
  if (!phoneNumberId) {
    return { ok: false, error: 'SEDE_SIN_WHATSAPP_CONFIGURADO' }
  }

  try {
    await enviarMensajeMeta(conversacion.canal, phoneNumberId, conversacion.externalId, texto)
  } catch (err) {
    return { ok: false, error: 'ENVIO_FALLIDO', detalle: err instanceof Error ? err.message : String(err) }
  }

  const estadoActual = conversacion.estado as EstadoConversacion
  const nuevoEstado: EstadoConversacion =
    estadoActual === 'escalada' && puedeTransicionarConversacion('escalada', 'atendida_por_operador')
      ? 'atendida_por_operador'
      : estadoActual

  await agregarMensajeOperador(client, conversacionId, texto, nuevoEstado)

  return { ok: true }
}

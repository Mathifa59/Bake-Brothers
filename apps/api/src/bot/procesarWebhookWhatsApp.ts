import type { FastifyBaseLogger } from 'fastify'
import { pool, withTenantTx } from '../db.js'
import { sedePorPhoneNumberId, encontrarOCrearConversacion } from '../repositories/conversacionesRepo.js'
import { procesarMensajeEntrante } from './cerebro.js'
import type { MensajeWhatsAppEntrante } from './parsearMensajesWhatsApp.js'

/**
 * Procesa UN mensaje de WhatsApp ya marcado como nuevo (ver
 * marcarMensajeComoProcesado) — corre DESPUÉS de que routes/webhook.ts ya le
 * respondió 200 a Meta (fire-and-forget, sin bloquear esa respuesta). Meta
 * nunca se entera si esto falla (ya recibió su 200, no va a reintentar), así
 * que un fallo acá no puede quedar en silencio: se loggea siempre, y si ya
 * existía la conversación se fuerza `escalada` para que quede visible en el
 * dashboard — nunca dejar un mensaje real sin respuesta y sin que nadie se
 * entere.
 *
 * Dos transacciones separadas a propósito (no una sola): si la segunda
 * (evaluarTurno vía procesarMensajeEntrante) falla y hace rollback, la
 * conversación de la primera tiene que seguir existiendo para poder
 * escalarla — si todo fuera una sola transacción, el rollback también
 * borraría la conversación recién creada y no habría nada que escalar.
 */
export async function procesarMensajeWhatsAppEnBackground(
  logger: FastifyBaseLogger,
  tenantId: string,
  mensaje: MensajeWhatsAppEntrante
): Promise<void> {
  let conversacionId: string
  try {
    conversacionId = await withTenantTx(tenantId, async (client) => {
      const sedeId = await sedePorPhoneNumberId(client, mensaje.phoneNumberId)
      return encontrarOCrearConversacion(client, tenantId, 'whatsapp', mensaje.telefono, sedeId)
    })
  } catch (err) {
    logger.error(
      { err, mensajeId: mensaje.mensajeId },
      'Fallo resolviendo/creando la conversación para un mensaje de WhatsApp entrante'
    )
    return
  }

  try {
    await withTenantTx(tenantId, (client) => procesarMensajeEntrante(client, tenantId, conversacionId, mensaje.texto))
  } catch (err) {
    logger.error(
      { err, mensajeId: mensaje.mensajeId, conversacionId },
      'Fallo el cerebro procesando un mensaje de WhatsApp — forzando escalada como red de seguridad'
    )
    await pool
      .query(
        `update conversaciones set estado = 'escalada' where id = $1 and estado not in ('escalada', 'atendida_por_operador')`,
        [conversacionId]
      )
      .catch((errEscalada) => {
        logger.error({ err: errEscalada, conversacionId }, 'Además falló forzar la escalada de seguridad')
      })
  }
}

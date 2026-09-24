import type pg from 'pg'
import type { FastifyBaseLogger } from 'fastify'
import { pool, withTenantTx } from '../db.js'
import { sedePorPhoneNumberId, encontrarOCrearConversacion } from '../repositories/conversacionesRepo.js'
import { procesarMensajeEntrante } from './cerebro.js'
import { enviarMensajeMeta } from './meta.js'
import type { MensajeWhatsAppEntrante } from './parsearMensajesWhatsApp.js'

/**
 * Red de seguridad: fuerza `escalada` y deja un motivo real e inspeccionable
 * en `contexto` (no hay columna dedicada para esto en `conversaciones` —
 * `contexto` está documentada como estructura libre para justo este tipo de
 * bookkeeping interno, ver 0009). No pisa una conversación que ya está
 * `escalada`/`atendida_por_operador` — ya hay una persona ahí.
 */
async function forzarEscaladaDeSeguridad(pool: pg.Pool, conversacionId: string, motivo: string): Promise<void> {
  await pool.query(
    `update conversaciones
     set estado = 'escalada',
         contexto = contexto || jsonb_build_object('ultimoError', jsonb_build_object('motivo', $2::text, 'en', now()))
     where id = $1 and estado not in ('escalada', 'atendida_por_operador')`,
    [conversacionId, motivo]
  )
}

/**
 * Procesa UN mensaje de WhatsApp ya marcado como nuevo (ver
 * marcarMensajeComoProcesado) — corre DESPUÉS de que routes/webhook.ts ya le
 * respondió 200 a Meta (fire-and-forget, sin bloquear esa respuesta). Meta
 * nunca se entera si esto falla (ya recibió su 200, no va a reintentar), así
 * que ningún fallo acá puede quedar en silencio: se loggea siempre, y se
 * fuerza `escalada` (con el motivo real guardado en `contexto`) para que
 * quede visible en el dashboard — nunca dejar un mensaje real sin respuesta
 * y sin que nadie se entere. Esto cubre TANTO que el cerebro falle al
 * calcular la respuesta COMO que el envío real por WhatsApp falle después de
 * calcularla bien (ej. sin META_WHATSAPP_TOKEN todavía) — desde el punto de
 * vista del cliente, las dos son "nunca le llegó nada".
 *
 * Dos transacciones separadas a propósito (no una sola) para resolver la
 * conversación vs. para procesar el mensaje: si la segunda (evaluarTurno vía
 * procesarMensajeEntrante) falla y hace rollback, la conversación de la
 * primera tiene que seguir existiendo para poder escalarla — si todo fuera
 * una sola transacción, el rollback también borraría la conversación recién
 * creada y no habría nada que escalar.
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
    const resultado = await withTenantTx(tenantId, (client) =>
      procesarMensajeEntrante(client, tenantId, conversacionId, mensaje.texto)
    )
    // null = la conversación ya estaba escalada/atendida por un operador —
    // procesarMensajeEntrante no generó ninguna respuesta del bot que mandar.
    if (resultado) {
      await enviarMensajeMeta('whatsapp', mensaje.phoneNumberId, mensaje.telefono, resultado.textoRespuesta)
    }
  } catch (err) {
    logger.error(
      { err, mensajeId: mensaje.mensajeId, conversacionId },
      'Error interno procesando/enviando un mensaje de WhatsApp — forzando escalada como red de seguridad'
    )
    await forzarEscaladaDeSeguridad(
      pool,
      conversacionId,
      `Error interno al procesar: ${err instanceof Error ? err.message : String(err)}`
    ).catch((errEscalada) => {
      logger.error({ err: errEscalada, conversacionId }, 'Además falló forzar la escalada de seguridad')
    })
  }
}

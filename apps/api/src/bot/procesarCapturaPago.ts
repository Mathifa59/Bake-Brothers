import type pg from 'pg'
import type { FastifyBaseLogger } from 'fastify'
import { pool, withTenantTx } from '../db.js'
import { descargarMediaWhatsApp, enviarMensajeMeta } from './meta.js'
import { leerComprobanteDePago } from './capturaPago.js'
import { registrarPagoReportado } from '../services/pagoReportado.js'
import type { MensajeWhatsAppEntrante } from './parsearMensajesWhatsApp.js'

/**
 * Procesa UNA imagen que mandó el cliente (típicamente la captura de su pago). Corre en segundo plano, igual
 * que los mensajes de texto (ver procesarWebhookWhatsApp.ts): Meta ya recibió su 200.
 *
 * Es un camino APARTE del cerebro conversacional, a propósito:
 *  - La captura llega muchas veces cuando la conversación ya está en manos de una persona (todo delivery y todo
 *    pedido sin datos de pago configurados se escalan), y el cerebro no se llama en una conversación escalada.
 *    La lectura de la imagen igual tiene que correr para que la trabajadora vea el pago reportado.
 *  - El bot solo LEE: deja el pedido como "pago reportado" y NUNCA lo marca pagado (ver 0036).
 *
 * Respuesta al cliente: solo si la conversación sigue activa (la maneja el bot). Si ya la tiene una persona, el
 * bot no habla — el pago reportado y una nota en el historial son lo que ve el equipo.
 */

const RESPUESTA_CAPTURA_RECIBIDA =
  '¡Gracias! Recibimos tu captura 🙌 El equipo confirma tu pago y te avisamos por aquí en cuanto esté listo.'
const RESPUESTA_IMAGEN_A_UNA_PERSONA =
  'Gracias por la imagen 🙌 La va a revisar una persona del equipo y te escribe en un momento.'

type EstadoConv = 'activa' | 'escalada' | 'atendida_por_operador' | 'cerrada'

async function anotarEnHistorial(
  client: pg.PoolClient,
  conversacionId: string,
  entradas: { rol: 'cliente' | 'bot'; texto: string }[],
  escalarPorMotivo?: string
): Promise<EstadoConv> {
  const ahora = new Date().toISOString()
  const json = JSON.stringify(entradas.map((e) => ({ ...e, en: ahora })))
  const { rows } = await client.query(
    `update conversaciones
        set historial = historial || $2::jsonb,
            ultimo_mensaje_en = now(),
            estado = case when $3::text is not null and estado = 'activa' then 'escalada' else estado end,
            contexto = case when $3::text is not null and estado = 'activa'
                            then contexto || jsonb_build_object('ultimaEscalacion', jsonb_build_object('motivo', $3::text, 'en', now()))
                            else contexto end
      where id = $1
      returning estado`,
    [conversacionId, json, escalarPorMotivo ?? null]
  )
  return (rows[0]?.estado ?? 'activa') as EstadoConv
}

/** Estado actual de la conversación (para saber si el bot puede responder). */
async function estadoDe(client: pg.PoolClient, conversacionId: string): Promise<EstadoConv> {
  const { rows } = await client.query(`select estado from conversaciones where id = $1`, [conversacionId])
  return (rows[0]?.estado ?? 'activa') as EstadoConv
}

export async function procesarCapturaWhatsApp(
  logger: FastifyBaseLogger,
  tenantId: string,
  conversacionId: string,
  mensaje: MensajeWhatsAppEntrante
): Promise<void> {
  if (!mensaje.imagen) return
  const pieDeFoto = mensaje.texto.trim()
  const conPie = (t: string) => (pieDeFoto ? `${t} · Mensaje: "${pieDeFoto}"` : t)

  try {
    const media = await descargarMediaWhatsApp(mensaje.phoneNumberId, mensaje.imagen.mediaId)
    const extraccion = await leerComprobanteDePago(media)

    const { respuesta } = await withTenantTx(tenantId, async (client) => {
      // 1) No es un comprobante (una foto de referencia de una torta, un meme…): lo ve una persona.
      if (!extraccion.esComprobante) {
        const antes = await estadoDe(client, conversacionId)
        const entradas: { rol: 'cliente' | 'bot'; texto: string }[] = [
          { rol: 'cliente', texto: conPie('[Imagen recibida — no parece un comprobante de pago]') },
        ]
        if (antes === 'activa') entradas.push({ rol: 'bot', texto: RESPUESTA_IMAGEN_A_UNA_PERSONA })
        await anotarEnHistorial(client, conversacionId, entradas, 'El cliente mandó una imagen que no es un comprobante de pago (¿referencia de diseño?).')
        return { respuesta: antes === 'activa' ? RESPUESTA_IMAGEN_A_UNA_PERSONA : null }
      }

      // 2) Es un comprobante: se deja como pago reportado en su pedido pendiente.
      const antes = await estadoDe(client, conversacionId)
      const resultado = await registrarPagoReportado(client, { conversacionId, extraccion, mediaId: mensaje.imagen!.mediaId })
      const datos = [
        extraccion.monto !== null ? `S/ ${extraccion.monto.toFixed(2)}` : 'monto no leído',
        extraccion.fecha ?? 'fecha no leída',
        extraccion.numeroOperacion ? `Op. ${extraccion.numeroOperacion}` : 'sin n.° de operación',
      ].join(' · ')

      if (!resultado.ok) {
        // Un comprobante, pero no hay un pedido pendiente de pago en esta conversación: lo ve una persona.
        const entradas: { rol: 'cliente' | 'bot'; texto: string }[] = [
          { rol: 'cliente', texto: conPie(`[Captura de pago: ${datos}] — no hay un pedido pendiente de pago en esta conversación`) },
        ]
        if (antes === 'activa') entradas.push({ rol: 'bot', texto: RESPUESTA_CAPTURA_RECIBIDA })
        await anotarEnHistorial(client, conversacionId, entradas, 'Llegó una captura de pago pero no hay un pedido pendiente de pago en la conversación.')
        return { respuesta: antes === 'activa' ? RESPUESTA_CAPTURA_RECIBIDA : null }
      }

      const revision = resultado.evaluacion.requiereRevision ? ` · REVISAR: ${resultado.evaluacion.motivos.join(' ')}` : ''
      const entradas: { rol: 'cliente' | 'bot'; texto: string }[] = [
        { rol: 'cliente', texto: conPie(`[Captura de pago: ${datos}] — pedido ${resultado.numeroPedido}${revision}`) },
      ]
      if (antes === 'activa') entradas.push({ rol: 'bot', texto: RESPUESTA_CAPTURA_RECIBIDA })
      await anotarEnHistorial(client, conversacionId, entradas)
      return { respuesta: antes === 'activa' ? RESPUESTA_CAPTURA_RECIBIDA : null }
    })

    if (respuesta) await enviarMensajeMeta('whatsapp', mensaje.phoneNumberId, mensaje.telefono, respuesta)
  } catch (err) {
    // Ningún fallo puede quedar en silencio (Meta ya recibió su 200 y no va a reintentar): se loggea y la
    // conversación pasa a una persona con el motivo real, para que el cliente no se quede sin respuesta.
    logger.error({ err, mensajeId: mensaje.mensajeId, conversacionId }, 'Error procesando una imagen de WhatsApp — escalando como red de seguridad')
    await pool
      .query(
        `update conversaciones
            set historial = historial || $2::jsonb,
                ultimo_mensaje_en = now(),
                estado = case when estado = 'activa' then 'escalada' else estado end,
                contexto = contexto || jsonb_build_object('ultimoError', jsonb_build_object('motivo', $3::text, 'en', now()))
          where id = $1`,
        [
          conversacionId,
          JSON.stringify([{ rol: 'cliente', texto: '[Imagen recibida — no se pudo leer automáticamente]', en: new Date().toISOString() }]),
          `No se pudo leer la imagen: ${err instanceof Error ? err.message : String(err)}`,
        ]
      )
      .catch((errEscalada) => logger.error({ err: errEscalada, conversacionId }, 'Además falló escalar la conversación de la imagen'))
  }
}

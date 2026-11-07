import type pg from 'pg'
import type { FastifyBaseLogger } from 'fastify'
import { pool, withTenantTx } from '../db.js'
import { enviarMensajeMeta } from './meta.js'
import type { ConfiguracionBot } from '../repositories/configuracionBotRepo.js'
import type { MensajeWhatsAppEntrante } from './parsearMensajesWhatsApp.js'
import { extraerReferencia } from '@bakebrothers/domain'

/**
 * Atención SOLO por personas (el bot apagado desde el panel, ver configuracion_bot / 0040).
 *
 * Con el bot apagado, un mensaje entrante NO pasa por Claude ni por ninguna herramienta del bot: se anota en el
 * historial de la conversación y la conversación queda «esperando persona» (`escalada`) para que aparezca en
 * Conversaciones. No es un error ni se registra como tal: es el modo normal de operar sin bot, así que no deja
 * `ultimoError` ni escribe `error` en el log.
 *
 * Opcional: un mensaje de bienvenida FIJO (sin IA, editable por el admin). Se manda una vez por «sesión»: solo si
 * la conversación estaba sin atender (activa/cerrada, no ya en espera ni con una persona) y no se mandó ya uno en
 * las últimas BIENVENIDA_VENTANA_HORAS horas ni escribió una persona del equipo en ese lapso.
 */

export const BIENVENIDA_VENTANA_HORAS = 12
export const MOTIVO_BOT_APAGADO = 'El bot está apagado: la atiende una persona.'

export interface ResultadoSinBot {
  estadoPrevio: 'activa' | 'escalada' | 'atendida_por_operador' | 'cerrada'
  /** true si la conversación pasó a «esperando persona» con ESTE mensaje (antes no lo estaba). */
  pasoAEsperando: boolean
  /** Texto de bienvenida a mandar (ya decidido), o null. */
  bienvenida: string | null
  sedeId: string | null
}

type EntradaHistorial = { rol?: string; en?: string | null; automatico?: boolean }

/** ¿Ya se saludó (o ya habló una persona) en la ventana reciente? Entonces no se vuelve a saludar. */
export function yaSeSaludoOHablaronRecientemente(historial: EntradaHistorial[], ahora: Date): boolean {
  const desde = ahora.getTime() - BIENVENIDA_VENTANA_HORAS * 3_600_000
  return historial.some((e) => {
    if (!e.en) return false
    const cuando = new Date(e.en).getTime()
    if (!Number.isFinite(cuando) || cuando < desde) return false
    return e.automatico === true || e.rol === 'operador'
  })
}

/**
 * Anota el mensaje del cliente y deja la conversación esperando a una persona. Corre dentro de la transacción del
 * caller (withTenantTx). Devuelve null si la conversación no existe.
 */
export async function registrarMensajeSinBot(
  client: pg.PoolClient,
  tenantId: string,
  conversacionId: string,
  texto: string,
  config: Pick<ConfiguracionBot, 'bienvenidaActiva' | 'mensajeBienvenida'>,
  ahora: Date = new Date()
): Promise<ResultadoSinBot | null> {
  const { rows } = await client.query(
    `select estado, historial, sede_id from conversaciones where id = $1 and tenant_id = $2 for update`,
    [conversacionId, tenantId]
  )
  const fila = rows[0]
  if (!fila) return null

  const estadoPrevio = fila.estado as ResultadoSinBot['estadoPrevio']
  const sinAtender = estadoPrevio === 'activa' || estadoPrevio === 'cerrada'
  const entrada = { rol: 'cliente', texto, en: ahora.toISOString() }

  // Una conversación cerrada que vuelve a escribir se reabre primero (cerrada → activa) y luego pasa a esperar
  // (activa → escalada): son las transiciones que permite la máquina de estados (y el trigger de la base).
  if (estadoPrevio === 'cerrada') {
    await client.query(`update conversaciones set estado = 'activa' where id = $1`, [conversacionId])
  }
  await client.query(
    `update conversaciones
        set historial = historial || $1::jsonb,
            ultimo_mensaje_en = now(),
            estado = case when $3::boolean then 'escalada' else estado end,
            contexto = case when $3::boolean
                            then contexto || jsonb_build_object('ultimaEscalacion', jsonb_build_object('motivo', $4::text, 'en', now()))
                            else contexto end
      where id = $2`,
    [JSON.stringify([entrada]), conversacionId, sinAtender, MOTIVO_BOT_APAGADO]
  )

  const saludar =
    config.bienvenidaActiva && sinAtender && !yaSeSaludoOHablaronRecientemente((fila.historial ?? []) as EntradaHistorial[], ahora)

  return {
    estadoPrevio,
    pasoAEsperando: sinAtender,
    bienvenida: saludar ? config.mensajeBienvenida : null,
    sedeId: fila.sede_id ?? null,
  }
}

/**
 * Procesa UN mensaje de WhatsApp con el bot apagado (texto o imagen). Nunca llama a Claude (ni descarga la imagen:
 * una persona la ve en la conversación de WhatsApp). Devuelve lo que pasó para que el caller avise al equipo.
 */
export async function atenderMensajeSinBot(
  logger: FastifyBaseLogger,
  tenantId: string,
  conversacionId: string,
  mensaje: MensajeWhatsAppEntrante,
  config: ConfiguracionBot
): Promise<ResultadoSinBot | null> {
  // La referencia de campaña «(ref: …)» que agrega la landing se guarda aparte y no se muestra al equipo.
  const { texto: sinReferencia, referencia } = extraerReferencia(mensaje.texto)
  if (referencia) {
    await pool
      .query(`update conversaciones set contexto = contexto || jsonb_build_object('campana', $2::text) where id = $1`, [
        conversacionId,
        referencia,
      ])
      .catch((err) => logger.warn({ err, conversacionId }, 'No se pudo guardar la referencia de campaña de la conversación'))
  }

  const textoVisible = mensaje.imagen
    ? `[Imagen recibida]${sinReferencia.trim() ? ` · ${sinReferencia.trim()}` : ''}`
    : sinReferencia

  const resultado = await withTenantTx(tenantId, (client) =>
    registrarMensajeSinBot(client, tenantId, conversacionId, textoVisible, config)
  )
  if (!resultado) return null

  if (resultado.bienvenida) {
    try {
      await enviarMensajeMeta('whatsapp', mensaje.phoneNumberId, mensaje.telefono, resultado.bienvenida)
      // Se anota en el historial solo si salió de verdad (así el equipo ve qué recibió el cliente).
      await pool.query(
        `update conversaciones set historial = historial || $2::jsonb where id = $1`,
        [conversacionId, JSON.stringify([{ rol: 'bot', texto: resultado.bienvenida, en: new Date().toISOString(), automatico: true }])]
      )
    } catch (err) {
      // El cliente ya quedó en la cola de la gente: que no salga el saludo no es un error del flujo.
      logger.warn({ err, conversacionId }, 'No se pudo enviar el mensaje de bienvenida (la conversación igual queda esperando persona)')
    }
  }
  return resultado
}

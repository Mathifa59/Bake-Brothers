import type pg from 'pg'
import type { FastifyBaseLogger } from 'fastify'
import * as webpush from 'web-push'
import { pool } from '../db.js'

/**
 * Avisos al equipo (centro de avisos de la campana + notificaciones push al celular) cuando entra algo que una
 * persona tiene que atender: una conversación que pasa a «esperando persona» o un mensaje nuevo en una que ya lo
 * está / la tiene alguien. Con el bot apagado es cada mensaje del número.
 *
 * Dos partes independientes: el aviso SIEMPRE se guarda (la campana funciona aunque no haya push configurado) y el
 * push es un extra que nunca puede romper el flujo del mensaje: `avisarAlEquipo` no lanza jamás.
 *
 * Web Push con claves VAPID (variables VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, y opcional VAPID_SUBJECT). Se leen al
 * usarlas (no al arrancar) para poder activarlas con un redeploy sin tocar nada más; sin ellas no se manda ningún
 * push y `GET /api/dashboard/push/clave` responde 503.
 */

export type TipoAviso = 'mensaje_nuevo' | 'esperando_persona'

export interface NuevoAviso {
  tipo: TipoAviso
  titulo: string
  cuerpo: string
  conversacionId: string | null
  /** Local de la conversación; null = sin local todavía (lo ve todo el personal). */
  sedeId: string | null
}

export interface ConfigVapid {
  publica: string
  privada: string
  asunto: string
}

export function leerConfigVapid(): ConfigVapid | null {
  const publica = process.env.VAPID_PUBLIC_KEY?.trim()
  const privada = process.env.VAPID_PRIVATE_KEY?.trim()
  if (!publica || !privada) return null
  return { publica, privada, asunto: process.env.VAPID_SUBJECT?.trim() || 'https://dashboard.bake-brothers.com' }
}

export const LARGO_MAXIMO_CUERPO = 140

export function recortar(texto: string, max = LARGO_MAXIMO_CUERPO): string {
  const limpio = texto.replace(/\s+/g, ' ').trim()
  return limpio.length > max ? `${limpio.slice(0, max - 1).trimEnd()}…` : limpio
}

/** Inserta el aviso (lo ve la campana de todo el que corresponda, por RLS). */
export async function registrarAviso(db: pg.Pool | pg.PoolClient, aviso: NuevoAviso): Promise<{ id: string }> {
  const { rows } = await db.query(
    `insert into avisos (tipo, titulo, cuerpo, conversacion_id, sede_id) values ($1, $2, $3, $4, $5) returning id`,
    [aviso.tipo, aviso.titulo, recortar(aviso.cuerpo), aviso.conversacionId, aviso.sedeId]
  )
  return { id: rows[0].id as string }
}

export interface SuscripcionPush {
  id: string
  usuarioId: string
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * Los dispositivos que deben enterarse: dirección siempre, y un empleado solo si el aviso es de su local o no tiene
 * local (misma regla que la RLS de `avisos`).
 */
export async function destinatariosPush(db: pg.Pool | pg.PoolClient, sedeId: string | null): Promise<SuscripcionPush[]> {
  const { rows } = await db.query(
    `select s.id, s.usuario_id, s.endpoint, s.p256dh, s.auth
       from push_suscripciones s
       join usuarios_dashboard u on u.id = s.usuario_id
      where u.rol = 'admin' or $1::uuid is null or u.sede_id = $1::uuid`,
    [sedeId]
  )
  return rows.map((r) => ({ id: r.id, usuarioId: r.usuario_id, endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth }))
}

export interface PayloadPush {
  titulo: string
  cuerpo: string
  /** Pantalla que abre al tocar la notificación (HashRouter del panel). */
  url: string
  /** Una notificación por conversación: la nueva reemplaza a la anterior en vez de apilarse. */
  tag: string
  tipo: TipoAviso | 'prueba'
}

export function payloadDeAviso(aviso: NuevoAviso): PayloadPush {
  return {
    titulo: aviso.titulo,
    cuerpo: recortar(aviso.cuerpo),
    url: aviso.conversacionId ? `/#/conversaciones?c=${aviso.conversacionId}` : '/#/conversaciones',
    tag: aviso.conversacionId ? `conv-${aviso.conversacionId}` : 'conversaciones',
    tipo: aviso.tipo,
  }
}

export interface ResultadoEnvioPush {
  enviados: number
  /** Suscripciones que el servicio de push dio por muertas (404/410) y se borraron. */
  eliminadas: number
  fallidos: number
}

/** Manda un push a cada suscripción. Nunca lanza: lo que falla se cuenta y se loggea. */
export async function enviarPush(
  db: pg.Pool | pg.PoolClient,
  logger: Pick<FastifyBaseLogger, 'warn' | 'info'>,
  suscripciones: SuscripcionPush[],
  payload: PayloadPush
): Promise<ResultadoEnvioPush> {
  const vapid = leerConfigVapid()
  const resultado: ResultadoEnvioPush = { enviados: 0, eliminadas: 0, fallidos: 0 }
  if (!vapid || suscripciones.length === 0) return resultado

  const cuerpo = JSON.stringify(payload)
  await Promise.all(
    suscripciones.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, cuerpo, {
          vapidDetails: { subject: vapid.asunto, publicKey: vapid.publica, privateKey: vapid.privada },
          // Un mensaje de cliente no puede esperar: urgente y con vigencia corta (si el celular estuvo apagado una
          // hora, el aviso ya no sirve y la campana lo tiene).
          urgency: 'high',
          TTL: 3600,
        })
        resultado.enviados += 1
        await db.query(`update push_suscripciones set ultimo_exito_en = now() where id = $1`, [s.id]).catch(() => {})
      } catch (err) {
        const codigo = (err as { statusCode?: number }).statusCode
        if (codigo === 404 || codigo === 410) {
          // El dispositivo ya no existe (app desinstalada, permiso revocado): se limpia para no insistir.
          resultado.eliminadas += 1
          await db.query(`delete from push_suscripciones where id = $1`, [s.id]).catch(() => {})
        } else {
          resultado.fallidos += 1
          logger.warn({ err, suscripcion: s.id, codigo }, 'No se pudo enviar una notificación push')
        }
      }
    })
  )
  return resultado
}

/**
 * Guarda el aviso y manda el push al equipo que corresponde. NO LANZA: es un extra del flujo del mensaje y nunca
 * debe impedir que el mensaje quede registrado.
 */
export async function avisarAlEquipo(
  logger: Pick<FastifyBaseLogger, 'warn' | 'info' | 'error'>,
  aviso: NuevoAviso,
  db: pg.Pool | pg.PoolClient = pool
): Promise<void> {
  try {
    await registrarAviso(db, aviso)
  } catch (err) {
    logger.error({ err, tipo: aviso.tipo }, 'No se pudo guardar un aviso para el equipo')
    return
  }
  try {
    const destinatarios = await destinatariosPush(db, aviso.sedeId)
    await enviarPush(db, logger, destinatarios, payloadDeAviso(aviso))
  } catch (err) {
    logger.warn({ err, tipo: aviso.tipo }, 'No se pudo mandar el push de un aviso (el aviso sí quedó guardado)')
  }
}

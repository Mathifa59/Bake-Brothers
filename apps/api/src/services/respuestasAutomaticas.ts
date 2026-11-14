import type { FastifyBaseLogger } from 'fastify'
import {
  HORAS_ENTRE_DMS_MISMA_CAMPANA,
  elegirRespuestaPublica,
  reglaParaComentario,
  textoDelDm,
} from '@bakebrothers/domain'
import { pool } from '../db.js'
import { env } from '../env.js'
import { descifrarTokenWhatsApp } from '../bot/tokensWhatsApp.js'
import {
  enviarRespuestaPrivada,
  responderComentarioEnPublico,
  type ComentarioInstagram,
  type ConexionInstagramParaEnviar,
} from '../bot/instagram.js'
import {
  cerrarEnvio,
  conexionInstagramActiva,
  marcarErrorConexionInstagram,
  reglasActivasInstagram,
  tomarComentario,
  yaRecibioDm,
} from '../repositories/respuestasAutomaticasRepo.js'

/** Link corto de una campaña: la API cuenta el clic y redirige a WhatsApp (routes/enlacesCampana.ts). */
export function enlaceCortoCampana(referencia: string): string {
  return `${env.URL_PUBLICA_API.replace(/\/+$/, '')}/w/${encodeURIComponent(referencia)}`
}

export type ResultadoComentario =
  | { estado: 'sin_conexion' | 'sin_regla' | 'repetido' }
  | { estado: 'enviado' | 'parcial' | 'error' | 'omitido'; envioId: string }

const mensajeDeError = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 400)

/**
 * Un comentario de Instagram: si trae la palabra clave de una regla activa, lo responde en público (si la regla tiene
 * respuestas) y le manda el DM con el link corto. Cada comentario se atiende una sola vez (tomarComentario), y la
 * misma persona no recibe el DM de la misma campaña más de una vez cada 24 h (sí la respuesta pública).
 * Nunca lanza por un fallo de Meta: queda registrado en el comentario y en la conexión, visible en el panel.
 */
export async function procesarComentarioInstagram(log: FastifyBaseLogger, c: ComentarioInstagram): Promise<ResultadoComentario> {
  const conexionGuardada = await conexionInstagramActiva(pool, c.igUserId)
  if (!conexionGuardada) {
    log.warn({ igUserId: c.igUserId }, 'Comentario de Instagram de una cuenta sin conexión activa — ignorado')
    return { estado: 'sin_conexion' }
  }
  const regla = reglaParaComentario(c.texto, await reglasActivasInstagram(pool))
  if (!regla) return { estado: 'sin_regla' }

  const envioId = await tomarComentario(pool, {
    reglaId: regla.id,
    comentarioId: c.comentarioId,
    mediaId: c.mediaId,
    autorId: c.autorId,
    autorUsuario: c.autorUsuario,
    texto: c.texto,
  })
  if (!envioId) return { estado: 'repetido' }

  let conexion: ConexionInstagramParaEnviar
  try {
    conexion = {
      igUserId: conexionGuardada.igUserId,
      tipo: conexionGuardada.tipo,
      pageId: conexionGuardada.pageId,
      token: descifrarTokenWhatsApp(conexionGuardada.tokenCifrado),
    }
  } catch (e) {
    const motivo = `No se pudo leer el token de Instagram: ${mensajeDeError(e)}`
    await cerrarEnvio(pool, envioId, { respuestaPublica: null, respuestaPublicaOk: null, dmOk: false, estado: 'error', motivo })
    await marcarErrorConexionInstagram(pool, conexionGuardada.id, motivo)
    log.error({ comentarioId: c.comentarioId }, motivo)
    return { estado: 'error', envioId }
  }

  const errores: string[] = []

  const respuestaPublica = elegirRespuestaPublica(regla.respuestasPublicas, c.comentarioId)
  let publicaOk: boolean | null = null
  if (respuestaPublica) {
    try {
      await responderComentarioEnPublico(conexion, c.comentarioId, respuestaPublica)
      publicaOk = true
    } catch (e) {
      publicaOk = false
      errores.push(`Respuesta pública: ${mensajeDeError(e)}`)
    }
  }

  let dmOk: boolean | null = null
  let omitido = false
  if (c.autorId && (await yaRecibioDm(pool, regla.id, c.autorId, HORAS_ENTRE_DMS_MISMA_CAMPANA, envioId))) {
    omitido = true
  } else {
    try {
      await enviarRespuestaPrivada(conexion, c.comentarioId, textoDelDm(regla.mensajeDm, enlaceCortoCampana(regla.referencia)))
      dmOk = true
    } catch (e) {
      dmOk = false
      errores.push(`DM: ${mensajeDeError(e)}`)
    }
  }

  const estado =
    errores.length === 0
      ? omitido
        ? 'omitido'
        : 'enviado'
      : dmOk || publicaOk
        ? 'parcial'
        : 'error'
  const motivo = omitido
    ? `Ya recibió el DM de esta campaña en las últimas ${HORAS_ENTRE_DMS_MISMA_CAMPANA} h`
    : errores.join(' | ') || null
  await cerrarEnvio(pool, envioId, { respuestaPublica, respuestaPublicaOk: publicaOk, dmOk, estado, motivo })
  // El último error de Meta queda en la conexión (el panel lo muestra); un envío limpio lo borra.
  await marcarErrorConexionInstagram(pool, conexionGuardada.id, errores.length ? errores.join(' | ').slice(0, 400) : null)
  if (errores.length) log.warn({ comentarioId: c.comentarioId, regla: regla.referencia, errores }, 'Respuesta automática de Instagram con errores')
  else log.info({ comentarioId: c.comentarioId, regla: regla.referencia, estado }, 'Respuesta automática de Instagram')
  return { estado, envioId }
}

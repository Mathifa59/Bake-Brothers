import type { FastifyBaseLogger } from 'fastify'
import { pool, tenantPorSlug } from '../db.js'
import { actualizarEstadosPendientes } from '../services/comprobantes.js'

/**
 * Cada cierto tiempo pregunta a Mifact cómo quedaron las boletas que estaban «En proceso» de días anteriores (ver
 * `actualizarEstadosPendientes`). Corre DENTRO de la propia API (es un proceso persistente en Coolify, no hay
 * cron aparte). Se apaga con `MIFACT_ACTUALIZACION_AUTOMATICA=false`. Sin Mifact configurado no hace nada: no hay
 * comprobantes que consultar.
 */

export const INTERVALO_MS = 30 * 60 * 1000
const PRIMERA_VUELTA_MS = 2 * 60 * 1000

/** Encendida salvo que la variable diga explícitamente que no. */
export function actualizacionAutomaticaActiva(env: Record<string, string | undefined>): boolean {
  const v = (env.MIFACT_ACTUALIZACION_AUTOMATICA ?? '').trim().toLowerCase()
  return !['false', '0', 'no', 'off', 'apagada'].includes(v)
}

let corriendo = false

/** Una vuelta. Nunca lanza y nunca se pisa a sí misma (si la anterior sigue, esta se salta). */
export async function vueltaDeActualizacion(slugTenant: string, log: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>): Promise<void> {
  if (corriendo) return
  corriendo = true
  try {
    const tenant = await tenantPorSlug(slugTenant)
    if (!tenant) {
      log.error({ slug: slugTenant }, 'Actualización de comprobantes: no se pudo resolver el tenant')
      return
    }
    const r = await actualizarEstadosPendientes(pool, tenant.id, {
      alFallar: (id, err) => log.warn({ comprobanteId: id, err: err instanceof Error ? err.message : String(err) }, 'Actualización de comprobantes: no se pudo consultar uno'),
    })
    if (r.consultados > 0) log.info(r, 'Actualización de comprobantes')
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'Actualización de comprobantes: falló la vuelta')
  } finally {
    corriendo = false
  }
}

/** Arranca el temporizador; devuelve la función para detenerlo. No mantiene vivo el proceso. */
export function iniciarActualizacionAutomatica(slugTenant: string, log: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>): () => void {
  const primera = setTimeout(() => void vueltaDeActualizacion(slugTenant, log), PRIMERA_VUELTA_MS)
  const cada = setInterval(() => void vueltaDeActualizacion(slugTenant, log), INTERVALO_MS)
  primera.unref()
  cada.unref()
  return () => {
    clearTimeout(primera)
    clearInterval(cada)
  }
}

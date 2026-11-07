import type { FastifyBaseLogger } from 'fastify'
import { pool } from '../db.js'
import { telefonoLegible } from '@bakebrothers/domain'
import { avisarAlEquipo, recortar, type TipoAviso } from '../services/avisos.js'

/**
 * Avisa al equipo de un mensaje entrante que una PERSONA tiene que atender:
 *   - `esperando_persona`: la conversación pasó a «esperando persona» con este mensaje (bot apagado, o el bot la
 *     derivó). Es el primer aviso de esa espera.
 *   - `mensaje_nuevo`: la conversación ya estaba esperando o la tiene alguien, y el cliente escribió otra vez.
 * Nunca lanza (ver avisarAlEquipo). El nombre sale del cliente registrado con ese teléfono; si no hay, el teléfono.
 */
export async function avisarMensajeEntrante(
  logger: FastifyBaseLogger,
  tenantId: string,
  conversacionId: string,
  datos: { tipo: TipoAviso; texto: string; telefono: string; motivo?: string | null }
): Promise<void> {
  let sedeId: string | null = null
  let nombre = telefonoLegible(datos.telefono)
  try {
    const { rows } = await pool.query(`select sede_id from conversaciones where id = $1 and tenant_id = $2`, [conversacionId, tenantId])
    sedeId = rows[0]?.sede_id ?? null
    const digitos = datos.telefono.replace(/\D/g, '').slice(-9)
    if (digitos.length === 9) {
      const cliente = await pool.query(
        `select nombre from customers
          where tenant_id = $1 and nombre is not null and right(regexp_replace(telefono, '\\D', '', 'g'), 9) = $2
          order by creado_en desc limit 1`,
        [tenantId, digitos]
      )
      const real = cliente.rows[0]?.nombre as string | undefined
      if (real && !real.startsWith('[PRUEBA]')) nombre = real
    }
  } catch (err) {
    logger.warn({ err, conversacionId }, 'No se pudo completar el local/nombre para un aviso (se avisa igual)')
  }

  const texto = recortar(datos.texto) || 'Mensaje sin texto'
  await avisarAlEquipo(logger, {
    tipo: datos.tipo,
    titulo: datos.tipo === 'esperando_persona' ? `${nombre} espera que lo atiendan` : `Mensaje nuevo de ${nombre}`,
    cuerpo: datos.tipo === 'esperando_persona' && datos.motivo ? `${texto} · ${datos.motivo}` : texto,
    conversacionId,
    sedeId,
  })
}

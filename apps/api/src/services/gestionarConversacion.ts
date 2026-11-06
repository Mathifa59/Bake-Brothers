import type pg from 'pg'
import { puedeTransicionarConversacion, type EstadoConversacion } from '@bakebrothers/domain'
import type { OperadorAutenticado } from '../auth/verificarJwtOperador.js'
import {
  asignarSedeAConversacion,
  cambiarEstadoConversacion,
  conversacionPorId,
  nombreVisibleDelOperador,
} from '../repositories/conversacionesRepo.js'

export type AccionConversacion = 'tomar' | 'devolver' | 'cerrar'

export type ResultadoGestionConversacion =
  | { ok: true; estado: EstadoConversacion; sedeId: string | null }
  | { ok: false; error: string; detalle?: unknown }

const ESTADO_DESTINO: Record<AccionConversacion, EstadoConversacion> = {
  tomar: 'atendida_por_operador',
  devolver: 'activa',
  cerrar: 'cerrada',
}

/**
 * Tomar / devolver al bot / cerrar una conversación desde la bandeja.
 *
 * Mismas reglas de acceso que responder: la sede sale de la fila de la conversación (nunca de lo que mande el
 * navegador); un empleado solo atiende las de su local o las que todavía no tienen local; la dirección, todas.
 * Una conversación sin local pasa al local de quien la TOMA (o al que elija la dirección). La transición se valida
 * con la misma máquina de estados del dominio y, después, con el trigger de la base (0017).
 */
export async function gestionarConversacion(
  client: pg.PoolClient,
  tenantId: string,
  operador: OperadorAutenticado,
  conversacionId: string,
  accion: AccionConversacion,
  opciones: { sedeId?: string | null } = {}
): Promise<ResultadoGestionConversacion> {
  const conversacion = await conversacionPorId(client, tenantId, conversacionId)
  if (!conversacion) return { ok: false, error: 'CONVERSACION_NO_ENCONTRADA' }

  if (operador.rol !== 'admin' && conversacion.sedeId !== null && conversacion.sedeId !== operador.sedeId) {
    return { ok: false, error: 'SIN_ACCESO_A_LA_CONVERSACION' }
  }

  const destino = ESTADO_DESTINO[accion]
  const actual = conversacion.estado as EstadoConversacion
  if (!puedeTransicionarConversacion(actual, destino)) {
    return { ok: false, error: 'TRANSICION_NO_VALIDA', detalle: { desde: actual, hacia: destino } }
  }

  let sedeAAsignar: string | null = null
  if (accion === 'tomar' && conversacion.sedeId === null) {
    if (operador.rol === 'admin') {
      if (opciones.sedeId) {
        const { rows } = await client.query(`select id from sedes where id = $1 and activo`, [opciones.sedeId])
        if (!rows[0]) return { ok: false, error: 'SEDE_NO_VALIDA' }
        sedeAAsignar = opciones.sedeId
      }
    } else {
      sedeAAsignar = operador.sedeId
    }
  }

  const atendidaPor = accion === 'tomar' ? await nombreVisibleDelOperador(client, operador.id) : null
  await cambiarEstadoConversacion(client, conversacionId, destino, { sedeAAsignar, atendidaPor })
  return { ok: true, estado: destino, sedeId: conversacion.sedeId ?? sedeAAsignar }
}

/** Solo dirección: asigna (o quita) el local de una conversación sin tomarla. */
export async function asignarSedeDeConversacion(
  client: pg.PoolClient,
  tenantId: string,
  conversacionId: string,
  sedeId: string | null
): Promise<ResultadoGestionConversacion> {
  const conversacion = await conversacionPorId(client, tenantId, conversacionId)
  if (!conversacion) return { ok: false, error: 'CONVERSACION_NO_ENCONTRADA' }
  if (sedeId) {
    const { rows } = await client.query(`select id from sedes where id = $1 and activo`, [sedeId])
    if (!rows[0]) return { ok: false, error: 'SEDE_NO_VALIDA' }
  }
  await asignarSedeAConversacion(client, conversacionId, sedeId)
  return { ok: true, estado: conversacion.estado as EstadoConversacion, sedeId }
}

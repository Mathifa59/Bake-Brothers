import type pg from 'pg'
import { extraerReferencia, type EstadoConversacion } from '@bakebrothers/domain'
import { evaluarTurno, type ResultadoTurno, type TurnoHistorial } from '../bot/cerebro.js'

/**
 * Simulador del bot (pantalla "Simulador del bot" del dashboard, solo admin):
 * el admin escribe como si fuera un cliente y ve la respuesta del cerebro
 * REAL (bot/cerebro.ts, con Claude y las mismas tools/catálogo/precios del
 * bot de WhatsApp) turno a turno.
 *
 * Diferencias deliberadas con el flujo real de WhatsApp:
 *  - NO envía nada por WhatsApp (no llama a enviarMensajeMeta) y no toca la
 *    tabla `conversaciones`: la conversación vive en el navegador (el cliente
 *    manda el historial en cada turno), así una prueba nunca ensucia la
 *    bandeja real de Conversaciones ni el contador de alertas.
 *  - Los pedidos que cree el bot son REALES (misma validación, mismo precio,
 *    aparecen en Pedidos/Producción en vivo) pero van marcados como prueba
 *    (MARCA_PRUEBA en el nombre del cliente y en la nota) y quedan en la sede
 *    elegida para que también los vea el operador de esa sede.
 *  - Respeta lo mismo que `procesarMensajeEntrante`: una conversación ya
 *    escalada ("la tiene una persona") no vuelve a pasar por el bot.
 */

export interface EntradaSimulador {
  sedeId: string
  historial: TurnoHistorial[]
  estado: EstadoConversacion
  mensaje: string
  /** Referencia de campaña vigente de esta conversación simulada (la conversación vive en el navegador). */
  campana?: string | null
}

export type SalidaSimulador =
  | {
      ok: true
      /** null si el bot no respondió porque la conversación ya está escalada. */
      respuesta: string | null
      botSilenciado: boolean
      estado: EstadoConversacion
      herramientasUsadas: string[]
      motivoEscalacion?: string
      pedidosCreados: NonNullable<ResultadoTurno['pedidosCreados']>
      /** Historial completo actualizado (el cliente lo reenvía en el siguiente turno). */
      historial: TurnoHistorial[]
      /** Referencia de campaña vigente tras este turno (la última "(ref: …)" que escribió el cliente). */
      campana: string | null
    }
  | { ok: false; error: 'SEDE_NO_ENCONTRADA' }

export async function simularTurno(
  client: pg.PoolClient,
  tenantId: string,
  entrada: EntradaSimulador
): Promise<SalidaSimulador> {
  // `sedes` no tiene tenant_id (0004: un solo negocio, las sedes son suyas).
  const { rows } = await client.query(`select id from sedes where id = $1`, [entrada.sedeId])
  if (!rows[0]) return { ok: false, error: 'SEDE_NO_ENCONTRADA' }

  // Igual que el webhook real: la "(ref: …)" se saca del texto y queda como campaña de la conversación.
  const { texto: mensaje, referencia } = extraerReferencia(entrada.mensaje)
  const campana = referencia ?? entrada.campana ?? null
  const entradaCliente: TurnoHistorial = { rol: 'cliente', texto: mensaje, en: new Date().toISOString() }

  if (entrada.estado === 'escalada' || entrada.estado === 'atendida_por_operador') {
    return {
      ok: true,
      respuesta: null,
      botSilenciado: true,
      estado: entrada.estado,
      herramientasUsadas: [],
      pedidosCreados: [],
      historial: [...entrada.historial, entradaCliente],
      campana,
    }
  }

  const resultado = await evaluarTurno(
    client,
    tenantId,
    entrada.historial,
    mensaje,
    entrada.estado,
    'whatsapp',
    entrada.sedeId,
    { esPrueba: true, campana }
  )

  const entradaBot: TurnoHistorial = { rol: 'bot', texto: resultado.textoRespuesta, en: new Date().toISOString() }
  return {
    ok: true,
    respuesta: resultado.textoRespuesta,
    botSilenciado: false,
    estado: resultado.nuevoEstado,
    herramientasUsadas: resultado.herramientasUsadas,
    motivoEscalacion: resultado.motivoEscalacion,
    pedidosCreados: resultado.pedidosCreados ?? [],
    historial: [...entrada.historial, entradaCliente, entradaBot],
    campana,
  }
}

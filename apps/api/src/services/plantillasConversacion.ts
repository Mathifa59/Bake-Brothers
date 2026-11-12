import type pg from 'pg'
import {
  completarPlantilla,
  estadoVentana24h,
  puedeTransicionarConversacion,
  type EstadoConversacion,
  type PlantillaWhatsApp,
} from '@bakebrothers/domain'
import type { OperadorAutenticado } from '../auth/verificarJwtOperador.js'
import {
  agregarMensajeOperador,
  conversacionPorId,
  nombreVisibleDelOperador,
  phoneNumberIdPorSede,
  type ConversacionParaResponder,
} from '../repositories/conversacionesRepo.js'
import { enviarPlantillaMeta, listarPlantillasMeta } from '../bot/meta.js'

export type ResultadoPlantillas =
  | { ok: true; plantillas: PlantillaWhatsApp[]; noSoportadas: number; ventanaAbierta: boolean }
  | { ok: false; error: string; detalle?: unknown; faltan?: string[] }

export type ResultadoEnviarPlantilla = { ok: true; texto: string } | { ok: false; error: string; detalle?: unknown; faltan?: string[] }

type Preparado = { ok: true; conversacion: ConversacionParaResponder; phoneNumberId: string } | { ok: false; error: string }

/**
 * Mismas reglas de acceso que responder una conversación (services/responderConversacion.ts): la sede sale de la fila
 * de la conversación, un empleado solo atiende las de su local o las que aún no tienen local, y el número desde el que
 * se manda es el que usó el cliente (o, en conversaciones antiguas, el de la sede). Solo WhatsApp tiene plantillas.
 */
async function prepararEnvio(client: pg.PoolClient, tenantId: string, operador: OperadorAutenticado, conversacionId: string): Promise<Preparado> {
  const conversacion = await conversacionPorId(client, tenantId, conversacionId)
  if (!conversacion) return { ok: false, error: 'CONVERSACION_NO_ENCONTRADA' }
  if (operador.rol !== 'admin' && conversacion.sedeId !== null && conversacion.sedeId !== operador.sedeId) {
    return { ok: false, error: 'SIN_ACCESO_A_LA_CONVERSACION' }
  }
  if (conversacion.canal !== 'whatsapp') return { ok: false, error: 'PLANTILLAS_SOLO_WHATSAPP' }

  let phoneNumberId = conversacion.whatsappPhoneNumberId
  if (!phoneNumberId) {
    if (!conversacion.sedeId) return { ok: false, error: 'CONVERSACION_SIN_SEDE_ASIGNADA' }
    phoneNumberId = await phoneNumberIdPorSede(client, conversacion.sedeId)
    if (!phoneNumberId) return { ok: false, error: 'SEDE_SIN_WHATSAPP_CONFIGURADO' }
  }
  return { ok: true, conversacion, phoneNumberId }
}

/** Plantillas aprobadas que se pueden mandar a esta conversación (se leen de Meta en el momento: nunca una lista guardada). */
export async function plantillasDeConversacion(
  client: pg.PoolClient,
  tenantId: string,
  operador: OperadorAutenticado,
  conversacionId: string
): Promise<ResultadoPlantillas> {
  const prep = await prepararEnvio(client, tenantId, operador, conversacionId)
  if (!prep.ok) return prep
  let todas: PlantillaWhatsApp[]
  try {
    todas = await listarPlantillasMeta(prep.phoneNumberId)
  } catch (err) {
    return { ok: false, error: 'PLANTILLAS_NO_DISPONIBLES', detalle: err instanceof Error ? err.message : String(err) }
  }
  return {
    ok: true,
    plantillas: todas.filter((p) => p.soportada),
    noSoportadas: todas.filter((p) => !p.soportada).length,
    ventanaAbierta: estadoVentana24h(prep.conversacion.historial).abierta,
  }
}

/**
 * Envía una plantilla aprobada. Se vuelve a leer la lista de Meta y se valida contra ella (el navegador solo manda el
 * nombre, el idioma y los valores de las variables): no se puede mandar algo que Meta no tenga aprobado ni con
 * variables de menos. Solo si el envío tiene éxito se escribe en el historial (nunca un «enviado» falso), con el texto
 * ya armado tal como lo recibirá el cliente. Funciona con la ventana cerrada y también abierta.
 */
export async function enviarPlantillaConversacion(
  client: pg.PoolClient,
  tenantId: string,
  operador: OperadorAutenticado,
  conversacionId: string,
  entrada: { nombre: string; idioma: string; valores: Record<string, string> }
): Promise<ResultadoEnviarPlantilla> {
  const prep = await prepararEnvio(client, tenantId, operador, conversacionId)
  if (!prep.ok) return prep
  const { conversacion, phoneNumberId } = prep

  // Igual que el cuadro de texto del panel: solo se escribe en una conversación esperando persona o ya atendida.
  if (conversacion.estado !== 'escalada' && conversacion.estado !== 'atendida_por_operador') {
    return { ok: false, error: 'CONVERSACION_NO_TOMADA', detalle: { estado: conversacion.estado } }
  }

  let todas: PlantillaWhatsApp[]
  try {
    todas = await listarPlantillasMeta(phoneNumberId)
  } catch (err) {
    return { ok: false, error: 'PLANTILLAS_NO_DISPONIBLES', detalle: err instanceof Error ? err.message : String(err) }
  }
  const plantilla = todas.find((p) => p.nombre === entrada.nombre && p.idioma === entrada.idioma)
  if (!plantilla) return { ok: false, error: 'PLANTILLA_NO_APROBADA' }

  const armada = completarPlantilla(plantilla, entrada.valores)
  if (!armada.ok) return { ok: false, error: armada.error, faltan: armada.faltan }

  try {
    await enviarPlantillaMeta(phoneNumberId, conversacion.externalId, plantilla.nombre, plantilla.idioma, armada.componentes)
  } catch (err) {
    return { ok: false, error: 'ENVIO_FALLIDO', detalle: err instanceof Error ? err.message : String(err) }
  }

  const estadoActual = conversacion.estado as EstadoConversacion
  const nuevoEstado: EstadoConversacion =
    estadoActual === 'escalada' && puedeTransicionarConversacion('escalada', 'atendida_por_operador') ? 'atendida_por_operador' : estadoActual
  const autor = await nombreVisibleDelOperador(client, operador.id)
  await agregarMensajeOperador(client, conversacionId, armada.texto, nuevoEstado, {
    autor,
    sedeAAsignar: conversacion.sedeId ? null : operador.sedeId,
    atendidaPor: nuevoEstado === 'atendida_por_operador' ? autor : null,
    plantilla: plantilla.nombre,
  })
  return { ok: true, texto: armada.texto }
}

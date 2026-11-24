import { llamarApi } from './apiClient'

/** Porcionar enteras en un local (la API decide con la regla y el stock reales). Lanza un Error con .codigo/.detalle. */
export const porcionar = ({ reglaId, enteras, sedeId }) =>
  llamarApi('/api/dashboard/stock/porcionar', { method: 'POST', body: { reglaId, enteras, ...(sedeId ? { sedeId } : {}) } })

/** Historial de porcionados (solo Administración). */
export const listarPorcionados = ({ sedeId, limite = 30, desde = 0 } = {}) => {
  const q = new URLSearchParams({ limite: String(limite), desde: String(desde), ...(sedeId ? { sedeId } : {}) })
  return llamarApi(`/api/dashboard/porcionados?${q}`)
}

/** Deshace un porcionado (solo Administración). */
export const revertirPorcionado = (id, motivo) => llamarApi(`/api/dashboard/porcionados/${id}/revertir`, { method: 'POST', body: motivo ? { motivo } : {} })

/** Qué decirle a la persona cuando la API rechaza un porcionado. */
export function mensajeDeErrorPorcionado(err) {
  if (err?.codigo === 'SOLO_ENCARGADOS') return 'Solo Administración y las encargadas de turno pueden porcionar.'
  if (err?.codigo === 'SOLO_ADMIN') return 'Solo Administración puede hacer esto.'
  return err?.detalle || err?.message || 'No se pudo completar la acción.'
}

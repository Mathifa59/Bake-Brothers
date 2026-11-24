import { llamarApi } from './apiClient'

const q = (obj) => new URLSearchParams(Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''))).toString()

export const listarUnidades = () => llamarApi('/api/dashboard/unidades')
export const listarSalidas = (filtros = {}) => llamarApi(`/api/dashboard/unidades/salidas?${q(filtros)}`)
export const crearSalida = (datos) => llamarApi('/api/dashboard/unidades/salidas', { method: 'POST', body: datos })
export const editarSalida = (id, datos) => llamarApi(`/api/dashboard/unidades/salidas/${id}`, { method: 'PATCH', body: datos })
export const confirmarSalio = (id, datos) => llamarApi(`/api/dashboard/unidades/salidas/${id}/salio`, { method: 'POST', body: datos })
export const registrarDevolucion = (id, items) => llamarApi(`/api/dashboard/unidades/salidas/${id}/devolucion`, { method: 'POST', body: { items } })
export const anularSalida = (id) => llamarApi(`/api/dashboard/unidades/salidas/${id}/anular`, { method: 'POST', body: {} })

// Solo Administración
export const listarPrecios = (unidadId) => llamarApi(`/api/dashboard/unidades/precios?${q({ unidadId })}`)
export const guardarPrecios = (unidadId, cambios) => llamarApi('/api/dashboard/unidades/precios', { method: 'PUT', body: { unidadId, cambios } })
export const reporteUnidades = (filtros) => llamarApi(`/api/dashboard/unidades/reporte?${q(filtros)}`)
export const registrarPago = (datos) => llamarApi('/api/dashboard/unidades/pagos', { method: 'POST', body: datos })
export const anularPago = (id) => llamarApi(`/api/dashboard/unidades/pagos/${id}/anular`, { method: 'POST', body: {} })

export function mensajeDeErrorUnidades(err) {
  if (err?.codigo === 'SOLO_ADMIN') return 'Solo Administración puede hacer esto.'
  if (err?.codigo === 'SIN_PERFIL_PARA_ESTA_ACCION') return 'Tu perfil no puede registrar salidas.'
  return err?.detalle || err?.message || 'No se pudo completar la acción.'
}

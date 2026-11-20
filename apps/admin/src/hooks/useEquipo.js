import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { llamarApi } from '../lib/apiClient'

/** Cuentas del equipo (vía la API, que además trae correo y último ingreso de Supabase Auth). */
export function useEquipo() {
  const [estado, setEstado] = useState({ cuentas: [], authDisponible: true, cargando: true, error: null })

  const recargar = useCallback(async () => {
    try {
      const d = await llamarApi('/api/dashboard/equipo')
      setEstado({ cuentas: d.cuentas ?? [], authDisponible: d.authDisponible !== false, cargando: false, error: null })
    } catch (error) {
      setEstado((e) => ({ ...e, cargando: false, error }))
    }
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  return { ...estado, recargar }
}

/** Locales activos (para el selector de local). Lo lee directo de Supabase, como el resto del panel. */
export function useSedes() {
  const [sedes, setSedes] = useState([])
  useEffect(() => {
    let cancelado = false
    supabase
      .from('sedes')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => !cancelado && setSedes(data ?? []))
    return () => {
      cancelado = true
    }
  }, [])
  return sedes
}

export const crearCuenta = (datos) => llamarApi('/api/dashboard/equipo', { method: 'POST', body: datos })
export const editarCuenta = (id, cambios) => llamarApi(`/api/dashboard/equipo/${id}`, { method: 'PATCH', body: cambios })
export const cambiarContrasena = (id, password) => llamarApi(`/api/dashboard/equipo/${id}/password`, { method: 'POST', body: { password } })
export const desactivarCuenta = (id) => llamarApi(`/api/dashboard/equipo/${id}/desactivar`, { method: 'POST', body: {} })
export const reactivarCuenta = (id) => llamarApi(`/api/dashboard/equipo/${id}/reactivar`, { method: 'POST', body: {} })
export const leerAuditoria = ({ objetivoId, limite = 30, desde = 0 } = {}) => {
  const q = new URLSearchParams({ limite: String(limite), desde: String(desde), ...(objetivoId ? { objetivoId } : {}) })
  return llamarApi(`/api/dashboard/equipo/auditoria?${q}`)
}

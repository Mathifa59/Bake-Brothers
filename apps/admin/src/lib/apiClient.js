import { supabase } from './supabase'

// El puente hacia apps/api — a diferencia del resto del dashboard (que
// habla directo con Supabase), la creación de un pedido pasa por acá:
// apps/api verifica el JWT real del operador y recalcula todo del lado del
// servidor, nunca confía en lo que arme el navegador.
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

async function pedirConAuth(path, options = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('No hay sesión activa')

  return fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${session.access_token}`,
      ...options.headers,
    },
  })
}

/** Crea un pedido real vía apps/api. Lanza un Error con .codigo/.detalle si falla. */
export async function crearPedidoDashboard(payload) {
  const res = await pedirConAuth('/api/dashboard/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `Error del servidor (${res.status})`)
    err.codigo = data.error
    err.detalle = data.detalle
    throw err
  }
  return data
}

/**
 * Trae el comprobante como blob (no como link directo: el navegador no
 * manda el header de Authorization en una navegación normal) y devuelve una
 * URL de objeto lista para abrir/imprimir. Quien la use debe revocarla
 * (URL.revokeObjectURL) cuando ya no la necesite.
 */
export async function obtenerComprobantePdfUrl(numero) {
  const res = await pedirConAuth(`/api/dashboard/orders/${encodeURIComponent(numero)}/comprobante.pdf`)
  if (!res.ok) throw new Error(`No se pudo obtener el comprobante (${res.status})`)
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

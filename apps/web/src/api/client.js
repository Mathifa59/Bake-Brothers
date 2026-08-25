// Cliente HTTP hacia apps/api. Única puerta de salida a red del front.
//
// Modo demo: si VITE_API_URL no está configurada, la tienda funciona
// enteramente con datos locales (demoFallback.js) — así queda hoy, sin API
// ni base de datos desplegadas. En cuanto se configure VITE_API_URL (local
// o en Vercel), este archivo empieza a hablarle a la API real sin que
// ninguna página tenga que cambiar una sola línea.
import * as demo from './demoFallback'

const BASE_URL = import.meta.env.VITE_API_URL
const TENANT_SLUG = import.meta.env.VITE_TENANT_SLUG || 'bake-brothers'

export const modoDemo = !BASE_URL

async function request(ruta, opciones = {}) {
  const res = await fetch(`${BASE_URL}${ruta}`, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Slug': TENANT_SLUG,
      ...opciones.headers,
    },
  })
  const cuerpo = await res.json().catch(() => null)
  if (!res.ok) {
    const error = new Error(cuerpo?.error || `Error HTTP ${res.status}`)
    error.status = res.status
    error.cuerpo = cuerpo
    throw error
  }
  return cuerpo
}

const apiReal = {
  getProductos: () => request('/api/products'),
  getProducto: (id) => request(`/api/products/${encodeURIComponent(id)}`),
  getCategorias: () => request('/api/categories'),
  getDistritos: () => request('/api/delivery-zones'),
  getDisponibilidad: (fecha, tipo) =>
    request(`/api/availability?date=${fecha}&type=${encodeURIComponent(tipo)}`),
  crearPedido: (pedido) =>
    request('/api/orders', { method: 'POST', body: JSON.stringify(pedido) }),
  getPedidos: (filtros = {}) => {
    const params = new URLSearchParams(filtros).toString()
    return request(`/api/orders${params ? `?${params}` : ''}`)
  },
  getPedido: (numero) => request(`/api/orders/${encodeURIComponent(numero)}`),
}

const apiDemo = {
  getProductos: demo.getProductos,
  getProducto: demo.getProducto,
  getCategorias: demo.getCategorias,
  getDistritos: demo.getDistritos,
  getDisponibilidad: demo.getDisponibilidad,
  crearPedido: demo.crearPedido,
  getPedidos: demo.getPedidos,
  getPedido: demo.getPedido,
}

export const api = modoDemo ? apiDemo : apiReal

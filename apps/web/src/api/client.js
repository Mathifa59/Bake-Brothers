// Cliente HTTP hacia apps/api. Única puerta de salida a red del front.

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const TENANT_SLUG = import.meta.env.VITE_TENANT_SLUG || 'bake-brothers'

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

export const api = {
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

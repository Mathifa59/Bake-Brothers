// Cliente HTTP hacia apps/api. Única puerta de salida a red del front.
//
// Modo demo: si VITE_API_URL no está configurada, la tienda funciona
// enteramente con el catálogo local (demoFallback.js) — así queda hoy, sin
// API ni base de datos desplegadas. En cuanto se configure VITE_API_URL
// (local o en Vercel), este archivo empieza a hablarle a la API real sin
// que ninguna página tenga que cambiar una sola línea.
//
// El sitio es una vitrina informativa (sin carrito ni checkout): solo
// necesita leer el catálogo. La creación/consulta de pedidos vive en
// apps/api para cuando el bot de WhatsApp (Semana 2-3) los use.
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
}

const apiDemo = {
  getProductos: demo.getProductos,
  getProducto: demo.getProducto,
  getCategorias: demo.getCategorias,
}

export const api = modoDemo ? apiDemo : apiReal

import { supabase } from './supabase'

// El puente hacia apps/api — a diferencia del resto del dashboard (que
// habla directo con Supabase), la creación de un pedido pasa por acá:
// apps/api verifica el JWT real del operador y recalcula todo del lado del
// servidor, nunca confía en lo que arme el navegador.
// Sin VITE_API_URL: en un build de producción/vista previa se usa la API real
// (antes caía a localhost aunque el panel estuviera publicado); en desarrollo
// sigue siendo la API local.
const BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://api.bake-brothers.com' : 'http://localhost:3001')

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

/** Responde de verdad por WhatsApp desde la bandeja de Conversaciones. Lanza un Error con .codigo/.detalle si falla. */
export async function responderConversacion(conversacionId, texto) {
  const res = await pedirConAuth(`/api/dashboard/conversaciones/${encodeURIComponent(conversacionId)}/responder`, {
    method: 'POST',
    body: JSON.stringify({ texto }),
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
 * Plantillas aprobadas de Meta que se pueden mandar a esa conversación (se leen de Meta en el momento).
 * Devuelve { plantillas, noSoportadas, ventanaAbierta }. Lanza un Error con .codigo/.detalle si falla.
 */
export async function plantillasDeConversacion(conversacionId) {
  const res = await pedirConAuth(`/api/dashboard/conversaciones/${encodeURIComponent(conversacionId)}/plantillas`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `Error del servidor (${res.status})`)
    err.codigo = data.error
    err.detalle = data.detalle
    err.faltan = data.faltan
    throw err
  }
  return data
}

/** Envía una plantilla aprobada. `valores` es { [clave de variable]: texto }. Lanza un Error con .codigo/.detalle si falla. */
export async function enviarPlantillaConversacion(conversacionId, { nombre, idioma, valores }) {
  const res = await pedirConAuth(`/api/dashboard/conversaciones/${encodeURIComponent(conversacionId)}/plantilla`, {
    method: 'POST',
    body: JSON.stringify({ nombre, idioma, valores }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `Error del servidor (${res.status})`)
    err.codigo = data.error
    err.detalle = data.detalle
    err.faltan = data.faltan
    throw err
  }
  return data
}

/**
 * Tomar / devolver al bot / cerrar una conversación (o, solo dirección, asignar su local con accion = 'sede').
 * Una conversación sin local queda en el local de quien la toma. Lanza un Error con .codigo/.detalle si falla.
 */
export async function gestionarConversacion(conversacionId, accion, cuerpo = {}) {
  const res = await pedirConAuth(`/api/dashboard/conversaciones/${encodeURIComponent(conversacionId)}/${accion}`, {
    method: 'POST',
    body: JSON.stringify(cuerpo),
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
 * Simulador del bot (solo admin): manda un mensaje "como cliente" al cerebro real
 * y devuelve su respuesta. No envía nada por WhatsApp. La conversación vive en el
 * navegador: se reenvía el historial en cada turno. Lanza un Error con .codigo/.detalle si falla.
 */
export async function simularMensajeBot({ mensaje, sedeId, estado, historial, campana }) {
  let res
  try {
    res = await pedirConAuth('/api/dashboard/simulador/mensaje', {
      method: 'POST',
      body: JSON.stringify({ mensaje, sedeId, estado, historial, campana: campana ?? null }),
    })
  } catch (e) {
    // fetch lanza TypeError ante CORS bloqueado, API caída o sin red.
    const err = new Error(e?.message === 'No hay sesión activa' ? e.message : 'No se pudo conectar con la API')
    err.codigo = e?.message === 'No hay sesión activa' ? 'SIN_SESION' : 'SIN_CONEXION'
    throw err
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `Error del servidor (${res.status})`)
    err.codigo = data.error
    err.detalle = data.detalle
    err.status = res.status
    throw err
  }
  return data
}

/**
 * Importador de Mifact (solo admin): guarda los códigos de Mifact de las coincidencias que el admin dejó
 * marcadas — uno por unidad vendible y almacén. Solo guarda códigos: jamás un precio ni un nombre. Lanza un
 * Error con .codigo/.detalle si falla.
 */
export async function guardarCodigosMifact(asignaciones) {
  const res = await pedirConAuth('/api/dashboard/mifact/codigos', {
    method: 'POST',
    body: JSON.stringify({ asignaciones }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `Error del servidor (${res.status})`)
    err.codigo = data.error
    err.detalle = data.detalle ?? (data.detalles ? data.detalles.map((d) => `${d.campo}: ${d.mensaje}`).join('; ') : undefined)
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

// ——— Notificaciones push ———
async function jsonOError(res) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `Error del servidor (${res.status})`)
    err.codigo = data.error
    err.estado = res.status
    throw err
  }
  return data
}

/** La clave pública VAPID con la que el navegador se suscribe. Lanza PUSH_NO_CONFIGURADO (503) si la API no la tiene. */
export const traerClavePush = async () => (await jsonOError(await pedirConAuth('/api/dashboard/push/clave'))).clave

export const guardarSuscripcionPush = async (suscripcion) =>
  jsonOError(
    await pedirConAuth('/api/dashboard/push/suscribir', {
      method: 'POST',
      body: JSON.stringify({ endpoint: suscripcion.endpoint, keys: suscripcion.keys, userAgent: navigator.userAgent.slice(0, 300) }),
    })
  )

export const quitarSuscripcionPush = async (endpoint) =>
  jsonOError(await pedirConAuth('/api/dashboard/push/desuscribir', { method: 'POST', body: JSON.stringify({ endpoint }) }))

/** Manda un aviso de prueba a los dispositivos de quien lo pide. */
export const probarPush = async () => jsonOError(await pedirConAuth('/api/dashboard/push/probar', { method: 'POST', body: '{}' }))

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

// ——————————————————————————— Órdenes, plan del día y hojas para imprimir ————

async function llamar(path, { method = 'GET', body } = {}) {
  const res = await pedirConAuth(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `Error del servidor (${res.status})`)
    err.codigo = data.error
    err.status = res.status
    err.detalle = data.detalle ?? (data.detalles ? data.detalles.map((d) => `${d.campo}: ${d.mensaje}`).join('; ') : undefined)
    throw err
  }
  return data
}

/** Plan de producción del día (por pedido + vitrina) y su hoja. `sedeId` solo lo usa la dirección; un empleado siempre ve la suya. */
export const traerPlanDelDia = (fecha, sedeId) =>
  llamar(`/api/dashboard/produccion/plan?fecha=${encodeURIComponent(fecha)}${sedeId ? `&sedeId=${encodeURIComponent(sedeId)}` : ''}`)

/** Marca un producto del plan como producido: deja el stock de la sede disponible (y suma el conteo si se lleva). */
export const marcarProducido = (cuerpo) => llamar('/api/dashboard/produccion/producido', { method: 'POST', body: cuerpo })

export const registrarOrdenMayorista = (cuerpo) => llamar('/api/dashboard/ordenes/mayorista', { method: 'POST', body: cuerpo })
export const registrarOrdenRappi = (cuerpo) => llamar('/api/dashboard/ordenes/rappi', { method: 'POST', body: cuerpo })

/** Las líneas de la última orden de un mayorista («repetir el anterior»), o null si no tiene. */
export async function ultimaOrdenMayorista(clienteId) {
  try {
    return await llamar(`/api/dashboard/ordenes/mayorista/ultima?clienteId=${encodeURIComponent(clienteId)}`)
  } catch (err) {
    if (err.status === 404) return null
    throw err
  }
}

/**
 * Abre una hoja en PDF (el navegador no manda el header de Authorization en una navegación normal, así que se
 * trae como blob). La pestaña se abre ANTES de pedir el PDF: los celulares bloquean una ventana abierta después
 * de un `await`. Si no se pudo abrir, se descarga.
 */
export async function abrirPdfAutenticado(path, nombreArchivo = 'hoja.pdf') {
  const ventana = window.open('', '_blank')
  try {
    const res = await pedirConAuth(path)
    if (!res.ok) throw new Error(`No se pudo generar la hoja (${res.status})`)
    const url = URL.createObjectURL(await res.blob())
    if (ventana) {
      ventana.location.href = url
    } else {
      const a = document.createElement('a')
      a.href = url
      a.download = nombreArchivo
      a.click()
    }
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000)
  } catch (err) {
    ventana?.close()
    throw err
  }
}

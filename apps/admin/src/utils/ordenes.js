import { posicionSabor, saborDeEmpanada } from '@bakebrothers/domain'

/** Mensajes en español para los errores que devuelve la API de órdenes y producción. */
const MENSAJES = {
  SIN_ITEMS: 'Agrega al menos un producto.',
  FECHA_INVALIDA: 'La fecha no es válida.',
  HORA_INVALIDA: 'La hora no se entiende. Escríbela así: 7:30.',
  PRODUCTO_NO_ENCONTRADO: 'Uno de los productos ya no existe en el catálogo.',
  NO_ES_EMPANADA: 'Ese producto no es una empanada.',
  TAMANO_NO_DISPONIBLE: 'Ese producto no viene en ese tamaño.',
  TAMANO_INVALIDO: 'Ese tamaño no existe para ese producto.',
  CLIENTE_REQUERIDO: 'Elige un cliente o escribe el nombre de uno nuevo.',
  CLIENTE_NO_ENCONTRADO: 'No se encontró ese cliente.',
  REFERENCIA_REQUERIDA: 'Escribe el número de orden de Rappi.',
  TOTAL_INVALIDO: 'El total tiene que ser mayor que cero.',
  ORDEN_RAPPI_DUPLICADA: 'Esa orden de Rappi ya está registrada.',
  CANTIDAD_INVALIDA: 'La cantidad no es válida.',
  NO_ESTA_EN_EL_PLAN: 'Ese producto no está en el plan de ese día.',
  SEDE_REQUERIDA: 'Elige una sede.',
  SIN_SEDE_ASIGNADA: 'Tu cuenta no tiene un local asignado.',
  NO_AUTORIZADO: 'Tu sesión venció. Vuelve a entrar.',
}

export function mensajeDeError(err) {
  if (err?.codigo === 'ORDEN_RAPPI_DUPLICADA' && err.detalle?.numero) return `Esa orden de Rappi ya está registrada (${err.detalle.numero}).`
  return MENSAJES[err?.codigo] ?? err?.message ?? 'No se pudo completar la acción.'
}

/** Empanadas del catálogo, en el orden en que el equipo nombra los sabores. */
export function ordenarEmpanadas(productos) {
  return productos
    .filter((p) => /^empanada\b/i.test(p.nombre))
    .sort((a, b) => posicionSabor(saborDeEmpanada(a.nombre)) - posicionSabor(saborDeEmpanada(b.nombre)))
}

export const saborCorto = (nombre) => saborDeEmpanada(nombre)

/** Tamaños con precio de un producto (los que se venden en tienda); el tamaño oculto «Mediana» no cuenta. */
export const tamanosDeTienda = (p) => (p.product_sizes ?? []).filter((t) => t.precio !== null && t.visible_publico !== false)

export const hoyMasDias = (iso, dias) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

// ——— Hora de despacho/entrega ———
const PRIMERA_HORA_MIN = 6 * 60 // 6:00 a. m.
const ULTIMA_HORA_MIN = 21 * 60 + 30 // 9:30 p. m.
const PASO_MIN = 15

/** Minutos desde la medianoche → «7:30 am» / «1:30 pm» (el texto que entiende el servidor y se lee bien). */
function textoDeMinutos(min) {
  const h24 = Math.floor(min / 60)
  const m = min % 60
  const sufijo = h24 >= 12 ? 'pm' : 'am'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')} ${sufijo}`
}

/** Las horas del selector, de 15 en 15 minutos: { valor: '7:30 am', etiqueta: '7:30 a. m.' }. */
export function opcionesDeHora() {
  const lista = []
  for (let min = PRIMERA_HORA_MIN; min <= ULTIMA_HORA_MIN; min += PASO_MIN) {
    const valor = textoDeMinutos(min)
    lista.push({ valor, etiqueta: valor.replace(' am', ' a. m.').replace(' pm', ' p. m.') })
  }
  return lista
}

/**
 * Lleva una hora escrita de cualquier forma («7:30», «07:30», «1:30 pm», «16:00», «4pm») al formato del selector.
 * Sin am/pm se toma tal cual en reloj de 24 h: «7:30» es la mañana (los despachos de mayoristas son de madrugada) y
 * «16:00» las 4 p. m. Si no se entiende, se devuelve tal cual.
 */
export function aOpcionDeHora(texto) {
  const crudo = String(texto ?? '').trim().toLowerCase()
  const m = crudo.match(/^(\d{1,2})(?:[:.h](\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?$/)
  if (!m) return String(texto ?? '')
  let h = Number(m[1])
  const min = m[2] ? Number(m[2]) : 0
  const sufijo = m[3]?.replace(/[\s.]/g, '')
  if (min > 59 || h > 23) return String(texto ?? '')
  if (sufijo === 'pm' && h < 12) h += 12
  else if (sufijo === 'am' && h === 12) h = 0
  return textoDeMinutos(h * 60 + min)
}

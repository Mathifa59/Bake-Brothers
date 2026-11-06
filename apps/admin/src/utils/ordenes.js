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

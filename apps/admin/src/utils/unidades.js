import { fechaLimaISO, sumarDiasISO } from '@bakebrothers/domain'

export const hoyLima = () => fechaLimaISO(new Date())
export const mananaLima = () => sumarDiasISO(hoyLima(), 1)

const soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' })
export const formatoSoles = (n) => soles.format(Number(n) || 0)

const DIA = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', weekday: 'short', day: 'numeric', month: 'short' })
/** «lun, 10 mar» a partir de «2031-03-10» (se interpreta al mediodía para que ningún huso lo corra de día). */
export const diaLegible = (iso) => DIA.format(new Date(`${iso}T12:00:00-05:00`)).replace('.', '')

/**
 * Los productos que se pueden mover como una salida: una fila por producto y tamaño. Un producto sin tamaños es una sola
 * fila; las empanadas (que tienen un tamaño oculto, la «Mediana») además tienen su versión sin tamaño, la «Grande».
 */
export function armarSkus(productos, tamanos) {
  const porProducto = new Map()
  for (const t of tamanos) {
    if (!porProducto.has(t.product_id)) porProducto.set(t.product_id, [])
    porProducto.get(t.product_id).push(t)
  }
  const skus = []
  for (const p of productos) {
    const ts = (porProducto.get(p.id) ?? []).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    const tieneOculto = ts.some((t) => t.visible_publico === false)
    if (ts.length === 0 || tieneOculto) skus.push({ clave: p.id, productId: p.id, productSizeId: null, producto: p.nombre, tamano: tieneOculto ? 'Grande' : null, tipo: p.tipo })
    for (const t of ts) skus.push({ clave: `${p.id}:${t.id}`, productId: p.id, productSizeId: t.id, producto: p.nombre, tamano: t.tamano, tipo: p.tipo })
  }
  return skus
}

export const nombreSku = (s) => (s.tamano ? `${s.producto} · ${s.tamano}` : s.producto)

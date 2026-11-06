/**
 * Regla única de "¿se puede vender esto?" según el stock por sede. La usan el bot, "Nuevo pedido" del
 * dashboard y `POST /api/orders`, para que lo agotado no se venda por ningún camino.
 *
 * Un SKU es un producto, o un producto + tamaño (igual que la tabla `stock`). Reglas:
 *  - Sin fila de stock para esa sede y ese SKU → disponible (así funcionaba Stock.jsx: el primer toque
 *    marca "agotado"; sin fila es disponible implícito).
 *  - `disponible = false` → agotado.
 *  - `cantidad` con conteo (no null) menor a lo pedido → no alcanza. `cantidad = null` es "sin conteo exacto"
 *    y nunca bloquea por cantidad.
 *  - Una fila del producto entero (sin tamaño) cubre todos sus tamaños: si está agotada, ningún tamaño se vende
 *    en esa sede, aunque haya fila propia del tamaño. Si el tamaño no tiene fila propia, hereda también el conteo
 *    de la fila del producto. (La pantalla Stock siempre guarda una fila por tamaño; esto cubre filas cargadas a
 *    mano o por una importación.) Al revés no aplica: la fila de un tamaño no cuenta para el producto sin tamaño.
 *  - Con sede conocida se mira solo esa sede. Sin sede (un delivery del bot, o la web) se acepta si ALGUNA
 *    sede activa lo tiene: el pedido lo toma después la sede que pueda cumplirlo.
 */

export interface FilaStockSede {
  sedeId: string
  /** null = producto sin tamaños (o fila del producto entero). */
  productSizeId: string | null
  disponible: boolean
  /** null = no se lleva conteo exacto. */
  cantidad: number | null
}

export type MotivoNoDisponible = 'agotado' | 'cantidad_insuficiente'

export interface ConsultaDisponibilidad {
  /** Tamaño del SKU (id de product_sizes), o null si el producto no se pide por tamaño. */
  productSizeId: string | null
  /** Unidades que se quieren vender (para comparar contra un conteo exacto). Mínimo 1. */
  cantidad: number
  /** Sede del pedido, o null si todavía no tiene. */
  sedeId: string | null
  /** Ids de las sedes activas (para la regla "alguna sede" cuando no hay sede). */
  sedesActivas: readonly string[]
  /** Todas las filas de `stock` del producto (de cualquier sede y tamaño). */
  filas: readonly FilaStockSede[]
}

export type ResultadoDisponibilidad =
  | { disponible: true; enSedes: string[] }
  | {
      disponible: false
      motivo: MotivoNoDisponible
      /** Sedes donde SÍ se podría vender (por si el pedido no tiene sede o hay que ofrecer otra). */
      enSedes: string[]
      /** Solo con `cantidad_insuficiente` y sede conocida: lo que queda contado en esa sede. */
      cantidadDisponible?: number
    }

type EstadoSede = { ok: true } | { ok: false; motivo: MotivoNoDisponible; cantidadDisponible?: number }

function evaluarSede(sedeId: string, q: ConsultaDisponibilidad): EstadoSede {
  const cantidad = Math.max(1, q.cantidad)
  const filaProducto = q.filas.find((f) => f.sedeId === sedeId && f.productSizeId === null)
  const filaTamano = q.productSizeId === null ? undefined : q.filas.find((f) => f.sedeId === sedeId && f.productSizeId === q.productSizeId)
  // El producto entero agotado gana sobre cualquier fila de tamaño.
  if (q.productSizeId !== null && filaProducto && !filaProducto.disponible) return { ok: false, motivo: 'agotado' }
  const fila = q.productSizeId === null ? filaProducto : (filaTamano ?? filaProducto)
  if (!fila) return { ok: true }
  if (!fila.disponible) return { ok: false, motivo: 'agotado' }
  if (fila.cantidad !== null && fila.cantidad < cantidad) {
    return { ok: false, motivo: 'cantidad_insuficiente', cantidadDisponible: Math.max(0, fila.cantidad) }
  }
  return { ok: true }
}

export function productoDisponibleEnSede(q: ConsultaDisponibilidad): ResultadoDisponibilidad {
  // Sedes donde sí se puede vender, entre las activas. Con una sede dada y fuera de la lista de activas
  // (no debería pasar) igual se evalúa su fila.
  const sedesAEvaluar = q.sedeId && !q.sedesActivas.includes(q.sedeId) ? [...q.sedesActivas, q.sedeId] : [...q.sedesActivas]
  const estados = new Map(sedesAEvaluar.map((s) => [s, evaluarSede(s, q)] as const))
  const enSedes = sedesAEvaluar.filter((s) => estados.get(s)!.ok)

  if (q.sedeId) {
    const e = estados.get(q.sedeId)!
    if (e.ok) return { disponible: true, enSedes }
    return { disponible: false, motivo: e.motivo, enSedes, cantidadDisponible: e.cantidadDisponible }
  }

  // Sin sede: alcanza con que una sede activa pueda. Sin sedes activas no hay nada que contradiga: disponible.
  if (sedesAEvaluar.length === 0 || enSedes.length > 0) return { disponible: true, enSedes }
  const motivos = [...estados.values()].map((e) => (e.ok ? null : e.motivo))
  return { disponible: false, motivo: motivos.every((m) => m === 'agotado') ? 'agotado' : 'cantidad_insuficiente', enSedes }
}

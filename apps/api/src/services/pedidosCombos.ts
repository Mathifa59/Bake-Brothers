import type pg from 'pg'
import type { OrderItemInsert } from '../repositories/ordersRepo.js'
import { buscarProductosPorTexto } from '../repositories/productsRepo.js'
import { resolverTamano, resolverTamanoTexto } from '../repositories/busquedaTexto.js'
import { verificarStockDeLineas, type LineaParaStock } from '../repositories/stockRepo.js'

/**
 * Validación de items de COMBO — compartida por dos callers:
 *   - apps/admin → POST /api/dashboard/orders (crearPedidoDashboard.ts):
 *     `canalPedido = 'presencial'`, un operador ya confirmó todo a mano.
 *   - el bot → crearPedido (bot/cerebro.ts): `canalPedido` viene de la
 *     conversación real (whatsapp/facebook/instagram). El precio de una
 *     línea de combo es siempre `combos.precio_promo` — precio fijo de
 *     paquete, no se recalcula por producto (a diferencia de
 *     pedidosTienda.ts).
 *
 * `canalPedido === 'presencial'` es también la señal de "esto lo vende un
 * humano, no el bot" — mismo valor literal que ya usa `orders.canal` para
 * distinguir el origen (crearPedidoDashboard.ts siempre inserta
 * `canal: 'presencial'`). Las reglas de abajo que solo tienen sentido
 * cuando decide el bot (clasificar por grupo, exigir la selección
 * estructurada del Grupo 2) se activan con esa misma señal, sin duplicar
 * un segundo parámetro que diga lo mismo dos veces.
 */

export type CanalPedido = 'presencial' | 'whatsapp' | 'facebook' | 'instagram' | 'web'

function esCanalBot(canalPedido: CanalPedido): boolean {
  return canalPedido !== 'presencial'
}

/**
 * `canal_permitido` de un combo es 'presencial' | 'whatsapp' | 'ambos' (ver
 * 0004) — 'whatsapp' significa "canal digital de chat", no literal solo
 * WhatsApp (por eso también cubre facebook/instagram acá). Mismo criterio
 * en las dos direcciones: un combo exclusivo de un lado nunca se vende del
 * otro.
 */
function comboDisponibleEnCanal(canalPermitido: string, canalPedido: CanalPedido): boolean {
  if (canalPermitido === 'ambos') return true
  if (canalPermitido === 'presencial') return canalPedido === 'presencial'
  return canalPedido !== 'presencial'
}

export interface SeleccionComboInput {
  productoBusqueda: string
  tamano?: string | null
  cantidad: number
}

export interface ItemComboInput {
  // uuid exacto (apps/admin, vía dropdown) o nombre aproximado (el bot,
  // mismo criterio que productoParaPedidoPorBusqueda en pedidosTienda.ts).
  comboId: string
  cantidad: number
  // Solo relevante para combos del Grupo 2 (permite_cambios=true) vendidos
  // por el bot — la composición real que eligió el cliente, como datos
  // estructurados equivalentes a combo_items (no el texto libre del
  // mensaje), para que el pedido siga siendo consultable igual que
  // cualquier otro. Se ignora si el combo no lo requiere.
  seleccion?: SeleccionComboInput[]
}

export type ResultadoItemsCombo =
  | { ok: true; items: OrderItemInsert[]; subtotal: number; requiereConfirmarCombo: boolean }
  | { ok: false; error: string; detalle?: unknown }

/**
 * `sedeId`: sede del pedido si ya se conoce. Lo agotado no se vende tampoco dentro de un combo: se verifica el
 * stock (por sede, producto + tamaño) de lo que el pedido realmente entrega — la composición fija del combo o,
 * si el combo permite cambios, la selección que eligió el cliente. Si es un combo con cambios y no hay selección
 * (venta de un operador, que confirma a mano), no hay composición concreta que verificar.
 */
export async function validarItemsCombo(
  client: pg.PoolClient,
  tenantId: string,
  items: ItemComboInput[],
  canalPedido: CanalPedido,
  sedeId: string | null = null
): Promise<ResultadoItemsCombo> {
  const itemsValidados: OrderItemInsert[] = []
  const lineasStock: LineaParaStock[] = []
  let subtotal = 0
  let requiereConfirmarCombo = false

  for (const item of items) {
    const { rows } = await client.query(
      `select id, nombre, precio_promo, canal_permitido, permite_cambios
       from combos where activo and (id::text = $1 or nombre ilike $2)
       order by (id::text = $1) desc, nombre
       limit 1`,
      [item.comboId, `%${item.comboId}%`]
    )
    const combo = rows[0]
    if (!combo) {
      return { ok: false, error: 'COMBO_NO_ENCONTRADO', detalle: { comboId: item.comboId } }
    }
    if (!comboDisponibleEnCanal(combo.canal_permitido, canalPedido)) {
      return {
        ok: false,
        error: 'COMBO_NO_DISPONIBLE_EN_ESTE_CANAL',
        detalle: { combo: combo.nombre, canalPermitido: combo.canal_permitido, canalPedido },
      }
    }

    const precioUnitario = Number(combo.precio_promo)
    itemsValidados.push({
      productId: null,
      cateringItemId: null,
      comboId: combo.id,
      nombreProducto: combo.nombre,
      tamano: null,
      extras: [],
      precioUnitario,
      cantidad: item.cantidad,
    })
    subtotal += precioUnitario * item.cantidad

    // Composición definida del combo (si la tiene), con producto y tamaño: sirve para clasificar el combo (bot)
    // y para verificar el stock de lo que se entrega.
    const { rows: comboItemsRows } = await client.query(
      `select ci.product_id, ci.product_size_id, ci.cantidad, p.nombre, ps.tamano
       from combo_items ci
       join products p on p.id = ci.product_id
       left join product_sizes ps on ps.id = ci.product_size_id
       where ci.combo_id = $1`,
      [combo.id]
    )
    if (!combo.permite_cambios) {
      for (const ci of comboItemsRows) {
        lineasStock.push({
          productId: ci.product_id,
          productSizeId: ci.product_size_id ?? null,
          nombre: ci.nombre,
          tamano: ci.tamano ?? null,
          cantidad: Number(ci.cantidad) * item.cantidad,
        })
      }
    }

    // Las reglas de clasificación por grupo (composición fija/sustituible/
    // inexistente) solo aplican cuando decide el bot — un operador humano
    // ya confirmó los detalles al vender, no necesita esta red de
    // seguridad (mismo criterio que ya distingue crearPedidoDashboard.ts).
    if (!esCanalBot(canalPedido)) continue

    if (comboItemsRows.length === 0) {
      // Grupo 3: sin composición definida ("sujeto a stock del día") — el
      // bot no tiene con qué confirmar, tiene que escalar.
      return { ok: false, error: 'COMBO_SIN_COMPOSICION_DEFINIDA', detalle: { combo: combo.nombre } }
    }

    if (combo.permite_cambios) {
      // Grupo 2: cierra igual, pero el pedido queda marcado para revisión
      // y la sustitución elegida se guarda estructurada, no como texto.
      requiereConfirmarCombo = true
      const seleccion = item.seleccion ?? []
      if (seleccion.length === 0) {
        return { ok: false, error: 'SELECCION_COMBO_REQUERIDA', detalle: { combo: combo.nombre } }
      }
      for (const sel of seleccion) {
        const { mejor: producto, tamano: tamanoEnFrase } = await buscarProductosPorTexto(
          client,
          tenantId,
          sel.productoBusqueda,
          sel.tamano
        )
        if (!producto) {
          return { ok: false, error: 'PRODUCTO_NO_ENCONTRADO', detalle: { producto: sel.productoBusqueda } }
        }
        // Mismo criterio que pedidosTienda: el tamaño puede venir aparte o dentro de la frase, y se guarda la
        // etiqueta REAL del catálogo. Si el producto no tiene tamaños, una mención suelta no aplica.
        const etiquetas = producto.tamanos.map((t: { tamano: string }) => t.tamano)
        let tamanoReal: string | null = null
        if (sel.tamano) {
          tamanoReal = resolverTamanoTexto(sel.tamano, etiquetas)
          if (!tamanoReal) {
            return {
              ok: false,
              error: 'TAMANO_INVALIDO',
              detalle: { producto: producto.nombre, tamano: sel.tamano, tamanosDisponibles: etiquetas },
            }
          }
        } else if (tamanoEnFrase && etiquetas.length > 0) {
          tamanoReal = resolverTamano(tamanoEnFrase, etiquetas)
          if (!tamanoReal) {
            return {
              ok: false,
              error: 'TAMANO_NO_DISPONIBLE',
              detalle: { producto: producto.nombre, tamanoPedido: tamanoEnFrase.dicho, tamanosDisponibles: etiquetas },
            }
          }
        }
        // Línea informativa (precio 0, mismo criterio que catering en
        // crearPedido.ts) — el combo ya cobró su precio fijo arriba, esto
        // solo deja la composición real elegida consultable en order_items.
        itemsValidados.push({
          productId: producto.id,
          cateringItemId: null,
          comboId: null,
          nombreProducto: producto.nombre,
          tamano: tamanoReal,
          extras: [],
          precioUnitario: 0,
          cantidad: sel.cantidad,
        })
        lineasStock.push({
          productId: producto.id,
          productSizeId: tamanoReal ? (producto.tamanos.find((t) => t.tamano === tamanoReal)?.id ?? null) : null,
          nombre: producto.nombre,
          tamano: tamanoReal,
          cantidad: sel.cantidad * item.cantidad,
        })
      }
    }
  }

  const stock = await verificarStockDeLineas(client, lineasStock, sedeId)
  if (!stock.ok) return stock

  return { ok: true, items: itemsValidados, subtotal, requiereConfirmarCombo }
}

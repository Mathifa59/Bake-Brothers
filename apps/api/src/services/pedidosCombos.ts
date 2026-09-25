import type pg from 'pg'
import type { OrderItemInsert } from '../repositories/ordersRepo.js'
import { productoParaPedidoPorBusqueda } from '../repositories/productsRepo.js'

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

export async function validarItemsCombo(
  client: pg.PoolClient,
  tenantId: string,
  items: ItemComboInput[],
  canalPedido: CanalPedido
): Promise<ResultadoItemsCombo> {
  const itemsValidados: OrderItemInsert[] = []
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

    // Las reglas de clasificación por grupo (composición fija/sustituible/
    // inexistente) solo aplican cuando decide el bot — un operador humano
    // ya confirmó los detalles al vender, no necesita esta red de
    // seguridad (mismo criterio que ya distingue crearPedidoDashboard.ts).
    if (!esCanalBot(canalPedido)) continue

    const { rows: comboItemsRows } = await client.query(
      `select 1 from combo_items where combo_id = $1 limit 1`,
      [combo.id]
    )

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
        const producto = await productoParaPedidoPorBusqueda(client, tenantId, sel.productoBusqueda)
        if (!producto) {
          return { ok: false, error: 'PRODUCTO_NO_ENCONTRADO', detalle: { producto: sel.productoBusqueda } }
        }
        if (sel.tamano && !producto.tamanos.some((t: { tamano: string }) => t.tamano === sel.tamano)) {
          return { ok: false, error: 'TAMANO_INVALIDO', detalle: { producto: producto.nombre, tamano: sel.tamano } }
        }
        // Línea informativa (precio 0, mismo criterio que catering en
        // crearPedido.ts) — el combo ya cobró su precio fijo arriba, esto
        // solo deja la composición real elegida consultable en order_items.
        itemsValidados.push({
          productId: producto.id,
          cateringItemId: null,
          comboId: null,
          nombreProducto: producto.nombre,
          tamano: sel.tamano ?? null,
          extras: [],
          precioUnitario: 0,
          cantidad: sel.cantidad,
        })
      }
    }
  }

  return { ok: true, items: itemsValidados, subtotal, requiereConfirmarCombo }
}

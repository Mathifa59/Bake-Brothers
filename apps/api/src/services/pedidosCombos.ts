import type pg from 'pg'
import type { OrderItemInsert } from '../repositories/ordersRepo.js'

/**
 * Validación de items de COMBO para el puente apps/admin → apps/api
 * (POST /api/dashboard/orders). El precio de una línea de combo es
 * `combos.precio_promo` tal cual — precio fijo de paquete, no se recalcula
 * por producto (a diferencia de pedidosTienda.ts).
 *
 * `canal_permitido` se valida acá: un combo exclusivo de 'whatsapp' no se
 * puede vender desde el mostrador/dashboard — mismo criterio que ya aplica
 * en la dirección contraria (el bot nunca ofrece nada fuera de su canal).
 */

export interface ItemComboInput {
  comboId: string
  cantidad: number
}

export type ResultadoItemsCombo =
  | { ok: true; items: OrderItemInsert[]; subtotal: number }
  | { ok: false; error: string; detalle?: unknown }

export async function validarItemsCombo(
  client: pg.PoolClient,
  items: ItemComboInput[]
): Promise<ResultadoItemsCombo> {
  const itemsValidados: OrderItemInsert[] = []
  let subtotal = 0

  for (const item of items) {
    const { rows } = await client.query(
      `select id, nombre, precio_promo, canal_permitido from combos where id = $1 and activo`,
      [item.comboId]
    )
    const combo = rows[0]
    if (!combo) {
      return { ok: false, error: 'COMBO_NO_ENCONTRADO', detalle: { comboId: item.comboId } }
    }
    if (combo.canal_permitido === 'whatsapp') {
      return {
        ok: false,
        error: 'COMBO_NO_DISPONIBLE_PRESENCIAL',
        detalle: { combo: combo.nombre, canalPermitido: combo.canal_permitido },
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
  }

  return { ok: true, items: itemsValidados, subtotal }
}

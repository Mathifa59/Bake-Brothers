import type pg from 'pg'
import { consultarReglasCatering, evaluarSemaforoCateringPedido } from '../bot/tools.js'
import type { OrderItemInsert } from '../repositories/ordersRepo.js'

/**
 * Validación de items de CATERING para crearPedido (tool del bot,
 * apps/api/src/bot/tools.ts). Re-evalúa el semáforo acá adentro, en
 * servidor — nunca confía en que el modelo solo haya llamado a esta función
 * después de ver verde en evaluarSemaforoCateringPedido (esa regla vive en
 * el system prompt, pero el prompt no es una garantía; el código sí). Si
 * cualquier línea no da verde, se rechaza el pedido completo — no se crea
 * nada parcial.
 *
 * catering_items no tiene ningún precio en el catálogo (ver
 * 0019_order_items_catering.sql) — precioUnitario siempre sale en 0, el
 * operador lo completa a mano al cotizar.
 */

export interface ItemCateringInput {
  busquedaItem: string
  cantidad: number
  // Texto libre para lo que el cliente haya pedido de particular (ej. "sin
  // picante", "mitad y mitad") — no hay un campo estructurado para esto
  // todavía, así que se agrega a `nota` del pedido, no acá.
}

export type ResultadoItemsCatering =
  | { ok: true; items: OrderItemInsert[] }
  | { ok: false; error: string; detalle?: unknown }

export async function validarItemsCatering(
  client: pg.PoolClient,
  items: ItemCateringInput[],
  fechaEntregaISO: string
): Promise<ResultadoItemsCatering> {
  const itemsValidados: OrderItemInsert[] = []

  for (const item of items) {
    const regla = await consultarReglasCatering(client, item.busquedaItem)
    if (!regla) {
      return { ok: false, error: 'ITEM_CATERING_NO_ENCONTRADO', detalle: { busqueda: item.busquedaItem } }
    }

    const semaforo = await evaluarSemaforoCateringPedido(client, item.busquedaItem, {
      cantidadSolicitada: item.cantidad,
      fechaEntregaISO,
    })
    if (semaforo !== 'verde') {
      return {
        ok: false,
        error: 'CATERING_NO_VERDE',
        detalle: { item: regla.itemNombre, semaforo },
      }
    }

    itemsValidados.push({
      productId: null,
      cateringItemId: regla.itemId,
      nombreProducto: regla.itemNombre,
      tamano: null,
      extras: [],
      precioUnitario: 0,
      cantidad: item.cantidad,
    })
  }

  return { ok: true, items: itemsValidados }
}

import type pg from 'pg'
import {
  calcularPrecioLinea,
  calcularSubtotal,
  cumpleAnticipacionMinima,
  hayCupoDisponible,
  cupoRestante,
} from '@bakebrothers/domain'
import { productoParaPedidoPorBusqueda, extrasActivos } from '../repositories/productsRepo.js'
import { cupoMaximoDelDia, unidadesReservadas } from '../repositories/capacityRepo.js'
import type { OrderItemInsert } from '../repositories/ordersRepo.js'

/**
 * Validación + valorización de items de TIENDA (catálogo real, tamaños,
 * extras, anticipación mínima, capacidad de producción) — extraída de
 * `POST /api/orders` para que `crearPedido` (tool del bot,
 * apps/api/src/bot/tools.ts) reuse exactamente la misma lógica, en vez de
 * duplicarla o confiar en lo que el modelo cree que cuesta algo. El precio
 * SIEMPRE se recalcula acá con @bakebrothers/domain, nunca se acepta el que
 * mande el caller.
 */

export interface ItemTiendaInput {
  productoId: string
  tamano?: string | null
  extras?: string[]
  cantidad: number
}

export type ResultadoItemsTienda =
  | { ok: true; items: OrderItemInsert[]; subtotal: number }
  | { ok: false; error: string; detalle?: unknown }

export async function validarYValorizarItemsTienda(
  client: pg.PoolClient,
  tenantId: string,
  items: ItemTiendaInput[],
  fechaEntregaISO: string
): Promise<ResultadoItemsTienda> {
  // 1. Productos reales del catálogo — por slug exacto (apps/web, que ya
  // conoce el slug real del catálogo estructurado) o texto aproximado (el
  // bot, que solo tiene el nombre que escribió el cliente — mismo criterio
  // que consultarPrecio en bot/tools.ts).
  const busquedas = [...new Set(items.map((i) => i.productoId))]
  const porBusqueda = new Map<string, Awaited<ReturnType<typeof productoParaPedidoPorBusqueda>>>()
  for (const busqueda of busquedas) {
    porBusqueda.set(busqueda, await productoParaPedidoPorBusqueda(client, tenantId, busqueda))
  }

  const noEncontrados = busquedas.filter((b) => !porBusqueda.get(b))
  if (noEncontrados.length > 0) {
    return { ok: false, error: 'PRODUCTO_NO_ENCONTRADO', detalle: { productos: noEncontrados } }
  }
  const noDisponibles = busquedas.filter((b) => !porBusqueda.get(b)!.disponible).map((b) => porBusqueda.get(b)!.slug)
  if (noDisponibles.length > 0) {
    return { ok: false, error: 'PRODUCTO_NO_DISPONIBLE', detalle: { productos: noDisponibles } }
  }

  // 2. Validar tamaños y extras contra el catálogo
  const catalogoExtras = await extrasActivos(client, tenantId)
  for (const item of items) {
    const producto = porBusqueda.get(item.productoId)!
    const aceptaTamanos = producto.tamanos.length > 0
    if (item.tamano && !aceptaTamanos) {
      return { ok: false, error: 'TAMANO_NO_APLICA', detalle: { producto: item.productoId } }
    }
    if (item.tamano && aceptaTamanos && !producto.tamanos.some((t) => t.tamano === item.tamano)) {
      return { ok: false, error: 'TAMANO_INVALIDO', detalle: { producto: item.productoId } }
    }
    const extrasInvalidos = (item.extras ?? []).filter((e) => !catalogoExtras.has(e))
    if (extrasInvalidos.length > 0) {
      return { ok: false, error: 'EXTRA_INVALIDO', detalle: { extras: extrasInvalidos } }
    }
  }

  // 3. Anticipación mínima por producto (catálogo real: la mayoría no tiene
  // anticipación documentada — null se trata como "sin mínimo conocido").
  const violaciones = items
    .map((item) => {
      const producto = porBusqueda.get(item.productoId)!
      const anticipacionHorasMinima = producto.anticipacion_horas ?? 0
      const cumple = cumpleAnticipacionMinima({
        fechaEntregaISO,
        anticipacionHorasMinima,
      })
      return cumple ? null : { productoId: producto.slug, horasMinimas: anticipacionHorasMinima }
    })
    .filter(Boolean)
  if (violaciones.length > 0) {
    return { ok: false, error: 'ANTICIPACION_INSUFICIENTE', detalle: violaciones }
  }

  // 4. Capacidad de producción por categoría y fecha
  const solicitadoPorCategoria = new Map<string, number>()
  for (const item of items) {
    const producto = porBusqueda.get(item.productoId)!
    if (!producto.category_id) continue
    solicitadoPorCategoria.set(
      producto.category_id,
      (solicitadoPorCategoria.get(producto.category_id) ?? 0) + item.cantidad
    )
  }
  for (const [categoryId, solicitadas] of solicitadoPorCategoria) {
    const cupoMaximo = await cupoMaximoDelDia(client, tenantId, categoryId, fechaEntregaISO)
    const reservadas = await unidadesReservadas(client, tenantId, categoryId, fechaEntregaISO)
    if (!hayCupoDisponible({ cupoMaximo, unidadesReservadas: reservadas, unidadesSolicitadas: solicitadas })) {
      return {
        ok: false,
        error: 'SIN_CUPO_DISPONIBLE',
        detalle: { fecha: fechaEntregaISO, cupoRestante: cupoRestante({ cupoMaximo, unidadesReservadas: reservadas }) },
      }
    }
  }

  // 5. Precios: SIEMPRE recalculados en el servidor.
  const itemsValorizados: OrderItemInsert[] = items.map((item) => {
    const producto = porBusqueda.get(item.productoId)!
    const tamanoSeleccionado = item.tamano
      ? producto.tamanos.find((t) => t.tamano === item.tamano)
      : undefined
    const precioUnitario = calcularPrecioLinea({
      precioBase: Number(producto.precio_base),
      tamano: item.tamano ?? null,
      precioTamano: tamanoSeleccionado ? Number(tamanoSeleccionado.precio) : null,
      preciosExtras: (item.extras ?? []).map((e) => catalogoExtras.get(e)!.precio),
    })
    return {
      productId: producto.id,
      cateringItemId: null,
      comboId: null,
      nombreProducto: producto.nombre,
      tamano: item.tamano ?? null,
      extras: item.extras ?? [],
      precioUnitario,
      cantidad: item.cantidad,
    }
  })
  const subtotal = calcularSubtotal(
    itemsValorizados.map((i) => ({ precioLinea: i.precioUnitario, cantidad: i.cantidad }))
  )

  return { ok: true, items: itemsValorizados, subtotal }
}

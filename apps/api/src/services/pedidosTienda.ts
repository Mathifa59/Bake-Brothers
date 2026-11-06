import type pg from 'pg'
import {
  calcularPrecioLinea,
  calcularSubtotal,
  cumpleAnticipacionMinima,
  fechaLimaISO,
  hayCupoDisponible,
  cupoRestante,
} from '@bakebrothers/domain'
import { buscarProductosPorTexto, extrasActivos, type CandidatoProducto } from '../repositories/productsRepo.js'
import { resolverTamano, resolverTamanoTexto, type TamanoPedido } from '../repositories/busquedaTexto.js'
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
  // Cada línea se resuelve con SU producto y SU tamaño (si el cliente dijo "torta de chocolate" y tamaño
  // "Familiar", gana la torta que viene en familiar). La clave incluye el tamaño explícito por eso.
  type Resuelto = { producto: CandidatoProducto | null; tamanoEnFrase: TamanoPedido | null }
  const clave = (i: ItemTiendaInput) => `${i.productoId}|${i.tamano ?? ''}`
  const porClave = new Map<string, Resuelto>()
  for (const item of items) {
    if (porClave.has(clave(item))) continue
    const r = await buscarProductosPorTexto(client, tenantId, item.productoId, item.tamano)
    porClave.set(clave(item), { producto: r.mejor, tamanoEnFrase: r.tamano })
  }
  const porBusqueda = {
    get: (item: ItemTiendaInput) => porClave.get(clave(item))!.producto,
  }

  const noEncontrados = [...new Set(items.filter((i) => !porBusqueda.get(i)).map((i) => i.productoId))]
  if (noEncontrados.length > 0) {
    return { ok: false, error: 'PRODUCTO_NO_ENCONTRADO', detalle: { productos: noEncontrados } }
  }
  const noDisponibles = [
    ...new Set(items.filter((i) => !porBusqueda.get(i)!.disponible).map((i) => porBusqueda.get(i)!.slug)),
  ]
  if (noDisponibles.length > 0) {
    return { ok: false, error: 'PRODUCTO_NO_DISPONIBLE', detalle: { productos: noDisponibles } }
  }

  // 2. Validar tamaños y extras contra el catálogo
  const catalogoExtras = await extrasActivos(client, tenantId)
  // Etiqueta REAL del tamaño de cada línea (la del catálogo, no lo que escribió el cliente).
  const tamanoReal = new Map<ItemTiendaInput, string | null>()
  for (const item of items) {
    const producto = porBusqueda.get(item)!
    const tamanosDelProducto = producto.tamanos.map((t) => ({ tamano: t.tamano, precio: Number(t.precio) }))
    const etiquetas = tamanosDelProducto.map((t) => t.tamano)
    const aceptaTamanos = etiquetas.length > 0
    if (item.tamano && !aceptaTamanos) {
      return { ok: false, error: 'TAMANO_NO_APLICA', detalle: { producto: item.productoId } }
    }
    let etiqueta: string | null = null
    if (item.tamano) {
      // Lo que mandó el modelo en `tamano`: la etiqueta exacta o algo que se entienda ("individual", "Familiar").
      etiqueta = resolverTamanoTexto(item.tamano, etiquetas)
      if (!etiqueta) {
        return {
          ok: false,
          error: 'TAMANO_INVALIDO',
          detalle: { producto: item.productoId, tamanoPedido: item.tamano, tamanosDisponibles: tamanosDelProducto },
        }
      }
    } else {
      // Tamaño dicho dentro de la frase del producto ("carrot cake individual"). Si el producto no tiene
      // tamaños (p. ej. "Brownie (caja x16)") esa mención ya es parte del nombre, no hay nada que resolver.
      const enFrase = porClave.get(clave(item))!.tamanoEnFrase
      if (enFrase && aceptaTamanos) {
        etiqueta = resolverTamano(enFrase, etiquetas)
        if (!etiqueta) {
          return {
            ok: false,
            error: 'TAMANO_NO_DISPONIBLE',
            detalle: { producto: producto.nombre, tamanoPedido: enFrase.dicho, tamanosDisponibles: tamanosDelProducto },
          }
        }
      }
    }
    tamanoReal.set(item, etiqueta)
    const extrasInvalidos = (item.extras ?? []).filter((e) => !catalogoExtras.has(e))
    if (extrasInvalidos.length > 0) {
      return { ok: false, error: 'EXTRA_INVALIDO', detalle: { extras: extrasInvalidos } }
    }
  }

  // 3. Anticipación mínima por producto (catálogo real: la mayoría no tiene
  // anticipación documentada — null se trata como "sin mínimo conocido").
  const hoyLima = fechaLimaISO()
  const violaciones = items
    .map((item) => {
      const producto = porBusqueda.get(item)!
      const anticipacionHorasMinima = producto.anticipacion_horas ?? 0
      // `cumpleAnticipacionMinima` mide desde ahora hasta las 00:00 del día de
      // entrega, así que un pedido "para hoy" siempre daba negativo — incluso
      // sin ningún mínimo, y el cliente que pide "para recoger hoy" se
      // rechazaba siempre. Sin mínimo documentado (null/0) no hay anticipación
      // que medir: vale hoy (hora de Lima) y cualquier día futuro, nunca el
      // pasado. Con un mínimo real (>0) la regla de dominio sigue igual.
      const cumple =
        anticipacionHorasMinima === 0
          ? /^\d{4}-\d{2}-\d{2}$/.test(fechaEntregaISO) && fechaEntregaISO >= hoyLima
          : cumpleAnticipacionMinima({ fechaEntregaISO, anticipacionHorasMinima })
      return cumple ? null : { productoId: producto.slug, horasMinimas: anticipacionHorasMinima }
    })
    .filter(Boolean)
  if (violaciones.length > 0) {
    return { ok: false, error: 'ANTICIPACION_INSUFICIENTE', detalle: violaciones }
  }

  // 4. Capacidad de producción por categoría y fecha
  const solicitadoPorCategoria = new Map<string, number>()
  for (const item of items) {
    const producto = porBusqueda.get(item)!
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
    const producto = porBusqueda.get(item)!
    const etiquetaTamano = tamanoReal.get(item) ?? null
    const tamanoSeleccionado = etiquetaTamano
      ? producto.tamanos.find((t) => t.tamano === etiquetaTamano)
      : undefined
    const precioUnitario = calcularPrecioLinea({
      precioBase: Number(producto.precio_base),
      tamano: etiquetaTamano,
      precioTamano: tamanoSeleccionado ? Number(tamanoSeleccionado.precio) : null,
      preciosExtras: (item.extras ?? []).map((e) => catalogoExtras.get(e)!.precio),
    })
    return {
      productId: producto.id,
      cateringItemId: null,
      comboId: null,
      nombreProducto: producto.nombre,
      tamano: etiquetaTamano,
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

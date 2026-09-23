import type pg from 'pg'
import type { EstadoPedido, TipoEntrega } from '@bakebrothers/domain'
import { findOrCreateCustomer, siguienteNumeroDePedido, insertarPedido, type OrderItemInsert } from '../repositories/ordersRepo.js'
import { validarYValorizarItemsTienda } from './pedidosTienda.js'
import { validarItemsCatering } from './pedidosCatering.js'

/**
 * Tool del bot que de verdad registra un pedido — reusa la validación y el
 * cálculo de precio real de POST /api/orders (vía pedidosTienda.ts), nunca
 * confía en lo que el modelo cree que cuesta algo. Solo se llama para casos
 * verdes: los items de catering se re-verifican acá adentro (server-side),
 * si cualquiera no da verde se rechaza el pedido COMPLETO, no se crea nada
 * parcial — el flujo correcto ahí sigue siendo escalar, no forzar.
 *
 * `canal` sale de la conversación real (bound por el caller, ver
 * bot/cerebro.ts), nunca es algo que decida el modelo. `sedeId` es un
 * parámetro por ahora — no hay mapeo real de número de WhatsApp → sede
 * todavía (se conecta cuando existan los números reales).
 */

export interface ItemPedidoProducto {
  tipo: 'producto'
  busqueda: string
  tamano?: string | null
  cantidad: number
}

export interface ItemPedidoCatering {
  tipo: 'catering'
  busqueda: string
  cantidad: number
}

export type ItemPedidoInput = ItemPedidoProducto | ItemPedidoCatering

export interface CrearPedidoInput {
  cliente: {
    nombre: string
    // Obligatorio siempre, incluso en WhatsApp con el número del remitente ya
    // conocido — quien escribe no es necesariamente quien recibe el pedido.
    // Es la clave de identidad del cliente (findOrCreateCustomer), no el
    // external_id de la conversación — así el mismo número queda reconocido
    // entre canales.
    telefono: string
  }
  sedeId?: string
  tipoEntrega: TipoEntrega
  direccion?: string | null
  distrito?: string | null
  referencia?: string | null
  fechaEntregaISO: string
  horario: string
  items: ItemPedidoInput[]
  metodoPago: 'yape' | 'plin' | 'transferencia' | 'tarjeta' | 'contraentrega'
  // El cliente dijo que va a pagar por adelantado (no que ya pagó, y nunca
  // se procesa ni verifica ningún comprobante acá — eso sigue siendo
  // manual, vía el dashboard) → el pedido nace en payment_pending en vez de
  // confirmed.
  pagoPorAdelantado: boolean
  nota?: string | null
}

export type ResultadoCrearPedido =
  | { ok: true; numero: string; estado: EstadoPedido; subtotal: number; total: number }
  | { ok: false; error: string; detalle?: unknown }

export async function crearPedido(
  client: pg.PoolClient,
  tenantId: string,
  canal: 'whatsapp' | 'facebook' | 'instagram' | 'web',
  input: CrearPedidoInput
): Promise<ResultadoCrearPedido> {
  if (input.items.length === 0) {
    return { ok: false, error: 'SIN_ITEMS' }
  }

  const itemsProducto = input.items.filter((i): i is ItemPedidoProducto => i.tipo === 'producto')
  const itemsCatering = input.items.filter((i): i is ItemPedidoCatering => i.tipo === 'catering')

  const itemsParaInsertar: OrderItemInsert[] = []
  let subtotal = 0

  if (itemsProducto.length > 0) {
    const resultado = await validarYValorizarItemsTienda(
      client,
      tenantId,
      itemsProducto.map((i) => ({
        productoId: i.busqueda,
        tamano: i.tamano ?? null,
        extras: [],
        cantidad: i.cantidad,
      })),
      input.fechaEntregaISO
    )
    if (!resultado.ok) return resultado
    itemsParaInsertar.push(...resultado.items)
    subtotal += resultado.subtotal
  }

  if (itemsCatering.length > 0) {
    // Re-verificación server-side: nunca confía en que el modelo solo haya
    // llamado a esta función después de ver verde.
    const resultado = await validarItemsCatering(
      client,
      itemsCatering.map((i) => ({ busquedaItem: i.busqueda, cantidad: i.cantidad })),
      input.fechaEntregaISO
    )
    if (!resultado.ok) return resultado
    itemsParaInsertar.push(...resultado.items)
    // Los items de catering suman 0 al subtotal — no hay precio de
    // catálogo (ver pedidosCatering.ts), lo cotiza el operador después.
  }

  if (input.tipoEntrega === 'delivery' && (!input.direccion || !input.distrito)) {
    return { ok: false, error: 'DIRECCION_REQUERIDA' }
  }

  const { rows: tenantRows } = await client.query<{ codigo_prefijo: string }>(
    `select codigo_prefijo from tenants where id = $1`,
    [tenantId]
  )
  const codigoPrefijo = tenantRows[0]?.codigo_prefijo
  if (!codigoPrefijo) return { ok: false, error: 'TENANT_NO_ENCONTRADO' }

  const estado: EstadoPedido = input.pagoPorAdelantado ? 'payment_pending' : 'confirmed'
  // delivery/total: mismo criterio que POST /api/orders — delivery en 0, lo
  // completa el operador desde el dashboard.
  const total = subtotal

  const customerId = await findOrCreateCustomer(client, tenantId, {
    nombre: input.cliente.nombre,
    telefono: input.cliente.telefono,
  })
  const numero = await siguienteNumeroDePedido(client, tenantId, codigoPrefijo)

  await insertarPedido(
    client,
    tenantId,
    {
      numero,
      customerId,
      canal,
      estado,
      tipoEntrega: input.tipoEntrega,
      sedeId: input.sedeId ?? null,
      direccion: input.direccion ?? null,
      distrito: input.tipoEntrega === 'delivery' ? (input.distrito ?? null) : null,
      referencia: input.referencia ?? null,
      fechaEntrega: input.fechaEntregaISO,
      horario: input.horario,
      nota: input.nota ?? null,
      metodoPago: input.metodoPago,
      cuponCodigo: null,
      subtotal,
      descuentoCupon: 0,
      delivery: 0,
      total,
    },
    itemsParaInsertar
  )

  return { ok: true, numero, estado, subtotal, total }
}

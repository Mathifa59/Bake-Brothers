import type pg from 'pg'
import type { EstadoPedido, TipoEntrega } from '@bakebrothers/domain'
import {
  findOrCreateCustomer,
  siguienteNumeroDePedido,
  insertarPedido,
  type ClienteInput,
  type OrderItemInsert,
} from '../repositories/ordersRepo.js'
import { validarYValorizarItemsTienda, type ItemTiendaInput } from './pedidosTienda.js'
import { validarItemsCatering, type ItemCateringInput } from './pedidosCatering.js'
import { validarItemsCombo, type ItemComboInput } from './pedidosCombos.js'

/**
 * Versión del puente apps/admin → apps/api: un operador arma un pedido a
 * mano (POST /api/dashboard/orders, ver auth/verificarJwtOperador.ts).
 * Reusa exactamente la misma validación/precio que crearPedido.ts (el tool
 * del bot) — mismo criterio de "no dupliques esa lógica" — más una tercera
 * vía nueva, combos, que el bot todavía no expone.
 *
 * Reusar `validarItemsCatering` tal cual significa que el gate "solo verde"
 * también aplica acá, sin excepción para el operador: la regla del
 * semáforo (verde=agendar, amarillo/rojo=consultar/escalar antes de
 * prometer) es una regla de negocio real sobre capacidad y logística, no
 * algo específico de "cuidar al bot" — no se construyó ningún mecanismo de
 * override para esta pantalla. Si en algún momento se necesita que un
 * operador registre una excepción ya aprobada fuera del semáforo estándar,
 * es una decisión aparte, no algo que se decidió acá.
 */

export interface ItemPedidoProducto extends ItemTiendaInput {
  tipo: 'producto'
}
export interface ItemPedidoCatering {
  tipo: 'catering'
  busquedaItem: string
  cantidad: number
}
export interface ItemPedidoCombo extends ItemComboInput {
  tipo: 'combo'
}
export type ItemPedidoDashboardInput = ItemPedidoProducto | ItemPedidoCatering | ItemPedidoCombo

export interface CrearPedidoDashboardInput {
  cliente: ClienteInput
  tipoEntrega: TipoEntrega
  direccion?: string | null
  distrito?: string | null
  referencia?: string | null
  fechaEntregaISO: string
  horario: string
  items: ItemPedidoDashboardInput[]
  metodoPago: 'yape' | 'plin' | 'transferencia' | 'tarjeta' | 'contraentrega'
  // Toggle real de la pantalla: "Sí" → nace en 'paid' (INSERT, no
  // transición — el trigger de la máquina de estados solo corre en
  // UPDATE). "No" → nace en 'confirmed', igual que todo pedido de tienda
  // hoy (ver orderStatus.ts: "confirmed → in_production existe para el
  // pago contra entrega"). payment_pending queda afuera de este toggle a
  // propósito — ese estado es específico del "adelanto prometido" del bot.
  yaPago: boolean
  nota?: string | null
  // Resuelto y autorizado por el caller (la ruta), nunca por el cliente:
  // forzado a la sede del operador si es 'operador', validado si es admin.
  sedeId: string | null
}

export type ResultadoCrearPedidoDashboard =
  | { ok: true; numero: string; estado: EstadoPedido; subtotal: number; total: number }
  | { ok: false; error: string; detalle?: unknown }

function esProducto(i: ItemPedidoDashboardInput): i is ItemPedidoProducto {
  return i.tipo === 'producto'
}
function esCatering(i: ItemPedidoDashboardInput): i is ItemPedidoCatering {
  return i.tipo === 'catering'
}
function esCombo(i: ItemPedidoDashboardInput): i is ItemPedidoCombo {
  return i.tipo === 'combo'
}

export async function crearPedidoDashboard(
  client: pg.PoolClient,
  tenantId: string,
  input: CrearPedidoDashboardInput
): Promise<ResultadoCrearPedidoDashboard> {
  if (input.items.length === 0) {
    return { ok: false, error: 'SIN_ITEMS' }
  }

  const itemsProducto = input.items.filter(esProducto)
  const itemsCatering: ItemCateringInput[] = input.items.filter(esCatering)
  const itemsCombo = input.items.filter(esCombo)

  const itemsParaInsertar: OrderItemInsert[] = []
  let subtotal = 0

  if (itemsProducto.length > 0) {
    const resultado = await validarYValorizarItemsTienda(client, tenantId, itemsProducto, input.fechaEntregaISO)
    if (!resultado.ok) return resultado
    itemsParaInsertar.push(...resultado.items)
    subtotal += resultado.subtotal
  }

  if (itemsCatering.length > 0) {
    const resultado = await validarItemsCatering(client, itemsCatering, input.fechaEntregaISO)
    if (!resultado.ok) return resultado
    itemsParaInsertar.push(...resultado.items)
    // Catering suma 0 al subtotal — sin precio de catálogo, lo cotiza el
    // operador (mismo criterio que crearPedido.ts del bot).
  }

  if (itemsCombo.length > 0) {
    const resultado = await validarItemsCombo(client, tenantId, itemsCombo, 'presencial')
    if (!resultado.ok) return resultado
    itemsParaInsertar.push(...resultado.items)
    subtotal += resultado.subtotal
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

  const estado: EstadoPedido = input.yaPago ? 'paid' : 'confirmed'
  const total = subtotal

  const customerId = await findOrCreateCustomer(client, tenantId, input.cliente)
  const numero = await siguienteNumeroDePedido(client, tenantId, codigoPrefijo)

  await insertarPedido(
    client,
    tenantId,
    {
      numero,
      customerId,
      canal: 'presencial',
      estado,
      tipoEntrega: input.tipoEntrega,
      sedeId: input.sedeId,
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
      // Un operador ya confirma todo a mano al vender — este flag es
      // exclusivo del bot (ver 0028/pedidosCombos.ts).
      requiereConfirmarCombo: false,
    },
    itemsParaInsertar
  )

  return { ok: true, numero, estado, subtotal, total }
}

import type pg from 'pg'
import {
  resolverSedeDelPedido,
  distritoTieneCobertura,
  parsearDistritosDelivery,
  type EstadoPedido,
  type TipoEntrega,
} from '@bakebrothers/domain'
import { env } from '../env.js'
import { findOrCreateCustomer, siguienteNumeroDePedido, insertarPedido, type OrderItemInsert } from '../repositories/ordersRepo.js'
import { validarYValorizarItemsTienda } from './pedidosTienda.js'
import { validarItemsCombo, type SeleccionComboInput } from './pedidosCombos.js'

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

export interface ItemPedidoCombo {
  tipo: 'combo'
  busqueda: string
  cantidad: number
  // Solo para combos que permiten sustituciones (ver pedidosCombos.ts) — la
  // composición real que eligió el cliente. crearPedido rechaza el pedido
  // si el combo la requiere y no vino.
  seleccion?: SeleccionComboInput[]
}

export type ItemPedidoInput = ItemPedidoProducto | ItemPedidoCatering | ItemPedidoCombo

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
  /** Sede de la conversación (número de un local). Con el número del bot no existe y se resuelve con `sedeElegida`. */
  sedeId?: string
  /** Lo que respondió el cliente a "¿en qué local recoges?" (o "delivery"). Solo se usa si la conversación no trae sede. */
  sedeElegida?: string | null
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
  /** Conversación del bot que crea el pedido (0036): enlaza la captura de pago que llegue después con este pedido. */
  conversacionId?: string | null
  nota?: string | null
  // Pedido de prueba (simulador del bot del dashboard, ver
  // services/simuladorBot.ts): el cliente y la nota quedan marcados con
  // MARCA_PRUEBA para que nadie del equipo lo confunda con un pedido real y
  // se pueda filtrar/borrar después. No cambia nada más del flujo — el pedido
  // pasa por la misma validación y el mismo precio real que uno de verdad.
  esPrueba?: boolean
  // Referencia de campaña de la conversación ("tt-halloween"): se guarda en
  // orders.campana para la atribución del dashboard.
  campana?: string | null
}

export const MARCA_PRUEBA = '[PRUEBA]'

export type ResultadoCrearPedido =
  | {
      ok: true
      numero: string
      estado: EstadoPedido
      subtotal: number
      total: number
      /**
       * Datos para pagar por adelantado (env DATOS_PAGO), solo en recojo en tienda y solo si están
       * configurados. null = el cliente todavía no tiene cómo pagar: una persona se los envía.
       */
      datosPago: string | null
      /**
       * Si viene, el pedido quedó registrado pero lo debe seguir una persona (delivery por cotizar y
       * coordinar, o datos de pago por enviar). El bot deriva la conversación con este motivo.
       */
      atencionHumana?: string
    }
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

  // Reglas de lanzamiento (decididas con el negocio, 2026-10-29) — el servidor las hace cumplir, no depende
  // de que el modelo las recuerde:
  //  1. El catering SIEMPRE lo cotiza y confirma una persona: el bot nunca crea un pedido de catering, ni
  //     siquiera con el semáforo en verde (sigue consultándolo para dejarle el contexto a esa persona).
  //  2. Pago: el delivery se paga SIEMPRE por adelantado (contraentrega no existe ahí); en recojo en tienda
  //     el cliente elige pagar antes o al recoger ("Canceló en tienda", metodo_pago = 'contraentrega').
  //  3. Delivery solo a los distritos con cobertura (DISTRITOS_DELIVERY).
  if (input.items.some((i) => i.tipo === 'catering')) {
    return { ok: false, error: 'CATERING_REQUIERE_PERSONA' }
  }
  if (input.tipoEntrega === 'delivery' && input.metodoPago === 'contraentrega') {
    return { ok: false, error: 'PAGO_ADELANTADO_REQUERIDO', detalle: { mensaje: 'El delivery se paga por adelantado.' } }
  }
  if (input.tipoEntrega === 'delivery') {
    if (!input.direccion || !input.distrito) return { ok: false, error: 'DIRECCION_REQUERIDA' }
    const distritosConCobertura = parsearDistritosDelivery(env.DISTRITOS_DELIVERY)
    if (!distritoTieneCobertura(input.distrito, distritosConCobertura)) {
      return { ok: false, error: 'DISTRITO_SIN_COBERTURA', detalle: { distrito: input.distrito, distritosConCobertura } }
    }
  }

  const itemsProducto = input.items.filter((i): i is ItemPedidoProducto => i.tipo === 'producto')
  const itemsCombo = input.items.filter((i): i is ItemPedidoCombo => i.tipo === 'combo')

  const itemsParaInsertar: OrderItemInsert[] = []
  let subtotal = 0
  let requiereConfirmarCombo = false

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

  if (itemsCombo.length > 0) {
    // Re-verificación server-side, mismo criterio que catering arriba:
    // nunca confía en que el modelo haya clasificado bien el combo por su
    // cuenta. canal viene de la conversación real, nunca del modelo — es
    // lo que decide si el combo está disponible acá y si aplican las
    // reglas de Grupo 2/3 (ver pedidosCombos.ts).
    const resultado = await validarItemsCombo(
      client,
      tenantId,
      itemsCombo.map((i) => ({ comboId: i.busqueda, cantidad: i.cantidad, seleccion: i.seleccion })),
      canal
    )
    if (!resultado.ok) return resultado
    itemsParaInsertar.push(...resultado.items)
    subtotal += resultado.subtotal
    requiereConfirmarCombo = requiereConfirmarCombo || resultado.requiereConfirmarCombo
  }

  // Sede del pedido. Con el número de un local sale de la conversación; con el número del bot (sin sede) la
  // EXIGE el servidor — no depende de que el modelo se acuerde de preguntar. Se resuelve ANTES de tocar nada
  // (cliente, número de pedido): un rechazo no deja rastro.
  const { rows: sedes } = await client.query<{ id: string; nombre: string }>(
    `select id, nombre from sedes where activo order by nombre`
  )
  const sede = resolverSedeDelPedido({
    tipoEntrega: input.tipoEntrega,
    sedeDeLaConversacion: input.sedeId ?? null,
    sedeElegida: input.sedeElegida ?? null,
    sedes,
  })
  if (!sede.ok) {
    return { ok: false, error: sede.error, detalle: { sedesDisponibles: sede.sedesDisponibles } }
  }

  const { rows: tenantRows } = await client.query<{ codigo_prefijo: string }>(
    `select codigo_prefijo from tenants where id = $1`,
    [tenantId]
  )
  const codigoPrefijo = tenantRows[0]?.codigo_prefijo
  if (!codigoPrefijo) return { ok: false, error: 'TENANT_NO_ENCONTRADO' }

  // Delivery: adelantado, siempre. Recojo: lo que elija el cliente — pagar antes (nace pendiente de pago y pasa
  // a pagado cuando una persona verifica el comprobante en el panel) o pagar al recoger (nace confirmado y se
  // registra como "Canceló en tienda"). El bot NUNCA pasa un pedido a pagado: eso lo hace una persona.
  const esDelivery = input.tipoEntrega === 'delivery'
  const pagaAlRecoger = !esDelivery && !input.pagoPorAdelantado
  const estado: EstadoPedido = pagaAlRecoger ? 'confirmed' : 'payment_pending'
  const metodoPagoFinal = pagaAlRecoger ? 'contraentrega' : input.metodoPago === 'contraentrega' ? 'yape' : input.metodoPago
  // delivery/total: mismo criterio que POST /api/orders — delivery en 0, lo
  // completa el operador desde el dashboard.
  const total = subtotal

  const esPrueba = input.esPrueba === true
  const customerId = await findOrCreateCustomer(client, tenantId, {
    nombre: esPrueba ? `${MARCA_PRUEBA} ${input.cliente.nombre}` : input.cliente.nombre,
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
      sedeId: sede.sedeId,
      direccion: input.direccion ?? null,
      distrito: input.tipoEntrega === 'delivery' ? (input.distrito ?? null) : null,
      referencia: input.referencia ?? null,
      fechaEntrega: input.fechaEntregaISO,
      horario: input.horario,
      nota: esPrueba ? `${MARCA_PRUEBA} ${input.nota ?? 'Pedido del simulador del bot'}` : (input.nota ?? null),
      metodoPago: metodoPagoFinal,
      cuponCodigo: null,
      subtotal,
      descuentoCupon: 0,
      delivery: 0,
      total,
      requiereConfirmarCombo,
      campana: input.campana ?? null,
      conversacionId: input.conversacionId ?? null,
    },
    itemsParaInsertar
  )

  // Qué debe hacer una persona después de este pedido. En delivery el costo de envío lo cotiza ella, así que
  // tampoco se le dan datos de pago al cliente hasta tener el total final.
  const datosPago = esDelivery || pagaAlRecoger ? null : (env.DATOS_PAGO ?? null)
  const pendientes: string[] = []
  if (esDelivery) pendientes.push('cotizar el delivery y coordinar la entrega')
  // Los datos de pago solo hacen falta si paga por adelantado (y en delivery, cuando ya esté el total final).
  if (!datosPago && !pagaAlRecoger) pendientes.push('enviar los datos de pago al cliente')

  return {
    ok: true,
    numero,
    estado,
    subtotal,
    total,
    datosPago,
    atencionHumana: pendientes.length > 0 ? `Pedido ${numero}: ${pendientes.join(' y ')}.` : undefined,
  }
}

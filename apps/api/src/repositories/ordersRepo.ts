import type pg from 'pg'
import {
  estadoLegible,
  normalizarTelefono,
  normalizarTelefonoWhatsApp,
  telefonoLegible,
  type EstadoPedido,
  type TipoEntrega,
} from '@bakebrothers/domain'

export interface ClienteInput {
  nombre: string
  telefono: string
  correo?: string | null
  dni?: string | null
}

/** El teléfono no se pudo llevar a E.164 (ver normalizarTelefono): quien llama debe pedirlo de nuevo, nunca adivinarlo. */
export class TelefonoInvalidoError extends Error {
  readonly code = 'TELEFONO_INVALIDO'
  constructor(telefono: string) {
    super(`Teléfono no válido: «${telefono}»`)
  }
}

/**
 * Busca el cliente por teléfono dentro del tenant, o lo crea. El teléfono se guarda y se busca SIEMPRE en E.164
 * (+51912944096): «912944096», «51 912 944 096» y «+51912944096» son el mismo cliente (índice único en 0045).
 * Si el cliente se había creado solo al escribir por WhatsApp (nombre_confirmado = false, con el nombre del perfil o su
 * número) y este pedido trae su nombre real, se actualiza.
 */
export async function findOrCreateCustomer(
  client: pg.PoolClient,
  tenantId: string,
  cliente: ClienteInput
): Promise<string> {
  const telefono = normalizarTelefono(cliente.telefono)
  if (!telefono) throw new TelefonoInvalidoError(cliente.telefono)
  const nombre = cliente.nombre.trim()

  const buscar = () =>
    client.query<{ id: string; nombre_confirmado: boolean }>(
      `select id, nombre_confirmado from customers where tenant_id = $1 and telefono = $2`,
      [tenantId, telefono]
    )
  let existente = (await buscar()).rows[0]
  if (!existente) {
    const creado = await client.query<{ id: string }>(
      `insert into customers (tenant_id, nombre, telefono, correo, dni)
       values ($1, $2, $3, $4, $5)
       on conflict (tenant_id, telefono) where telefono is not null do nothing
       returning id`,
      [tenantId, nombre, telefono, cliente.correo ?? null, cliente.dni ?? null]
    )
    if (creado.rows[0]) return creado.rows[0].id
    existente = (await buscar()).rows[0] // otro pedido lo creó en el mismo instante
  }
  if (!existente.nombre_confirmado && nombre) {
    await client.query(`update customers set nombre = $2, nombre_confirmado = true where id = $1`, [existente.id, nombre])
  }
  return existente.id
}

/**
 * Cliente de quien escribe por WhatsApp: lo busca por su teléfono (E.164) y, si no existe, lo crea con el nombre del
 * perfil de WhatsApp (o su número si no lo trae), marcado como no confirmado hasta que un pedido le dé su nombre real.
 * Devuelve null si el número no es reconocible (la conversación sigue sin cliente; nunca falla el mensaje por esto).
 */
export async function encontrarOCrearClienteDeWhatsApp(
  client: pg.PoolClient,
  tenantId: string,
  waId: string,
  nombrePerfil: string | null
): Promise<string | null> {
  const telefono = normalizarTelefonoWhatsApp(waId)
  if (!telefono) return null
  const buscar = () =>
    client.query<{ id: string }>(`select id from customers where tenant_id = $1 and telefono = $2`, [tenantId, telefono])
  const existente = (await buscar()).rows[0]
  if (existente) return existente.id
  const nombre = nombrePerfil?.trim() || telefonoLegible(telefono)
  const creado = await client.query<{ id: string }>(
    `insert into customers (tenant_id, nombre, telefono, nombre_confirmado)
     values ($1, $2, $3, false)
     on conflict (tenant_id, telefono) where telefono is not null do nothing
     returning id`,
    [tenantId, nombre, telefono]
  )
  return creado.rows[0]?.id ?? (await buscar()).rows[0]?.id ?? null
}

/** Incrementa la secuencia del tenant de forma atómica y devuelve 'BB-2450'. */
export async function siguienteNumeroDePedido(
  client: pg.PoolClient,
  tenantId: string,
  prefijo: string
): Promise<string> {
  const { rows } = await client.query(
    `update order_sequences set ultimo_numero = ultimo_numero + 1
     where tenant_id = $1 returning ultimo_numero`,
    [tenantId]
  )
  if (!rows[0]) throw new Error('El tenant no tiene secuencia de pedidos configurada')
  return `${prefijo}-${rows[0].ultimo_numero}`
}

export interface OrderInsert {
  numero: string
  customerId: string
  canal: 'web' | 'whatsapp' | 'facebook' | 'instagram' | 'presencial'
  estado: EstadoPedido
  tipoEntrega: TipoEntrega
  // null si no se pudo resolver la sede (ej. pedidos de web todavía, o
  // crearPedido antes de que exista el mapeo real de número de WhatsApp →
  // sede) — un admin igual la ve en el dashboard, un operador no (RLS por
  // sede, 0011), mismo criterio ya usado en conversaciones.sede_id (0009).
  sedeId: string | null
  direccion: string | null
  distrito: string | null
  referencia: string | null
  fechaEntrega: string
  horario: string
  nota: string | null
  metodoPago: string
  cuponCodigo: string | null
  subtotal: number
  descuentoCupon: number
  delivery: number
  total: number
  // Grupo 2 de combos (composición fija, pero permite sustituciones) — ver
  // services/pedidosCombos.ts y 0028. Siempre false salvo que crearPedido
  // (el tool del bot) lo ponga en true; apps/admin nunca lo setea.
  requiereConfirmarCombo: boolean
  // Conversación del bot que creó el pedido (0036): una captura de pago que llega por esa conversación se
  // asocia a su pedido pendiente de pago. null para pedidos que no vienen de una conversación.
  conversacionId?: string | null
  // Referencia de campaña con la que llegó el cliente ("tt-halloween", ver
  // packages/domain campana.ts). null si no vino de ninguna.
  campana?: string | null
}

export interface OrderItemInsert {
  // Exactamente uno de los tres (ver 0019_order_items_catering.sql y
  // 0020_pedidos_dashboard.sql) — un item de tienda tiene cateringItemId y
  // comboId null; uno de catering, productId y comboId null; uno de combo,
  // productId y cateringItemId null. precioUnitario de catering siempre es
  // 0 (no hay precio de catálogo — ver services/crearPedido.ts); el de
  // combo es combos.precio_promo tal cual (ver services/pedidosCombos.ts).
  productId: string | null
  cateringItemId: string | null
  comboId: string | null
  nombreProducto: string
  tamano: string | null
  extras: string[]
  precioUnitario: number
  cantidad: number
}

export async function insertarPedido(
  client: pg.PoolClient,
  tenantId: string,
  pedido: OrderInsert,
  items: OrderItemInsert[]
): Promise<string> {
  const { rows } = await client.query(
    `insert into orders (tenant_id, numero, customer_id, canal, estado, tipo_entrega, sede_id,
                         direccion, distrito, referencia, fecha_entrega, horario_entrega,
                         nota, metodo_pago, cupon_codigo, subtotal, descuento_cupon, delivery, total,
                         requiere_confirmar_combo, campana, conversacion_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
     returning id`,
    [
      tenantId, pedido.numero, pedido.customerId, pedido.canal, pedido.estado,
      pedido.tipoEntrega, pedido.sedeId, pedido.direccion, pedido.distrito, pedido.referencia,
      pedido.fechaEntrega, pedido.horario, pedido.nota, pedido.metodoPago,
      pedido.cuponCodigo, pedido.subtotal, pedido.descuentoCupon, pedido.delivery, pedido.total,
      pedido.requiereConfirmarCombo,
      pedido.campana ?? null,
      pedido.conversacionId ?? null,
    ]
  )
  const orderId = rows[0].id
  for (const item of items) {
    await client.query(
      `insert into order_items (tenant_id, order_id, product_id, catering_item_id, combo_id, nombre_producto, tamano, extras, precio_unitario, cantidad)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        tenantId, orderId, item.productId, item.cateringItemId, item.comboId, item.nombreProducto,
        item.tamano, item.extras, item.precioUnitario, item.cantidad,
      ]
    )
  }
  return orderId
}

const SELECT_PEDIDOS = `
  select o.numero, o.estado, o.canal, o.tipo_entrega, o.distrito, o.direccion,
         o.fecha_entrega::text as fecha_entrega, o.horario_entrega, o.nota,
         o.metodo_pago, o.cupon_codigo, o.subtotal, o.descuento_cupon, o.delivery,
         o.total, o.creado_en, se.nombre as sede_nombre,
         c.nombre as cliente_nombre, c.telefono as cliente_telefono,
         json_agg(json_build_object(
           'nombre', oi.nombre_producto,
           'cantidad', oi.cantidad,
           'precio', oi.precio_unitario,
           'tamano', oi.tamano,
           'extras', oi.extras,
           'emoji', p.emoji
         ) order by oi.id) as items
  from orders o
  join customers c on c.id = o.customer_id
  join order_items oi on oi.order_id = o.id
  left join products p on p.id = oi.product_id
  left join sedes se on se.id = o.sede_id
  where o.tenant_id = $1
`

const aPedidoDTO = (r: Record<string, any>) => ({
  numero: r.numero,
  estado: r.estado,
  estadoLegible: estadoLegible(r.estado, r.tipo_entrega),
  canal: r.canal,
  tipoEntrega: r.tipo_entrega,
  distrito: r.distrito,
  direccion: r.direccion,
  fechaEntrega: r.fecha_entrega,
  horario: r.horario_entrega,
  nota: r.nota,
  metodoPago: r.metodo_pago,
  cuponCodigo: r.cupon_codigo,
  subtotal: Number(r.subtotal),
  descuentoCupon: Number(r.descuento_cupon),
  delivery: Number(r.delivery),
  total: Number(r.total),
  creadoEn: r.creado_en,
  sedeNombre: r.sede_nombre as string | null,
  cliente: { nombre: r.cliente_nombre, telefono: r.cliente_telefono },
  items: (r.items as any[]).map((i) => ({ ...i, precio: Number(i.precio) })),
})

export async function listarPedidos(
  client: pg.PoolClient,
  tenantId: string,
  filtros: { telefono?: string; correo?: string; limite?: number } = {}
) {
  const condiciones: string[] = []
  const params: unknown[] = [tenantId]
  if (filtros.telefono) {
    // Se guarda en E.164: el filtro se normaliza igual (si no es un teléfono válido, no puede coincidir con nadie).
    params.push(normalizarTelefono(filtros.telefono) ?? filtros.telefono)
    condiciones.push(`and c.telefono = $${params.length}`)
  }
  if (filtros.correo) {
    params.push(filtros.correo)
    condiciones.push(`and c.correo = $${params.length}`)
  }
  const limite = Math.min(filtros.limite ?? 20, 100)
  const { rows } = await client.query(
    `${SELECT_PEDIDOS} ${condiciones.join(' ')}
     group by o.id, c.id, se.nombre order by o.creado_en desc limit ${limite}`,
    params
  )
  return rows.map(aPedidoDTO)
}

export async function pedidoPorNumero(client: pg.PoolClient, tenantId: string, numero: string) {
  const { rows } = await client.query(
    `${SELECT_PEDIDOS} and o.numero = $2 group by o.id, c.id, se.nombre`,
    [tenantId, numero]
  )
  return rows[0] ? aPedidoDTO(rows[0]) : null
}

export async function estadoActual(
  client: pg.PoolClient,
  tenantId: string,
  numero: string
): Promise<EstadoPedido | null> {
  const { rows } = await client.query(
    `select estado from orders where tenant_id = $1 and numero = $2`,
    [tenantId, numero]
  )
  return rows[0]?.estado ?? null
}

export async function actualizarEstado(
  client: pg.PoolClient,
  tenantId: string,
  numero: string,
  estado: EstadoPedido
): Promise<void> {
  await client.query(
    `update orders set estado = $3, actualizado_en = now() where tenant_id = $1 and numero = $2`,
    [tenantId, numero, estado]
  )
}

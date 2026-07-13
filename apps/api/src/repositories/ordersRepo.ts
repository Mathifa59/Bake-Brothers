import type pg from 'pg'
import { estadoLegible, type EstadoPedido, type TipoEntrega } from '@bakebrothers/domain'

export interface ClienteInput {
  nombre: string
  telefono: string
  correo?: string | null
  dni?: string | null
}

/** Busca el cliente por teléfono dentro del tenant, o lo crea. */
export async function findOrCreateCustomer(
  client: pg.PoolClient,
  tenantId: string,
  cliente: ClienteInput
): Promise<string> {
  const existente = await client.query(
    `select id from customers where tenant_id = $1 and telefono = $2 limit 1`,
    [tenantId, cliente.telefono]
  )
  if (existente.rows[0]) return existente.rows[0].id
  const creado = await client.query(
    `insert into customers (tenant_id, nombre, telefono, correo, dni)
     values ($1, $2, $3, $4, $5) returning id`,
    [tenantId, cliente.nombre, cliente.telefono, cliente.correo ?? null, cliente.dni ?? null]
  )
  return creado.rows[0].id
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
  canal: 'web' | 'whatsapp'
  estado: EstadoPedido
  tipoEntrega: TipoEntrega
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
}

export interface OrderItemInsert {
  productId: string
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
    `insert into orders (tenant_id, numero, customer_id, canal, estado, tipo_entrega,
                         direccion, distrito, referencia, fecha_entrega, horario_entrega,
                         nota, metodo_pago, cupon_codigo, subtotal, descuento_cupon, delivery, total)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     returning id`,
    [
      tenantId, pedido.numero, pedido.customerId, pedido.canal, pedido.estado,
      pedido.tipoEntrega, pedido.direccion, pedido.distrito, pedido.referencia,
      pedido.fechaEntrega, pedido.horario, pedido.nota, pedido.metodoPago,
      pedido.cuponCodigo, pedido.subtotal, pedido.descuentoCupon, pedido.delivery, pedido.total,
    ]
  )
  const orderId = rows[0].id
  for (const item of items) {
    await client.query(
      `insert into order_items (tenant_id, order_id, product_id, nombre_producto, tamano, extras, precio_unitario, cantidad)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [tenantId, orderId, item.productId, item.nombreProducto, item.tamano, item.extras, item.precioUnitario, item.cantidad]
    )
  }
  return orderId
}

const SELECT_PEDIDOS = `
  select o.numero, o.estado, o.canal, o.tipo_entrega, o.distrito, o.direccion,
         o.fecha_entrega::text as fecha_entrega, o.horario_entrega, o.nota,
         o.metodo_pago, o.cupon_codigo, o.subtotal, o.descuento_cupon, o.delivery,
         o.total, o.creado_en,
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
    params.push(filtros.telefono)
    condiciones.push(`and c.telefono = $${params.length}`)
  }
  if (filtros.correo) {
    params.push(filtros.correo)
    condiciones.push(`and c.correo = $${params.length}`)
  }
  const limite = Math.min(filtros.limite ?? 20, 100)
  const { rows } = await client.query(
    `${SELECT_PEDIDOS} ${condiciones.join(' ')}
     group by o.id, c.id order by o.creado_en desc limit ${limite}`,
    params
  )
  return rows.map(aPedidoDTO)
}

export async function pedidoPorNumero(client: pg.PoolClient, tenantId: string, numero: string) {
  const { rows } = await client.query(
    `${SELECT_PEDIDOS} and o.numero = $2 group by o.id, c.id`,
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

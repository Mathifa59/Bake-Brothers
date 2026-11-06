import type pg from 'pg'
import {
  evaluarCorteOrden,
  horaCanonica,
  minutosDelDia,
  type ResultadoCorte,
} from '@bakebrothers/domain'
import {
  findOrCreateCustomer,
  insertarPedido,
  siguienteNumeroDePedido,
  type OrderItemInsert,
} from '../repositories/ordersRepo.js'

/**
 * Órdenes de equipo (reemplazan al grupo de WhatsApp + Excel de la noche): MAYORISTAS (cantidad por sabor, el total
 * se cotiza después) y RAPPI (la orden de la tablet: número, productos, total). Las dos entran como pedidos
 * normales (`confirmed`, mismo número `BB-…`, mismos estados) para que Pedidos, Producción y el plan del día las
 * vean sin un camino aparte. El corte de las 10:30 p. m. AVISA, no bloquea (`fuera_de_corte`).
 *
 * No se captura el pago aquí: el mayorista se factura/cobra aparte y Rappi liquida con el negocio. `metodo_pago`
 * es obligatorio en `orders`, así que se guarda 'transferencia' como valor neutro — no es un dato del cliente.
 */

const METODO_PAGO_NEUTRO = 'transferencia'
const CLIENTE_RAPPI = { nombre: 'Rappi', telefono: 'RAPPI' }

interface ProductoOrden {
  id: string
  nombre: string
  categoria: string | null
  tamanos: string[]
}

async function productosPorId(client: pg.PoolClient, tenantId: string, ids: string[]): Promise<Map<string, ProductoOrden>> {
  if (ids.length === 0) return new Map()
  const { rows } = await client.query(
    `select p.id, p.nombre, c.nombre as categoria,
            coalesce(jsonb_agg(ps.tamano) filter (where ps.id is not null), '[]') as tamanos
     from products p
     left join categories c on c.id = p.category_id
     left join product_sizes ps on ps.product_id = p.id
     where p.tenant_id = $1 and p.id = any($2::uuid[])
     group by p.id, c.nombre`,
    [tenantId, ids]
  )
  return new Map(rows.map((r) => [r.id, { id: r.id, nombre: r.nombre, categoria: r.categoria, tamanos: r.tamanos }]))
}

const esFechaISO = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`))

export type ResultadoOrdenEquipo =
  | { ok: true; numero: string; corte: ResultadoCorte; sedeId: string | null }
  | { ok: false; error: string; detalle?: unknown }

// ———————————————————————————————————————————————————————————— mayorista ————

export interface LineaEmpanadaMayorista {
  productoId: string
  /** «Grande» = la empanada sin tamaño (la de siempre). «Mediana» es el tamaño oculto de mayoristas. */
  tamano: 'Mediana' | 'Grande'
  cantidad: number
}
export interface LineaPostreMayorista {
  productoId: string
  /** Etiqueta exacta del tamaño del catálogo («Individual», «Caja x10»…), o null si el producto no tiene tamaños. */
  tamano?: string | null
  cantidad: number
}
export interface CrearOrdenMayoristaInput {
  /** Cliente existente (por su id) o uno nuevo (nombre; el teléfono es opcional para un mayorista). */
  cliente: { id?: string | null; nombre?: string | null; telefono?: string | null }
  sedeId: string | null
  fechaEntregaISO: string
  /** Hora de despacho («7:30», «7:30 am»…): se guarda en 24 h («07:30»). */
  hora: string
  empanadas: LineaEmpanadaMayorista[]
  postres: LineaPostreMayorista[]
  nota?: string | null
  /** Para probar el corte; por defecto, ahora. */
  ahora?: Date
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export async function crearOrdenMayorista(
  client: pg.PoolClient,
  tenantId: string,
  input: CrearOrdenMayoristaInput
): Promise<ResultadoOrdenEquipo> {
  if (input.empanadas.length === 0 && input.postres.length === 0) return { ok: false, error: 'SIN_ITEMS' }
  if (!esFechaISO(input.fechaEntregaISO)) return { ok: false, error: 'FECHA_INVALIDA' }
  const minutos = minutosDelDia(input.hora)
  if (minutos === null || minutos >= 24 * 60) return { ok: false, error: 'HORA_INVALIDA', detalle: { hora: input.hora } }
  const hora = horaCanonica(minutos)

  const productos = await productosPorId(client, tenantId, [
    ...new Set([...input.empanadas, ...input.postres].map((l) => l.productoId)),
  ])
  const faltan = [...new Set([...input.empanadas, ...input.postres].map((l) => l.productoId))].filter((id) => !productos.has(id))
  if (faltan.length > 0) return { ok: false, error: 'PRODUCTO_NO_ENCONTRADO', detalle: { productos: faltan } }

  const items: OrderItemInsert[] = []
  for (const l of input.empanadas) {
    const p = productos.get(l.productoId)!
    if (p.categoria !== 'Empanadas') return { ok: false, error: 'NO_ES_EMPANADA', detalle: { producto: p.nombre } }
    if (l.tamano === 'Mediana' && !p.tamanos.includes('Mediana')) {
      return { ok: false, error: 'TAMANO_NO_DISPONIBLE', detalle: { producto: p.nombre, tamano: 'Mediana' } }
    }
    items.push({
      productId: p.id,
      cateringItemId: null,
      comboId: null,
      nombreProducto: p.nombre,
      tamano: l.tamano === 'Mediana' ? 'Mediana' : null,
      extras: [],
      precioUnitario: 0,
      cantidad: l.cantidad,
    })
  }
  for (const l of input.postres) {
    const p = productos.get(l.productoId)!
    let tamano: string | null = null
    if (l.tamano) {
      const real = p.tamanos.find((t) => sinTildes(t) === sinTildes(l.tamano!))
      if (!real) return { ok: false, error: 'TAMANO_INVALIDO', detalle: { producto: p.nombre, tamano: l.tamano, tamanosDisponibles: p.tamanos } }
      tamano = real
    }
    items.push({
      productId: p.id,
      cateringItemId: null,
      comboId: null,
      nombreProducto: p.nombre,
      tamano,
      extras: [],
      precioUnitario: 0,
      cantidad: l.cantidad,
    })
  }

  // Cliente: uno que ya existe, o uno nuevo. Un mayorista no siempre tiene teléfono: se le genera una clave estable
  // a partir del nombre para que la misma casa no se duplique cada vez que se anota.
  let customerId: string
  const tamanoHabitual = input.empanadas.some((l) => l.tamano === 'Mediana') && !input.empanadas.some((l) => l.tamano === 'Grande')
    ? 'Mediana'
    : input.empanadas.some((l) => l.tamano === 'Grande') && !input.empanadas.some((l) => l.tamano === 'Mediana')
      ? 'Grande'
      : null
  if (input.cliente.id) {
    const { rows } = await client.query(`select id from customers where id = $1 and tenant_id = $2`, [input.cliente.id, tenantId])
    if (!rows[0]) return { ok: false, error: 'CLIENTE_NO_ENCONTRADO' }
    customerId = rows[0].id
  } else {
    const nombre = input.cliente.nombre?.trim()
    if (!nombre) return { ok: false, error: 'CLIENTE_REQUERIDO' }
    const telefono = input.cliente.telefono?.trim() || `MAY-${sinTildes(nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
    customerId = await findOrCreateCustomer(client, tenantId, { nombre, telefono })
  }
  // Se recuerda el tamaño y la hora de esta orden como los habituales del cliente (los de «repetir el anterior»).
  await client.query(
    `update customers
        set es_mayorista = true,
            tamano_habitual = coalesce($2, tamano_habitual),
            hora_habitual = $3
      where id = $1`,
    [customerId, tamanoHabitual, hora]
  )

  const { rows: tenantRows } = await client.query<{ codigo_prefijo: string }>(`select codigo_prefijo from tenants where id = $1`, [tenantId])
  if (!tenantRows[0]) return { ok: false, error: 'TENANT_NO_ENCONTRADO' }
  const numero = await siguienteNumeroDePedido(client, tenantId, tenantRows[0].codigo_prefijo)
  const corte = evaluarCorteOrden(input.ahora ?? new Date(), input.fechaEntregaISO)

  await insertarPedido(
    client,
    tenantId,
    {
      numero,
      customerId,
      canal: 'mayorista',
      estado: 'confirmed',
      tipoEntrega: 'delivery', // despacho en vehículo (hoja de empaque); la dirección es la del cliente, ya conocida
      sedeId: input.sedeId,
      direccion: null,
      distrito: null,
      referencia: null,
      fechaEntrega: input.fechaEntregaISO,
      horario: hora,
      nota: input.nota ?? null,
      metodoPago: METODO_PAGO_NEUTRO,
      cuponCodigo: null,
      subtotal: 0,
      descuentoCupon: 0,
      delivery: 0,
      total: 0,
      requiereConfirmarCombo: false,
      totalPendiente: true,
      fueraDeCorte: corte.fueraDeCorte,
    },
    items
  )
  return { ok: true, numero, corte, sedeId: input.sedeId }
}

/** Las líneas de la última orden de mayorista (no anulada) de un cliente — para «repetir el anterior». */
export interface UltimaOrdenMayorista {
  numero: string
  fechaEntrega: string
  hora: string | null
  empanadas: LineaEmpanadaMayorista[]
  postres: LineaPostreMayorista[]
}

export async function ultimaOrdenMayorista(client: pg.PoolClient, tenantId: string, clienteId: string): Promise<UltimaOrdenMayorista | null> {
  const { rows: ordenes } = await client.query(
    `select o.id, o.numero, o.fecha_entrega::text as fecha_entrega, o.horario_entrega
     from orders o
     where o.tenant_id = $1 and o.customer_id = $2 and o.canal = 'mayorista' and o.estado <> 'cancelled'
     order by o.fecha_entrega desc, o.creado_en desc
     limit 1`,
    [tenantId, clienteId]
  )
  const o = ordenes[0]
  if (!o) return null
  const { rows } = await client.query(
    `select oi.product_id, oi.tamano, oi.cantidad, (c.nombre = 'Empanadas') as es_empanada
     from order_items oi
     join products p on p.id = oi.product_id
     left join categories c on c.id = p.category_id
     where oi.order_id = $1 and oi.product_id is not null
     order by oi.nombre_producto`,
    [o.id]
  )
  return {
    numero: o.numero,
    fechaEntrega: o.fecha_entrega,
    hora: o.horario_entrega,
    empanadas: rows
      .filter((r) => r.es_empanada)
      .map((r) => ({ productoId: r.product_id, tamano: r.tamano === 'Mediana' ? ('Mediana' as const) : ('Grande' as const), cantidad: r.cantidad })),
    postres: rows.filter((r) => !r.es_empanada).map((r) => ({ productoId: r.product_id, tamano: r.tamano, cantidad: r.cantidad })),
  }
}

// ——————————————————————————————————————————————————————————————— Rappi ————

export interface CrearOrdenRappiInput {
  /** Número de la orden en la tablet de Rappi. Único: la misma orden no se registra dos veces. */
  referenciaExterna: string
  sedeId: string | null
  fechaEntregaISO: string
  hora?: string | null
  items: { productoId: string; tamano?: string | null; cantidad: number }[]
  /** Lo que dice la tablet. Los precios de Rappi no son los de la carta, así que las líneas van sin precio. */
  total: number
  nota?: string | null
  ahora?: Date
}

export async function crearOrdenRappi(
  client: pg.PoolClient,
  tenantId: string,
  input: CrearOrdenRappiInput
): Promise<ResultadoOrdenEquipo> {
  const referencia = input.referenciaExterna.trim()
  if (!referencia) return { ok: false, error: 'REFERENCIA_REQUERIDA' }
  if (input.items.length === 0) return { ok: false, error: 'SIN_ITEMS' }
  if (!esFechaISO(input.fechaEntregaISO)) return { ok: false, error: 'FECHA_INVALIDA' }
  if (!Number.isFinite(input.total) || input.total <= 0) return { ok: false, error: 'TOTAL_INVALIDO' }

  const duplicada = await client.query(`select numero from orders where canal = 'rappi' and referencia_externa = $1 limit 1`, [referencia])
  if (duplicada.rows[0]) return { ok: false, error: 'ORDEN_RAPPI_DUPLICADA', detalle: { referencia, numero: duplicada.rows[0].numero } }

  const productos = await productosPorId(client, tenantId, [...new Set(input.items.map((i) => i.productoId))])
  const faltan = [...new Set(input.items.map((i) => i.productoId))].filter((id) => !productos.has(id))
  if (faltan.length > 0) return { ok: false, error: 'PRODUCTO_NO_ENCONTRADO', detalle: { productos: faltan } }

  const items: OrderItemInsert[] = []
  for (const i of input.items) {
    const p = productos.get(i.productoId)!
    let tamano: string | null = null
    if (i.tamano) {
      const real = p.tamanos.find((t) => sinTildes(t) === sinTildes(i.tamano!))
      if (!real) return { ok: false, error: 'TAMANO_INVALIDO', detalle: { producto: p.nombre, tamano: i.tamano, tamanosDisponibles: p.tamanos } }
      tamano = real
    }
    items.push({ productId: p.id, cateringItemId: null, comboId: null, nombreProducto: p.nombre, tamano, extras: [], precioUnitario: 0, cantidad: i.cantidad })
  }

  const customerId = await findOrCreateCustomer(client, tenantId, CLIENTE_RAPPI)
  const { rows: tenantRows } = await client.query<{ codigo_prefijo: string }>(`select codigo_prefijo from tenants where id = $1`, [tenantId])
  if (!tenantRows[0]) return { ok: false, error: 'TENANT_NO_ENCONTRADO' }
  const numero = await siguienteNumeroDePedido(client, tenantId, tenantRows[0].codigo_prefijo)
  const corte = evaluarCorteOrden(input.ahora ?? new Date(), input.fechaEntregaISO)
  const minutos = minutosDelDia(input.hora)

  await insertarPedido(
    client,
    tenantId,
    {
      numero,
      customerId,
      canal: 'rappi',
      estado: 'confirmed',
      tipoEntrega: 'delivery',
      sedeId: input.sedeId,
      direccion: null,
      distrito: null,
      referencia: null,
      fechaEntrega: input.fechaEntregaISO,
      horario: minutos !== null && minutos < 24 * 60 ? horaCanonica(minutos) : (input.hora?.trim() || 'Rappi'),
      nota: input.nota ?? null,
      metodoPago: METODO_PAGO_NEUTRO,
      cuponCodigo: null,
      subtotal: input.total,
      descuentoCupon: 0,
      delivery: 0,
      total: input.total,
      requiereConfirmarCombo: false,
      referenciaExterna: referencia,
      fueraDeCorte: corte.fueraDeCorte,
    },
    items
  )
  return { ok: true, numero, corte, sedeId: input.sedeId }
}

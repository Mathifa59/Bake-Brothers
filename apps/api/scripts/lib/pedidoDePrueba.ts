import { randomInt } from 'node:crypto'
import type pg from 'pg'
import { fechaLimaISO, type EstadoPedido } from '@bakebrothers/domain'
import { insertarPedido, siguienteNumeroDePedido } from '../../src/repositories/ordersRepo.js'

/**
 * Crea un pedido REAL de Bake OS (cliente, pedido y líneas con los precios del catálogo) para probar comprobantes. Lo
 * usan los tests y el recorrido de demo de Mifact; las filas llevan una marca en el nombre del cliente y en la nota
 * (`[PRUEBA…]`) para borrarlas después con `limpiarPedidosDePrueba`.
 */

export interface PedidoDePrueba {
  id: string
  numero: string
  total: number
  customerId: string
}

export interface OpcionesPedidoDePrueba {
  tenantId: string
  /** Marca que se escribe en el cliente y en la nota, p. ej. «[PRUEBA-MIFACT]». */
  marca: string
  sede: 'Cedros' | 'Santa Marina' | null
  tipoEntrega?: 'tienda' | 'delivery'
  estado?: EstadoPedido
  items: { slug: string; tamano?: string | null; cantidad: number }[]
  delivery?: number
  /** Si se omite se toma el siguiente número real de la secuencia (BB-…); los tests pasan uno propio (TEST-…). */
  numero?: string
  dni?: string | null
  ruc?: string | null
  razonSocial?: string | null
  direccionFiscal?: string | null
  correoCliente?: string | null
  nombreCliente?: string
  /** Por defecto true: el nombre del cliente es un nombre real confirmado (puede ir en un comprobante). */
  nombreConfirmado?: boolean
}

export async function crearPedidoDePrueba(pool: pg.Pool, o: OpcionesPedidoDePrueba): Promise<PedidoDePrueba> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const sede = o.sede
      ? (await client.query(`select id from sedes where nombre = $1`, [o.sede])).rows[0]?.id ?? null
      : null
    if (o.sede && !sede) throw new Error(`No existe la sede «${o.sede}»`)

    const lineas: { productId: string; nombre: string; tamano: string | null; precio: number; cantidad: number }[] = []
    for (const it of o.items) {
      const { rows } = await client.query(
        `select p.id, p.nombre, p.precio_base::float8 as base, s.tamano, s.precio::float8 as precio_tamano
           from products p left join product_sizes s on s.product_id = p.id and ($2::text is not null and s.tamano = $2)
          where p.slug = $1`,
        [it.slug, it.tamano ?? null]
      )
      const p = rows[0]
      if (!p) throw new Error(`No existe el producto «${it.slug}»`)
      if (it.tamano && p.tamano == null) throw new Error(`«${it.slug}» no tiene el tamaño «${it.tamano}»`)
      lineas.push({ productId: p.id, nombre: p.nombre, tamano: it.tamano ?? null, precio: p.precio_tamano ?? p.base, cantidad: it.cantidad })
    }
    const subtotal = Math.round(lineas.reduce((s, l) => s + l.precio * l.cantidad * 100, 0)) / 100
    const delivery = o.delivery ?? 0
    const total = Math.round((subtotal + delivery) * 100) / 100

    const cliente = await client.query(
      `insert into customers (tenant_id, nombre, telefono, correo, dni, ruc, razon_social, direccion_fiscal, nombre_confirmado)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
      [
        o.tenantId, `${o.marca} ${o.nombreCliente ?? 'Cliente'}`, `+519${randomInt(10_000_000, 99_999_999)}`,
        o.correoCliente ?? null, o.dni ?? null, o.ruc ?? null, o.razonSocial ?? null, o.direccionFiscal ?? null, o.nombreConfirmado ?? true,
      ]
    )
    const numero = o.numero ?? (await siguienteNumeroDePedido(client, o.tenantId, 'BB'))
    const id = await insertarPedido(
      client,
      o.tenantId,
      {
        numero,
        customerId: cliente.rows[0].id,
        canal: 'presencial',
        estado: o.estado ?? 'confirmed',
        tipoEntrega: o.tipoEntrega ?? 'tienda',
        sedeId: sede,
        direccion: o.tipoEntrega === 'delivery' ? 'Dirección de prueba 123' : null,
        distrito: o.tipoEntrega === 'delivery' ? 'Chorrillos' : null,
        referencia: null,
        fechaEntrega: fechaLimaISO(new Date()),
        horario: '10:00 am',
        nota: `${o.marca} pedido para probar comprobantes`,
        metodoPago: 'yape',
        cuponCodigo: null,
        subtotal,
        descuentoCupon: 0,
        delivery,
        total,
        requiereConfirmarCombo: false,
      },
      lineas.map((l) => ({
        productId: l.productId,
        cateringItemId: null,
        comboId: null,
        nombreProducto: l.nombre,
        tamano: l.tamano,
        extras: [],
        precioUnitario: l.precio,
        cantidad: l.cantidad,
      }))
    )
    await client.query('commit')
    return { id, numero, total, customerId: cliente.rows[0].id }
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/** Borra los pedidos de prueba de una marca (primero sus comprobantes) y sus clientes. */
export async function limpiarPedidosDePrueba(pool: pg.Pool, marca: string): Promise<void> {
  await pool.query(`delete from comprobantes where order_id in (select id from orders where nota like $1)`, [`${marca}%`])
  await pool.query(`delete from orders where nota like $1`, [`${marca}%`])
  await pool.query(`delete from customers where nombre like $1`, [`${marca}%`])
}

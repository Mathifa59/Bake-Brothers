import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  calcularPrecioLinea,
  calcularSubtotal,
  cumpleAnticipacionMinima,
  hayCupoDisponible,
  cupoRestante,
} from '@bakebrothers/domain'
import { withTenantTx, tenantPorSlug } from '../db.js'
import {
  productosParaPedido,
  extrasActivos,
} from '../repositories/productsRepo.js'
import { cupoMaximoDelDia, unidadesReservadas } from '../repositories/capacityRepo.js'
import {
  findOrCreateCustomer,
  siguienteNumeroDePedido,
  insertarPedido,
  listarPedidos,
  pedidoPorNumero,
  type OrderItemInsert,
} from '../repositories/ordersRepo.js'

const crearPedidoSchema = z.object({
  cliente: z.object({
    nombre: z.string().trim().min(1),
    telefono: z.string().trim().min(6),
    correo: z.string().trim().email().nullish(),
    dni: z.string().trim().nullish(),
  }),
  tipoEntrega: z.enum(['tienda', 'delivery']),
  direccion: z.string().trim().nullish(),
  distrito: z.string().trim().nullish(),
  referencia: z.string().trim().nullish(),
  fechaEntrega: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fechaEntrega debe ser YYYY-MM-DD'),
  horario: z.string().trim().min(1),
  nota: z.string().nullish(),
  metodoPago: z.enum(['yape', 'plin', 'transferencia', 'tarjeta', 'contraentrega']),
  canal: z.enum(['web', 'whatsapp', 'facebook', 'instagram']).default('web'),
  // NUNCA se aceptan precios del cliente: solo qué, cuánto y cómo.
  items: z
    .array(
      z.object({
        productoId: z.string().min(1),
        // Las etiquetas de tamaño del catálogo real son texto libre por
        // producto ("Mini 16cm", "Caja x18", "200g", ...) — se validan contra
        // los tamaños reales del producto (product.tamanos), no un enum fijo.
        tamano: z.string().trim().min(1).nullish(),
        extras: z.array(z.string()).default([]),
        cantidad: z.number().int().positive().max(999),
      })
    )
    .min(1),
})

const filtrosPedidosSchema = z.object({
  telefono: z.string().optional(),
  correo: z.string().optional(),
  limite: z.coerce.number().int().positive().max(100).optional(),
})

export function ordersRoutes(app: FastifyInstance) {
  // ——————————————————————————————————————————— POST /api/orders ————
  app.post('/api/orders', async (req, reply) => {
    const body = crearPedidoSchema.parse(req.body)
    const tenant = await tenantPorSlug(req.tenantSlug)
    if (!tenant) return reply.code(404).send({ error: 'TENANT_NO_ENCONTRADO' })

    return withTenantTx(req.tenantId, async (client) => {
      // 1. Productos reales del catálogo (por slug, dentro del tenant)
      const slugs = [...new Set(body.items.map((i) => i.productoId))]
      const productos = await productosParaPedido(client, req.tenantId, slugs)
      const porSlug = new Map(productos.map((p) => [p.slug, p]))

      const noEncontrados = slugs.filter((s) => !porSlug.has(s))
      if (noEncontrados.length > 0) {
        return reply.code(400).send({ error: 'PRODUCTO_NO_ENCONTRADO', productos: noEncontrados })
      }
      const noDisponibles = productos.filter((p) => !p.disponible).map((p) => p.slug)
      if (noDisponibles.length > 0) {
        return reply.code(400).send({ error: 'PRODUCTO_NO_DISPONIBLE', productos: noDisponibles })
      }

      // 2. Validar tamaños y extras contra el catálogo
      const catalogoExtras = await extrasActivos(client, req.tenantId)
      for (const item of body.items) {
        const producto = porSlug.get(item.productoId)!
        const aceptaTamanos = producto.tamanos.length > 0
        if (item.tamano && !aceptaTamanos) {
          return reply.code(400).send({ error: 'TAMANO_NO_APLICA', producto: item.productoId })
        }
        if (item.tamano && aceptaTamanos && !producto.tamanos.some((t) => t.tamano === item.tamano)) {
          return reply.code(400).send({ error: 'TAMANO_INVALIDO', producto: item.productoId })
        }
        const extrasInvalidos = item.extras.filter((e) => !catalogoExtras.has(e))
        if (extrasInvalidos.length > 0) {
          return reply.code(400).send({ error: 'EXTRA_INVALIDO', extras: extrasInvalidos })
        }
      }

      // 3. Anticipación mínima por producto (criterio: torta a 12h → 422)
      // Catálogo real (0006): la mayoría de productos de tienda no tiene
      // anticipación mínima documentada por la fuente (solo catering la
      // especifica, y es un modelo aparte) — null se trata como "sin mínimo
      // conocido", no como 0 horas prometidas.
      const violaciones = body.items
        .map((item) => {
          const producto = porSlug.get(item.productoId)!
          const anticipacionHorasMinima = producto.anticipacion_horas ?? 0
          const cumple = cumpleAnticipacionMinima({
            fechaEntregaISO: body.fechaEntrega,
            anticipacionHorasMinima,
          })
          return cumple ? null : { productoId: producto.slug, horasMinimas: anticipacionHorasMinima }
        })
        .filter(Boolean)
      if (violaciones.length > 0) {
        return reply.code(422).send({ error: 'ANTICIPACION_INSUFICIENTE', detalle: violaciones })
      }

      // 4. Capacidad de producción por categoría y fecha
      const solicitadoPorCategoria = new Map<string, number>()
      for (const item of body.items) {
        const producto = porSlug.get(item.productoId)!
        if (!producto.category_id) continue
        solicitadoPorCategoria.set(
          producto.category_id,
          (solicitadoPorCategoria.get(producto.category_id) ?? 0) + item.cantidad
        )
      }
      for (const [categoryId, solicitadas] of solicitadoPorCategoria) {
        const cupoMaximo = await cupoMaximoDelDia(client, req.tenantId, categoryId, body.fechaEntrega)
        const reservadas = await unidadesReservadas(client, req.tenantId, categoryId, body.fechaEntrega)
        if (!hayCupoDisponible({ cupoMaximo, unidadesReservadas: reservadas, unidadesSolicitadas: solicitadas })) {
          return reply.code(409).send({
            error: 'SIN_CUPO_DISPONIBLE',
            fecha: body.fechaEntrega,
            cupoRestante: cupoRestante({ cupoMaximo, unidadesReservadas: reservadas }),
          })
        }
      }

      // 5. Entrega: dirección requerida si es delivery. La tarifa ya no se
      // calcula sola (0004_rediseno_alcance.sql): el operador la cotiza
      // manualmente y la ajusta desde el dashboard (Semana 3).
      if (body.tipoEntrega === 'delivery' && (!body.direccion || !body.distrito)) {
        return reply.code(400).send({ error: 'DIRECCION_REQUERIDA' })
      }

      // 6. Precios: SIEMPRE recalculados en el servidor con @bakebrothers/domain.
      // Los cupones de descuento se retiraron (reemplazados por `combos` de
      // precio fijo, que se gestionan desde el dashboard en Semana 3).
      const itemsValorizados: OrderItemInsert[] = body.items.map((item) => {
        const producto = porSlug.get(item.productoId)!
        const tamanoSeleccionado = item.tamano
          ? producto.tamanos.find((t) => t.tamano === item.tamano)
          : undefined
        const precioUnitario = calcularPrecioLinea({
          precioBase: Number(producto.precio_base),
          tamano: item.tamano ?? null,
          precioTamano: tamanoSeleccionado ? Number(tamanoSeleccionado.precio) : null,
          preciosExtras: item.extras.map((e) => catalogoExtras.get(e)!.precio),
        })
        return {
          productId: producto.id,
          nombreProducto: producto.nombre,
          tamano: item.tamano ?? null,
          extras: item.extras,
          precioUnitario,
          cantidad: item.cantidad,
        }
      })
      const subtotal = calcularSubtotal(
        itemsValorizados.map((i) => ({ precioLinea: i.precioUnitario, cantidad: i.cantidad }))
      )
      // delivery/total quedan en manos del operador (columnas conservadas
      // para no romper el esquema; se completan desde el dashboard).
      const totales = { subtotal, descuentoCupon: 0, delivery: 0, total: subtotal }

      // 7. Persistencia: cliente, número atómico, pedido + items snapshot
      const customerId = await findOrCreateCustomer(client, req.tenantId, body.cliente)
      const numero = await siguienteNumeroDePedido(client, req.tenantId, tenant.codigo_prefijo)
      await insertarPedido(
        client,
        req.tenantId,
        {
          numero,
          customerId,
          canal: body.canal,
          estado: 'confirmed', // sin pasarela real en Fase 0, se confirma directo
          tipoEntrega: body.tipoEntrega,
          direccion: body.direccion ?? null,
          distrito: body.tipoEntrega === 'delivery' ? (body.distrito ?? null) : null,
          referencia: body.referencia ?? null,
          fechaEntrega: body.fechaEntrega,
          horario: body.horario,
          nota: body.nota ?? null,
          metodoPago: body.metodoPago,
          cuponCodigo: null, // columna conservada por compatibilidad; los cupones se retiraron (ver combos)
          ...totales,
        },
        itemsValorizados
      )

      return reply.code(201).send({
        numero,
        estado: 'confirmed',
        ...totales,
        items: itemsValorizados.map((i) => ({
          nombre: i.nombreProducto,
          cantidad: i.cantidad,
          precio: i.precioUnitario,
          tamano: i.tamano,
          extras: i.extras,
        })),
      })
    })
  })

  // ——————————————————————————————————————————— GET /api/orders ————
  app.get('/api/orders', async (req) => {
    const filtros = filtrosPedidosSchema.parse(req.query)
    return withTenantTx(req.tenantId, (client) => listarPedidos(client, req.tenantId, filtros))
  })

  app.get('/api/orders/:numero', async (req, reply) => {
    const { numero } = z.object({ numero: z.string().min(1) }).parse(req.params)
    const pedido = await withTenantTx(req.tenantId, (client) =>
      pedidoPorNumero(client, req.tenantId, numero)
    )
    if (!pedido) return reply.code(404).send({ error: 'PEDIDO_NO_ENCONTRADO' })
    return pedido
  })

}

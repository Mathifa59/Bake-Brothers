import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  calcularPrecioLinea,
  calcularTotales,
  cumpleAnticipacionMinima,
  hayCupoDisponible,
  cupoRestante,
  esEstadoPedido,
  puedeTransicionar,
  type TamanoId,
} from '@bakebrothers/domain'
import { env } from '../env.js'
import { withTenantTx, tenantPorSlug } from '../db.js'
import {
  productosParaPedido,
  extrasActivos,
} from '../repositories/productsRepo.js'
import { cuponVigente } from '../repositories/couponsRepo.js'
import { tarifaDeZona } from '../repositories/deliveryZonesRepo.js'
import { cupoMaximoDelDia, unidadesReservadas } from '../repositories/capacityRepo.js'
import {
  findOrCreateCustomer,
  siguienteNumeroDePedido,
  insertarPedido,
  listarPedidos,
  pedidoPorNumero,
  estadoActual,
  actualizarEstado,
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
  cuponCodigo: z.string().trim().nullish(),
  canal: z.enum(['web', 'whatsapp']).default('web'),
  // NUNCA se aceptan precios del cliente: solo qué, cuánto y cómo.
  items: z
    .array(
      z.object({
        productoId: z.string().min(1),
        tamano: z.enum(['Personal', 'Mediano', 'Grande']).nullish(),
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
        const aceptaTamanos = producto.tamanos_validos.length > 0
        if (item.tamano && !aceptaTamanos) {
          return reply.code(400).send({ error: 'TAMANO_NO_APLICA', producto: item.productoId })
        }
        if (item.tamano && aceptaTamanos && !producto.tamanos_validos.includes(item.tamano)) {
          return reply.code(400).send({ error: 'TAMANO_INVALIDO', producto: item.productoId })
        }
        const extrasInvalidos = item.extras.filter((e) => !catalogoExtras.has(e))
        if (extrasInvalidos.length > 0) {
          return reply.code(400).send({ error: 'EXTRA_INVALIDO', extras: extrasInvalidos })
        }
      }

      // 3. Anticipación mínima por producto (criterio: torta a 12h → 422)
      const violaciones = body.items
        .map((item) => {
          const producto = porSlug.get(item.productoId)!
          const cumple = cumpleAnticipacionMinima({
            fechaEntregaISO: body.fechaEntrega,
            anticipacionHorasMinima: producto.anticipacion_horas,
          })
          return cumple ? null : { productoId: producto.slug, horasMinimas: producto.anticipacion_horas }
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

      // 5. Entrega: dirección + zona válida si es delivery
      let tarifaDelivery: number | undefined
      if (body.tipoEntrega === 'delivery') {
        if (!body.direccion || !body.distrito) {
          return reply.code(400).send({ error: 'DIRECCION_REQUERIDA' })
        }
        const tarifaZona = await tarifaDeZona(client, req.tenantId, body.distrito)
        if (tarifaZona === undefined) {
          return reply.code(400).send({ error: 'ZONA_NO_CUBIERTA', distrito: body.distrito })
        }
        tarifaDelivery = tarifaZona ?? undefined // null → tarifa global del dominio
      } else {
        tarifaDelivery = 0 // recojo en tienda no paga delivery
      }

      // 6. Cupón (la única validación autoritativa; el front solo da feedback)
      let cupon = null
      if (body.cuponCodigo) {
        cupon = await cuponVigente(client, req.tenantId, body.cuponCodigo)
        if (!cupon) return reply.code(400).send({ error: 'CUPON_INVALIDO' })
      }

      // 7. Precios: SIEMPRE recalculados en el servidor con @bakebrothers/domain
      const itemsValorizados: OrderItemInsert[] = body.items.map((item) => {
        const producto = porSlug.get(item.productoId)!
        const precioUnitario = calcularPrecioLinea({
          precioBase: Number(producto.precio_base),
          tamano: (item.tamano ?? null) as TamanoId | null,
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
      const totales = calcularTotales({
        lineas: itemsValorizados.map((i) => ({ precioLinea: i.precioUnitario, cantidad: i.cantidad })),
        cupon,
        tarifaDelivery,
      })

      // 8. Persistencia: cliente, número atómico, pedido + items snapshot
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
          cuponCodigo: cupon?.codigo ?? null,
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

  // ——————————————————————————— PATCH /api/orders/:numero/status ————
  // Pensado para el dashboard (Fase 2). X-Admin-Key es un placeholder hasta
  // que exista auth real de operadores.
  app.patch('/api/orders/:numero/status', async (req, reply) => {
    if (req.headers['x-admin-key'] !== env.ADMIN_KEY) {
      return reply.code(401).send({ error: 'NO_AUTORIZADO' })
    }
    const { numero } = z.object({ numero: z.string().min(1) }).parse(req.params)
    const { estado } = z.object({ estado: z.string() }).parse(req.body)
    if (!esEstadoPedido(estado)) {
      return reply.code(400).send({ error: 'ESTADO_INVALIDO', estado })
    }
    return withTenantTx(req.tenantId, async (client) => {
      const actual = await estadoActual(client, req.tenantId, numero)
      if (!actual) return reply.code(404).send({ error: 'PEDIDO_NO_ENCONTRADO' })
      if (!puedeTransicionar(actual, estado)) {
        return reply.code(409).send({ error: 'TRANSICION_INVALIDA', de: actual, a: estado })
      }
      await actualizarEstado(client, req.tenantId, numero, estado)
      return { numero, estado }
    })
  })
}

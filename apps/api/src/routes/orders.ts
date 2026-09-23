import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { withTenantTx, tenantPorSlug } from '../db.js'
import {
  findOrCreateCustomer,
  siguienteNumeroDePedido,
  insertarPedido,
  listarPedidos,
  pedidoPorNumero,
} from '../repositories/ordersRepo.js'
import { validarYValorizarItemsTienda } from '../services/pedidosTienda.js'

const ERROR_A_CODIGO_HTTP: Record<string, number> = {
  PRODUCTO_NO_ENCONTRADO: 400,
  PRODUCTO_NO_DISPONIBLE: 400,
  TAMANO_NO_APLICA: 400,
  TAMANO_INVALIDO: 400,
  EXTRA_INVALIDO: 400,
  ANTICIPACION_INSUFICIENTE: 422,
  SIN_CUPO_DISPONIBLE: 409,
}

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
      // Validación + valorización de items: misma lógica que usa crearPedido
      // (tool del bot, apps/api/src/bot/tools.ts) — extraída a
      // services/pedidosTienda.ts para que ninguna de las dos rutas de
      // entrada la duplique ni confíe en un precio ajeno.
      const resultado = await validarYValorizarItemsTienda(client, req.tenantId, body.items, body.fechaEntrega)
      if (!resultado.ok) {
        const codigo = ERROR_A_CODIGO_HTTP[resultado.error] ?? 400
        return reply.code(codigo).send({ error: resultado.error, detalle: resultado.detalle })
      }

      // Entrega: dirección requerida si es delivery. La tarifa ya no se
      // calcula sola (0004_rediseno_alcance.sql): el operador la cotiza
      // manualmente y la ajusta desde el dashboard (Semana 3).
      if (body.tipoEntrega === 'delivery' && (!body.direccion || !body.distrito)) {
        return reply.code(400).send({ error: 'DIRECCION_REQUERIDA' })
      }

      // delivery/total quedan en manos del operador (columnas conservadas
      // para no romper el esquema; se completan desde el dashboard).
      const totales = { subtotal: resultado.subtotal, descuentoCupon: 0, delivery: 0, total: resultado.subtotal }

      // Persistencia: cliente, número atómico, pedido + items snapshot
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
          sedeId: null, // apps/web no resuelve sede todavía
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
        resultado.items
      )

      return reply.code(201).send({
        numero,
        estado: 'confirmed',
        ...totales,
        items: resultado.items.map((i) => ({
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

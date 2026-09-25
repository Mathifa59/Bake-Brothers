import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { withTenantTx, tenantPorSlug } from '../db.js'
import { verificarJwtOperador } from '../auth/verificarJwtOperador.js'
import { crearPedidoDashboard, type ItemPedidoDashboardInput } from '../services/crearPedidoDashboard.js'
import { generarComprobantePdf } from '../services/comprobantePdf.js'

const ERROR_A_CODIGO_HTTP: Record<string, number> = {
  SIN_ITEMS: 400,
  PRODUCTO_NO_ENCONTRADO: 400,
  PRODUCTO_NO_DISPONIBLE: 400,
  TAMANO_NO_APLICA: 400,
  TAMANO_INVALIDO: 400,
  EXTRA_INVALIDO: 400,
  ANTICIPACION_INSUFICIENTE: 422,
  SIN_CUPO_DISPONIBLE: 409,
  ITEM_CATERING_NO_ENCONTRADO: 400,
  CATERING_NO_VERDE: 409,
  COMBO_NO_ENCONTRADO: 400,
  COMBO_NO_DISPONIBLE_EN_ESTE_CANAL: 409,
  DIRECCION_REQUERIDA: 400,
  TENANT_NO_ENCONTRADO: 404,
}

const itemSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('producto'),
    productoId: z.string().min(1),
    tamano: z.string().trim().min(1).nullish(),
    extras: z.array(z.string()).default([]),
    cantidad: z.number().int().positive().max(999),
  }),
  z.object({
    tipo: z.literal('catering'),
    busquedaItem: z.string().min(1),
    cantidad: z.number().int().positive().max(9999),
  }),
  z.object({
    tipo: z.literal('combo'),
    comboId: z.string().min(1),
    cantidad: z.number().int().positive().max(99),
  }),
])

const crearPedidoDashboardSchema = z.object({
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
  items: z.array(itemSchema).min(1),
  metodoPago: z.enum(['yape', 'plin', 'transferencia', 'tarjeta', 'contraentrega']),
  yaPago: z.boolean(),
  nota: z.string().nullish(),
  // Solo se usa si el operador logueado es admin — un operador normal
  // siempre queda forzado a su propia sede, sin importar lo que mande acá.
  sedeId: z.string().nullish(),
})

/**
 * Rutas del puente apps/admin → apps/api (un operador arma un pedido a
 * mano). Todas exigen JWT real verificado — ver auth/verificarJwtOperador.ts.
 */
export function dashboardOrdersRoutes(app: FastifyInstance) {
  app.post('/api/dashboard/orders', { preHandler: verificarJwtOperador }, async (req, reply) => {
    const body = crearPedidoDashboardSchema.parse(req.body)
    const operador = req.operador!

    // sede_id: nunca se confía en lo que mande el cliente si es operador —
    // se fuerza a la suya. Solo un admin puede elegir sede.
    const sedeId = operador.rol === 'operador' ? operador.sedeId : (body.sedeId ?? null)

    const tenant = await tenantPorSlug(req.tenantSlug)
    if (!tenant) return reply.code(404).send({ error: 'TENANT_NO_ENCONTRADO' })

    const resultado = await withTenantTx(req.tenantId, (client) =>
      crearPedidoDashboard(client, req.tenantId, {
        cliente: body.cliente,
        tipoEntrega: body.tipoEntrega,
        direccion: body.direccion,
        distrito: body.distrito,
        referencia: body.referencia,
        fechaEntregaISO: body.fechaEntrega,
        horario: body.horario,
        items: body.items as ItemPedidoDashboardInput[],
        metodoPago: body.metodoPago,
        yaPago: body.yaPago,
        nota: body.nota,
        sedeId,
      })
    )

    if (!resultado.ok) {
      const codigo = ERROR_A_CODIGO_HTTP[resultado.error] ?? 400
      return reply.code(codigo).send({ error: resultado.error, detalle: resultado.detalle })
    }

    return reply.code(201).send(resultado)
  })

  app.get(
    '/api/dashboard/orders/:numero/comprobante.pdf',
    { preHandler: verificarJwtOperador },
    async (req, reply) => {
      const { numero } = z.object({ numero: z.string().min(1) }).parse(req.params)
      const pdf = await withTenantTx(req.tenantId, (client) =>
        generarComprobantePdf(client, req.tenantId, numero)
      )
      if (!pdf) return reply.code(404).send({ error: 'PEDIDO_NO_ENCONTRADO' })
      reply.header('Content-Type', 'application/pdf')
      reply.header('Content-Disposition', `inline; filename="comprobante-${numero}.pdf"`)
      return reply.send(pdf)
    }
  )
}

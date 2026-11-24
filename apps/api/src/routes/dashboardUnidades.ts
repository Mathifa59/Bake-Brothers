import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { exigirPerfil, verificarJwtOperador } from '../auth/verificarJwtOperador.js'
import { soloAdmin } from '../auth/soloAdmin.js'
import {
  anularPago,
  anularSalida,
  confirmarSalio,
  crearSalida,
  editarSalida,
  ErrorUnidades,
  guardarPrecios,
  listarPrecios,
  listarSalidas,
  listarUnidades,
  registrarDevolucion,
  registrarPago,
  reporte,
} from '../services/unidades.js'

/**
 * Unidades de negocio (Calle y Mayoristas). Salidas a calle y la lista de unidades: Administración y Órdenes. Precios
 * internos, pagos y reportes: SOLO Administración (son plata). Ningún precio ni monto lo manda el panel como verdad: el
 * precio interno que se congela sale de la lista de la base.
 */
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const uuid = z.string().uuid()
const idSchema = z.object({ id: uuid })
const itemEntrada = z.object({ productId: uuid, productSizeId: uuid.nullish(), cantidad: z.number().int().min(1).max(5000) })

const nuevaSalidaSchema = z.object({
  unidadId: uuid,
  sedeId: uuid,
  fecha,
  nota: z.string().trim().max(300).nullish(),
  items: z.array(itemEntrada).min(1).max(80),
  confirmar: z.boolean().optional(),
})
const editarSalidaSchema = z
  .object({ fecha, sedeId: uuid, nota: z.string().trim().max(300).nullable(), items: z.array(itemEntrada).min(1).max(80) })
  .partial()
  .strict()
const salioSchema = z.object({
  items: z.array(z.object({ itemId: uuid, cantidadSalio: z.number().int().min(0).max(5000) })).max(80),
  nuevos: z.array(itemEntrada).max(80).optional(),
})
const devolucionSchema = z.object({ items: z.array(z.object({ itemId: uuid, cantidadDevuelta: z.number().int().min(0).max(5000) })).min(1).max(80) })
const listaSalidasSchema = z.object({
  desde: fecha.optional(),
  hasta: fecha.optional(),
  unidadId: uuid.optional(),
  estado: z.enum(['planificada', 'salio', 'anulada']).optional(),
  limite: z.coerce.number().int().min(1).max(300).default(100),
})
const preciosQuery = z.object({ unidadId: uuid })
const preciosSchema = z.object({
  unidadId: uuid,
  cambios: z.array(z.object({ productId: uuid, productSizeId: uuid.nullish(), precio: z.number().min(0).max(100000).nullable() })).min(1).max(300),
})
const pagoSchema = z.object({ unidadId: uuid, fecha, monto: z.number().positive().max(1_000_000), nota: z.string().trim().max(300).nullish() })
const reporteSchema = z.object({ desde: fecha, hasta: fecha, unidadId: uuid.optional() })

function responderError(reply: FastifyReply, err: unknown) {
  if (err instanceof ErrorUnidades) return reply.code(err.estado).send({ error: err.codigo, detalle: err.message, ...(err.extra ?? {}) })
  throw err
}

export function dashboardUnidadesRoutes(app: FastifyInstance) {
  // Quien puede registrar salidas: Administración y Órdenes (Administración entra siempre a `exigirPerfil`).
  const salidasPre = [verificarJwtOperador, exigirPerfil('ordenes')]
  const adminPre = [verificarJwtOperador, soloAdmin]
  const limite = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }

  app.get('/api/dashboard/unidades', { preHandler: salidasPre }, async (_req, reply) => reply.code(200).send({ unidades: await listarUnidades() }))

  // ——— salidas a calle ———
  app.get('/api/dashboard/unidades/salidas', { preHandler: salidasPre }, async (req, reply) => {
    const q = listaSalidasSchema.parse(req.query)
    return reply.code(200).send({ salidas: await listarSalidas(q) })
  })

  app.post('/api/dashboard/unidades/salidas', { preHandler: salidasPre, ...limite }, async (req, reply) => {
    const cuerpo = nuevaSalidaSchema.parse(req.body)
    try {
      const r = await crearSalida(req.operador!.id, { ...cuerpo, items: cuerpo.items.map((i) => ({ ...i, productSizeId: i.productSizeId ?? null })) })
      return reply.code(201).send({ ok: true, ...r })
    } catch (err) {
      return responderError(reply, err)
    }
  })

  app.patch('/api/dashboard/unidades/salidas/:id', { preHandler: salidasPre, ...limite }, async (req, reply) => {
    const { id } = idSchema.parse(req.params)
    const cuerpo = editarSalidaSchema.parse(req.body)
    try {
      await editarSalida(req.operador!.id, id, { ...cuerpo, items: cuerpo.items?.map((i) => ({ ...i, productSizeId: i.productSizeId ?? null })) })
      return reply.code(200).send({ ok: true })
    } catch (err) {
      return responderError(reply, err)
    }
  })

  app.post('/api/dashboard/unidades/salidas/:id/salio', { preHandler: salidasPre, ...limite }, async (req, reply) => {
    const { id } = idSchema.parse(req.params)
    const cuerpo = salioSchema.parse(req.body)
    try {
      const r = await confirmarSalio(req.operador!.id, id, { items: cuerpo.items, nuevos: cuerpo.nuevos?.map((i) => ({ ...i, productSizeId: i.productSizeId ?? null })) })
      return reply.code(200).send({ ok: true, ...r })
    } catch (err) {
      return responderError(reply, err)
    }
  })

  app.post('/api/dashboard/unidades/salidas/:id/devolucion', { preHandler: salidasPre, ...limite }, async (req, reply) => {
    const { id } = idSchema.parse(req.params)
    const cuerpo = devolucionSchema.parse(req.body)
    try {
      const r = await registrarDevolucion(req.operador!.id, id, cuerpo.items)
      return reply.code(200).send({ ok: true, ...r })
    } catch (err) {
      return responderError(reply, err)
    }
  })

  app.post('/api/dashboard/unidades/salidas/:id/anular', { preHandler: salidasPre, ...limite }, async (req, reply) => {
    const { id } = idSchema.parse(req.params)
    try {
      await anularSalida(req.operador!.id, id)
      return reply.code(200).send({ ok: true })
    } catch (err) {
      return responderError(reply, err)
    }
  })

  // ——— precios internos, pagos y reporte: solo Administración ———
  app.get('/api/dashboard/unidades/precios', { preHandler: adminPre }, async (req, reply) => {
    const { unidadId } = preciosQuery.parse(req.query)
    try {
      return reply.code(200).send(await listarPrecios(unidadId))
    } catch (err) {
      return responderError(reply, err)
    }
  })

  app.put('/api/dashboard/unidades/precios', { preHandler: adminPre, ...limite }, async (req, reply) => {
    const cuerpo = preciosSchema.parse(req.body)
    try {
      const r = await guardarPrecios(
        req.operador!.id,
        cuerpo.unidadId,
        cuerpo.cambios.map((c) => ({ productId: c.productId, productSizeId: c.productSizeId ?? null, precio: c.precio }))
      )
      return reply.code(200).send({ ok: true, ...r })
    } catch (err) {
      return responderError(reply, err)
    }
  })

  app.get('/api/dashboard/unidades/reporte', { preHandler: adminPre }, async (req, reply) => {
    const q = reporteSchema.parse(req.query)
    if (q.desde > q.hasta) return reply.code(400).send({ error: 'RANGO_NO_VALIDO', detalle: 'La fecha de inicio no puede ser después de la final.' })
    try {
      return reply.code(200).send(await reporte(q))
    } catch (err) {
      return responderError(reply, err)
    }
  })

  app.post('/api/dashboard/unidades/pagos', { preHandler: adminPre, ...limite }, async (req, reply) => {
    const cuerpo = pagoSchema.parse(req.body)
    try {
      const r = await registrarPago(req.operador!.id, cuerpo)
      return reply.code(201).send({ ok: true, ...r })
    } catch (err) {
      return responderError(reply, err)
    }
  })

  app.post('/api/dashboard/unidades/pagos/:id/anular', { preHandler: adminPre, ...limite }, async (req, reply) => {
    const { id } = idSchema.parse(req.params)
    try {
      await anularPago(req.operador!.id, id)
      return reply.code(200).send({ ok: true })
    } catch (err) {
      return responderError(reply, err)
    }
  })
}

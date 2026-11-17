import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { pool } from '../db.js'
import { verificarJwtOperador } from '../auth/verificarJwtOperador.js'
import { soloAdmin } from '../auth/soloAdmin.js'
import {
  ComprobanteError,
  anularComprobante,
  comprobantesDePedido,
  consultarEstado,
  descargarPdf,
  emitirComprobante,
  enviarCorreoComprobante,
  obtenerComprobante,
  reintentarEnvio,
  type CodigoErrorComprobante,
} from '../services/comprobantes.js'

/**
 * Boletas y facturas electrónicas de un pedido (Mifact). SOLO ADMINISTRADOR, y por ahora sin pantalla en el panel
 * (Mifact sigue oculto). Sin las variables de entorno de Mifact del emisor responde 503 MIFACT_NO_CONFIGURADO, así
 * que desplegar este código no activa nada por sí solo.
 *
 * Regla del proyecto: nada de `reply` dentro de una transacción. Estas rutas no abren ninguna: el servicio usa
 * transacciones cortas propias y la llamada a Mifact siempre va fuera de ellas.
 */

const CODIGO_HTTP: Record<CodigoErrorComprobante, number> = {
  MIFACT_NO_CONFIGURADO: 503,
  PEDIDO_NO_ENCONTRADO: 404,
  COMPROBANTE_NO_ENCONTRADO: 404,
  PEDIDO_NO_FACTURABLE: 409,
  PEDIDO_TOTAL_PENDIENTE: 409,
  COMPROBANTE_YA_EMITIDO: 409,
  ESTADO_NO_PERMITE: 409,
  ENTORNO_NO_COINCIDE: 409,
  NUMERO_NO_DISPONIBLE: 409,
  SIN_LINEAS_FACTURABLES: 422,
  TOTAL_NO_COINCIDE: 422,
  RECEPTOR_INVALIDO: 422,
  CORREO_INVALIDO: 422,
  MOTIVO_INVALIDO: 422,
  MIFACT_RECHAZO: 422,
  SIN_PDF: 502,
  MIFACT_SIN_RESPUESTA: 502,
}

function responderError(reply: FastifyReply, err: unknown) {
  if (err instanceof ComprobanteError) {
    return reply.code(CODIGO_HTTP[err.codigo]).send({
      error: err.codigo,
      mensaje: err.message,
      ...(err.detalle !== undefined ? { detalle: err.detalle } : {}),
      ...(err.comprobanteId ? { comprobanteId: err.comprobanteId } : {}),
    })
  }
  throw err
}

const uuid = z.string().uuid()
const receptorSchema = z
  .object({
    tipoDoc: z.enum(['0', '1', '4', '6', '7']).nullish(),
    numeroDoc: z.string().trim().max(15).nullish(),
    nombre: z.string().trim().max(200).nullish(),
    direccion: z.string().trim().max(200).nullish(),
    correo: z.string().trim().max(100).nullish(),
  })
  .strict()

export function dashboardComprobantesRoutes(app: FastifyInstance) {
  const pre = { preHandler: [verificarJwtOperador, soloAdmin] }

  app.post('/api/dashboard/comprobantes', pre, async (req, reply) => {
    const body = z
      .object({ pedido: z.string().trim().min(1).max(30), tipo: z.enum(['boleta', 'factura']), receptor: receptorSchema.optional() })
      .strict()
      .parse(req.body)
    try {
      const c = await emitirComprobante(pool, req.tenantId, { ...body, usuarioId: req.operador?.id ?? null })
      return reply.code(201).send(c)
    } catch (err) {
      return responderError(reply, err)
    }
  })

  app.get('/api/dashboard/comprobantes', pre, async (req, reply) => {
    const { pedido } = z.object({ pedido: z.string().trim().min(1).max(30) }).parse(req.query)
    try {
      return reply.send(await comprobantesDePedido(pool, req.tenantId, pedido))
    } catch (err) {
      return responderError(reply, err)
    }
  })

  app.get('/api/dashboard/comprobantes/:id', pre, async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params)
    try {
      return reply.send(await obtenerComprobante(pool, req.tenantId, id))
    } catch (err) {
      return responderError(reply, err)
    }
  })

  // Consultar el estado en Mifact/SUNAT y guardarlo en el pedido.
  app.post('/api/dashboard/comprobantes/:id/estado', pre, async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params)
    try {
      return reply.send(await consultarEstado(pool, req.tenantId, id))
    } catch (err) {
      return responderError(reply, err)
    }
  })

  app.post('/api/dashboard/comprobantes/:id/reintentar', pre, async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params)
    try {
      return reply.send(await reintentarEnvio(pool, req.tenantId, id))
    } catch (err) {
      return responderError(reply, err)
    }
  })

  // El PDF guardado en el pedido (se baja de Mifact la primera vez, o con ?actualizar=1).
  app.get('/api/dashboard/comprobantes/:id/pdf', pre, async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params)
    const { actualizar } = z.object({ actualizar: z.enum(['1', 'true']).optional() }).parse(req.query)
    try {
      const { pdf, nombreArchivo } = await descargarPdf(pool, req.tenantId, id, { actualizar: !!actualizar })
      reply.header('Content-Type', 'application/pdf')
      reply.header('Content-Disposition', `inline; filename="${nombreArchivo}"`)
      return reply.send(pdf)
    } catch (err) {
      return responderError(reply, err)
    }
  })

  app.post('/api/dashboard/comprobantes/:id/anular', pre, async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params)
    const { motivo } = z.object({ motivo: z.string().max(300) }).strict().parse(req.body)
    try {
      return reply.send(await anularComprobante(pool, req.tenantId, id, { motivo, usuarioId: req.operador?.id ?? null }))
    } catch (err) {
      return responderError(reply, err)
    }
  })

  app.post('/api/dashboard/comprobantes/:id/correo', pre, async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params)
    const { correo } = z.object({ correo: z.string().max(200) }).strict().parse(req.body)
    try {
      return reply.send(await enviarCorreoComprobante(pool, req.tenantId, id, correo))
    } catch (err) {
      return responderError(reply, err)
    }
  })
}

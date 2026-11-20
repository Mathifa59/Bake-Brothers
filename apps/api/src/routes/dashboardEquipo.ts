import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { verificarJwtOperador } from '../auth/verificarJwtOperador.js'
import { soloAdmin } from '../auth/soloAdmin.js'
import { SupabaseAdminNoConfigurado } from '../auth/supabaseAdmin.js'
import {
  cambiarContrasena,
  crearCuenta,
  desactivarCuenta,
  editarCuenta,
  ErrorEquipo,
  listarAuditoria,
  listarEquipo,
  reactivarCuenta,
} from '../services/equipo.js'

/**
 * Equipo (cuentas del panel): SOLO Administración. Cada ruta pasa por verificarJwtOperador (JWT real) y soloAdmin (el rol
 * sale de usuarios_dashboard, nunca de lo que mande el navegador): un no administrador recibe 403 antes de que se mire
 * siquiera si la llave de Supabase está configurada. Las rutas que escriben llevan un límite de intentos propio.
 */
const idSchema = z.object({ id: z.string().uuid() })
const uuidONull = z.string().uuid().nullable()

const crearSchema = z.object({
  nombre: z.string().trim().min(1).max(80),
  usuario: z.string().trim().max(60).optional(),
  correo: z.string().trim().max(200).optional(),
  password: z.string().max(200).optional(),
  invitar: z.boolean().optional(),
  perfiles: z.array(z.string().max(40)).max(10),
  sedeId: uuidONull.default(null),
  avisaOrdenes: z.boolean().default(false),
  avisaPagos: z.boolean().default(false),
  esEncargado: z.boolean().default(false),
})

const editarSchema = z
  .object({
    nombre: z.string().trim().min(1).max(80),
    perfiles: z.array(z.string().max(40)).max(10),
    sedeId: uuidONull,
    avisaOrdenes: z.boolean(),
    avisaPagos: z.boolean(),
    esEncargado: z.boolean(),
  })
  .partial()
  .strict()

const passwordSchema = z.object({ password: z.string().max(200) })
const auditoriaSchema = z.object({
  objetivoId: z.string().uuid().optional(),
  limite: z.coerce.number().int().min(1).max(200).default(50),
  desde: z.coerce.number().int().min(0).default(0),
})

const limiteDeEscritura = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }

function responderError(reply: FastifyReply, err: unknown) {
  if (err instanceof ErrorEquipo) return reply.code(err.estado).send({ error: err.codigo, detalle: err.message })
  if (err instanceof SupabaseAdminNoConfigurado)
    return reply.code(503).send({ error: 'EQUIPO_NO_CONFIGURADO', detalle: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.' })
  throw err
}

export function dashboardEquipoRoutes(app: FastifyInstance) {
  const pre = [verificarJwtOperador, soloAdmin]

  app.get('/api/dashboard/equipo', { preHandler: pre }, async (_req, reply) => {
    return reply.code(200).send(await listarEquipo())
  })

  app.post('/api/dashboard/equipo', { preHandler: pre, ...limiteDeEscritura }, async (req, reply) => {
    const datos = crearSchema.parse(req.body)
    try {
      const r = await crearCuenta(req.operador!.id, datos)
      return reply.code(201).send({ ok: true, ...r })
    } catch (err) {
      return responderError(reply, err)
    }
  })

  app.patch('/api/dashboard/equipo/:id', { preHandler: pre, ...limiteDeEscritura }, async (req, reply) => {
    const { id } = idSchema.parse(req.params)
    const cambios = editarSchema.parse(req.body)
    try {
      await editarCuenta(req.operador!.id, id, cambios)
      return reply.code(200).send({ ok: true })
    } catch (err) {
      return responderError(reply, err)
    }
  })

  app.post('/api/dashboard/equipo/:id/password', { preHandler: pre, ...limiteDeEscritura }, async (req, reply) => {
    const { id } = idSchema.parse(req.params)
    const { password } = passwordSchema.parse(req.body)
    try {
      await cambiarContrasena(req.operador!.id, id, password)
      return reply.code(200).send({ ok: true })
    } catch (err) {
      return responderError(reply, err)
    }
  })

  app.post('/api/dashboard/equipo/:id/desactivar', { preHandler: pre, ...limiteDeEscritura }, async (req, reply) => {
    const { id } = idSchema.parse(req.params)
    try {
      const r = await desactivarCuenta(req.operador!.id, id)
      return reply.code(200).send({ ok: true, ...r })
    } catch (err) {
      return responderError(reply, err)
    }
  })

  app.post('/api/dashboard/equipo/:id/reactivar', { preHandler: pre, ...limiteDeEscritura }, async (req, reply) => {
    const { id } = idSchema.parse(req.params)
    try {
      await reactivarCuenta(req.operador!.id, id)
      return reply.code(200).send({ ok: true })
    } catch (err) {
      return responderError(reply, err)
    }
  })

  app.get('/api/dashboard/equipo/auditoria', { preHandler: pre }, async (req, reply) => {
    const q = auditoriaSchema.parse(req.query)
    return reply.code(200).send({ registros: await listarAuditoria(q) })
  })
}

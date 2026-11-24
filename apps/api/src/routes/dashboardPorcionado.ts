import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { exigirPerfil, exigirPuedePorcionar, veTodosLosLocalesEn, verificarJwtOperador } from '../auth/verificarJwtOperador.js'
import { soloAdmin } from '../auth/soloAdmin.js'
import { ErrorPorcionado, listarPorcionados, porcionar, revertirPorcionado } from '../services/porcionado.js'

/**
 * Porcionado de Stock. Porcionar: Administración, o Caja marcada como «Encargado», en su propio local (Administración elige
 * el local). Ver el historial y revertir: solo Administración. El local sale de la cuenta, nunca de lo que mande el navegador.
 */
const porcionarSchema = z.object({
  reglaId: z.string().uuid(),
  enteras: z.number().int().min(1).max(200),
  sedeId: z.string().uuid().optional(),
})
const revertirSchema = z.object({ motivo: z.string().trim().max(300).optional() })
const idSchema = z.object({ id: z.string().uuid() })
const listaSchema = z.object({
  sedeId: z.string().uuid().optional(),
  limite: z.coerce.number().int().min(1).max(200).default(50),
  desde: z.coerce.number().int().min(0).default(0),
})

function responderError(reply: FastifyReply, err: unknown) {
  if (err instanceof ErrorPorcionado) return reply.code(err.estado).send({ error: err.codigo, detalle: err.message })
  throw err
}

export function dashboardPorcionadoRoutes(app: FastifyInstance) {
  app.post(
    '/api/dashboard/stock/porcionar',
    {
      preHandler: [verificarJwtOperador, exigirPerfil('caja', 'empleado_temporal'), exigirPuedePorcionar],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const cuerpo = porcionarSchema.parse(req.body)
      const operador = req.operador!
      let sedeId: string
      if (veTodosLosLocalesEn(operador, 'stock')) {
        if (!cuerpo.sedeId) return reply.code(400).send({ error: 'SEDE_REQUERIDA', detalle: 'Elige el local donde se porciona.' })
        sedeId = cuerpo.sedeId
      } else {
        if (!operador.sedeId) return reply.code(403).send({ error: 'SIN_SEDE_ASIGNADA' })
        sedeId = operador.sedeId
      }
      try {
        const r = await porcionar(operador.id, { sedeId, reglaId: cuerpo.reglaId, enteras: cuerpo.enteras })
        return reply.code(201).send({ ok: true, ...r })
      } catch (err) {
        return responderError(reply, err)
      }
    }
  )

  app.get('/api/dashboard/porcionados', { preHandler: [verificarJwtOperador, soloAdmin] }, async (req, reply) => {
    const q = listaSchema.parse(req.query)
    return reply.code(200).send({ porcionados: await listarPorcionados(q) })
  })

  app.post('/api/dashboard/porcionados/:id/revertir', { preHandler: [verificarJwtOperador, soloAdmin] }, async (req, reply) => {
    const { id } = idSchema.parse(req.params)
    const { motivo } = revertirSchema.parse(req.body ?? {})
    try {
      const r = await revertirPorcionado(req.operador!.id, id, motivo || null)
      return reply.code(200).send({ ok: true, ...r })
    } catch (err) {
      return responderError(reply, err)
    }
  })
}

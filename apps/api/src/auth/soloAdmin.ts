import type { FastifyReply, FastifyRequest } from 'fastify'

/**
 * preHandler para rutas que solo puede usar un admin (después de
 * verificarJwtOperador, que fija `req.operador` a partir del JWT real y de
 * `usuarios_dashboard` — nunca de lo que mande el navegador).
 */
export async function soloAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (req.operador?.rol !== 'admin') {
    return reply.code(403).send({ error: 'SOLO_ADMIN' })
  }
}

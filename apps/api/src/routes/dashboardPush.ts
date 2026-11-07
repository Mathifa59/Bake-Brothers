import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { pool } from '../db.js'
import { verificarJwtOperador } from '../auth/verificarJwtOperador.js'
import { enviarPush, leerConfigVapid, type SuscripcionPush } from '../services/avisos.js'

/**
 * Notificaciones push del panel (Web Push): cada persona activa los avisos en su celular y la API guarda las llaves
 * de ese dispositivo. Todas exigen el JWT real del operador (verificarJwtOperador); a quién pertenece una
 * suscripción sale del token, nunca de lo que mande el navegador.
 */
const suscripcionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
  userAgent: z.string().max(400).nullish(),
})
const desuscripcionSchema = z.object({ endpoint: z.string().url().max(2000) })

export function dashboardPushRoutes(app: FastifyInstance) {
  // La clave PÚBLICA de VAPID: el navegador la necesita para suscribirse. No es secreta, pero se sirve desde acá
  // (no se compila en el panel) para poder cambiarla o activarla sin redeploy del panel.
  app.get('/api/dashboard/push/clave', { preHandler: verificarJwtOperador }, async (_req, reply) => {
    const vapid = leerConfigVapid()
    if (!vapid) return reply.code(503).send({ error: 'PUSH_NO_CONFIGURADO' })
    return reply.code(200).send({ clave: vapid.publica })
  })

  app.post('/api/dashboard/push/suscribir', { preHandler: verificarJwtOperador }, async (req, reply) => {
    const cuerpo = suscripcionSchema.parse(req.body)
    const operador = req.operador!
    // Un mismo dispositivo (endpoint) es de quien lo activó la última vez: si otra persona entra en ese celular,
    // la suscripción pasa a ella (no recibe los avisos de la anterior).
    await pool.query(
      `insert into push_suscripciones (usuario_id, endpoint, p256dh, auth, user_agent)
       values ($1, $2, $3, $4, $5)
       on conflict (endpoint) do update
         set usuario_id = excluded.usuario_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`,
      [operador.id, cuerpo.endpoint, cuerpo.keys.p256dh, cuerpo.keys.auth, cuerpo.userAgent ?? null]
    )
    return reply.code(200).send({ ok: true })
  })

  app.post('/api/dashboard/push/desuscribir', { preHandler: verificarJwtOperador }, async (req, reply) => {
    const { endpoint } = desuscripcionSchema.parse(req.body)
    const operador = req.operador!
    await pool.query(`delete from push_suscripciones where endpoint = $1 and usuario_id = $2`, [endpoint, operador.id])
    return reply.code(200).send({ ok: true })
  })

  // Un aviso de prueba a los dispositivos de quien lo pide: así se comprueba, con el celular bloqueado, que llega.
  app.post('/api/dashboard/push/probar', { preHandler: verificarJwtOperador }, async (req, reply) => {
    if (!leerConfigVapid()) return reply.code(503).send({ error: 'PUSH_NO_CONFIGURADO' })
    const operador = req.operador!
    const { rows } = await pool.query(
      `select id, usuario_id, endpoint, p256dh, auth from push_suscripciones where usuario_id = $1`,
      [operador.id]
    )
    if (rows.length === 0) return reply.code(409).send({ error: 'SIN_DISPOSITIVOS' })
    const suscripciones: SuscripcionPush[] = rows.map((r) => ({
      id: r.id,
      usuarioId: r.usuario_id,
      endpoint: r.endpoint,
      p256dh: r.p256dh,
      auth: r.auth,
    }))
    const resultado = await enviarPush(pool, req.log, suscripciones, {
      titulo: 'Bake OS: aviso de prueba',
      cuerpo: 'Así te va a llegar cada mensaje nuevo, aunque tengas el celular bloqueado.',
      url: '/#/ajustes',
      tag: 'prueba',
      tipo: 'prueba',
    })
    return reply.code(200).send(resultado)
  })
}

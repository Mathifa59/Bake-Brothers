import type { FastifyReply, FastifyRequest } from 'fastify'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { pool } from '../db.js'

/**
 * Puente apps/admin → apps/api: verifica el JWT real del operador logueado
 * (Supabase Auth) antes de aceptar cualquier escritura sensible — nunca se
 * confía en rol/sede_id que mande el propio cliente.
 *
 * El proyecto firma con clave asimétrica (ES256) — se verifica contra el
 * JWKS público de Supabase, sin ningún secreto compartido que manejar acá
 * (confirmado real: `curl` contra ese endpoint devuelve la clave pública
 * real del proyecto, no algo que haga falta guardar).
 */
const SUPABASE_URL = 'https://umyaytrojtbdvdzbrily.supabase.co'
const JWKS = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`))

export interface OperadorAutenticado {
  id: string
  rol: 'admin' | 'operador'
  sedeId: string | null
}

declare module 'fastify' {
  interface FastifyRequest {
    operador?: OperadorAutenticado
  }
}

/**
 * preHandler para rutas del dashboard. Verifica la firma+vigencia del JWT,
 * y con el `sub` ya verificado (no antes) resuelve rol/sede_id reales
 * consultando `usuarios_dashboard` con la conexión de confianza de
 * `app_api` (0021) — no vía RLS del propio usuario, porque acá quien decide
 * la autorización es este código, no Postgres.
 */
export async function verificarJwtOperador(req: FastifyRequest, reply: FastifyReply) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'NO_AUTORIZADO' })
  }
  const token = auth.slice('Bearer '.length)

  let sub: string
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: `${SUPABASE_URL}/auth/v1` })
    if (typeof payload.sub !== 'string') throw new Error('token sin sub')
    sub = payload.sub
  } catch {
    return reply.code(401).send({ error: 'TOKEN_INVALIDO' })
  }

  const { rows } = await pool.query<{ rol: string; sede_id: string | null }>(
    `select rol, sede_id from usuarios_dashboard where id = $1`,
    [sub]
  )
  const fila = rows[0]
  if (!fila || (fila.rol !== 'admin' && fila.rol !== 'operador')) {
    return reply.code(403).send({ error: 'SIN_ACCESO_AL_PANEL' })
  }

  req.operador = { id: sub, rol: fila.rol, sedeId: fila.sede_id }
}

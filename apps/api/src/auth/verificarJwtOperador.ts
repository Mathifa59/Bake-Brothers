import type { FastifyReply, FastifyRequest } from 'fastify'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { esAdministracion, perfilesEfectivos, puedePorcionar, tienePerfil, veTodosLosLocales, type AreaDeLocal, type Perfil } from '@bakebrothers/domain'
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
  /** Derivado de los perfiles: 'admin' si y solo si tiene Administración. */
  rol: 'admin' | 'operador'
  sedeId: string | null
  /** Perfiles de la cuenta (0054). Sin la migración, se derivan del rol. */
  perfiles: Perfil[]
  /** Permiso «Encargado» (0056): puede porcionar en Stock, además de su perfil. Administración puede sin serlo. */
  esEncargado?: boolean
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

  const fila = await leerCuenta(sub)
  if (!fila || (fila.rol !== 'admin' && fila.rol !== 'operador')) {
    return reply.code(403).send({ error: 'SIN_ACCESO_AL_PANEL' })
  }
  // Cuenta desactivada desde Equipo (0056): su sesión (JWT) puede seguir vigente hasta 1 h, pero la API ya no la atiende.
  if (fila.activo === false) {
    return reply.code(403).send({ error: 'CUENTA_DESACTIVADA' })
  }

  req.operador = {
    id: sub,
    rol: fila.rol,
    sedeId: fila.sede_id,
    perfiles: perfilesEfectivos(fila.rol, fila.perfiles),
    esEncargado: fila.es_encargado === true,
  }
}

/**
 * Rol, local, perfiles y estado de la cuenta. La API puede desplegarse antes que las migraciones 0054 (columna
 * `perfiles`, 42703) o 0056 (columna `activo`): se lee con las columnas que existan y lo que falte se deriva
 * (perfiles del rol; activo = true). Nadie queda sin acceso por el orden del deploy.
 */
async function leerCuenta(
  id: string
): Promise<{ rol: string; sede_id: string | null; perfiles: string[] | null; activo: boolean | null; es_encargado: boolean | null } | undefined> {
  const intentos = [
    `select rol, sede_id, perfiles, activo, es_encargado from usuarios_dashboard where id = $1`,
    `select rol, sede_id, perfiles, activo from usuarios_dashboard where id = $1`,
    `select rol, sede_id, perfiles from usuarios_dashboard where id = $1`,
    `select rol, sede_id from usuarios_dashboard where id = $1`,
  ]
  for (let i = 0; i < intentos.length; i++) {
    try {
      const { rows } = await pool.query(intentos[i], [id])
      return rows[0] ? { perfiles: null, activo: null, es_encargado: null, ...rows[0] } : undefined
    } catch (err) {
      if ((err as { code?: string }).code !== '42703' || i === intentos.length - 1) throw err
    }
  }
  return undefined
}

/** preHandler adicional, SIEMPRE después de verificarJwtOperador: solo admin (ej. conectar números de WhatsApp). El rol sale de usuarios_dashboard, nunca del cliente. */
export async function exigirAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (req.operador?.rol !== 'admin') {
    return reply.code(403).send({ error: 'SOLO_ADMIN' })
  }
}

/**
 * preHandler: la cuenta tiene que tener alguno de estos perfiles (Administración cuenta siempre). SIEMPRE después de
 * verificarJwtOperador. Es la barrera de la API; la de los datos es la RLS (0054).
 */
export function exigirPerfil(...perfiles: Perfil[]) {
  return async function exigirPerfilDe(req: FastifyRequest, reply: FastifyReply) {
    if (!tienePerfil(req.operador?.perfiles, ...perfiles)) {
      return reply.code(403).send({ error: 'SIN_PERFIL_PARA_ESTA_ACCION' })
    }
  }
}

/** preHandler: solo quien puede porcionar (Administración, o Caja marcada como Encargado). SIEMPRE después de verificarJwtOperador. */
export async function exigirPuedePorcionar(req: FastifyRequest, reply: FastifyReply) {
  if (!puedePorcionar(req.operador?.perfiles, req.operador?.esEncargado)) {
    return reply.code(403).send({ error: 'SOLO_ENCARGADOS', detalle: 'Solo Administración y las encargadas de turno pueden porcionar.' })
  }
}

/** ¿Esta cuenta trabaja sin filtro de local en esta área? (Administración, Venta digital en conversaciones, Órdenes en órdenes…) */
export const veTodosLosLocalesEn = (operador: OperadorAutenticado, area: AreaDeLocal): boolean => veTodosLosLocales(operador.perfiles, area)

export { esAdministracion }

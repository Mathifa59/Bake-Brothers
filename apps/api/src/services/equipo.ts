/**
 * Gestión del equipo (pantalla Equipo, solo Administración): crear, editar, cambiar contraseña, desactivar y reactivar
 * cuentas del panel, con registro de auditoría. Nunca se borra una cuenta (queda el historial).
 *
 * Dónde está cada garantía:
 *   · Quién puede llamar esto: las rutas (verificarJwtOperador + soloAdmin). Este módulo asume un administrador.
 *   · Que quede siempre un administrador activo y que nadie se quite a sí mismo Administración: la base (trigger
 *     usuarios_dashboard_zguardias, 0056) — y este módulo lo valida ANTES para dar un mensaje claro.
 *   · La auditoría la escribe un trigger de la base (usuarios_dashboard_auditar) con el actor que fijamos acá con
 *     set_config('app.actor_id'). Las contraseñas no se guardan en ningún lado (solo "cambió la contraseña").
 *   · La cuenta en Supabase Auth se crea/bloquea con la llave de servicio (auth/supabaseAdmin.ts).
 */
import type pg from 'pg'
import {
  correoInterno,
  esCorreoInterno,
  esCorreoValido,
  PERFILES,
  validarContrasena,
  validarUsuario,
  type Perfil,
} from '@bakebrothers/domain'
import { pool } from '../db.js'
import { env } from '../env.js'
import {
  bloquearUsuarioAuth,
  borrarUsuarioAuth,
  cambiarContrasenaAuth,
  crearUsuarioAuth,
  ErrorSupabaseAuth,
  invitarUsuarioAuth,
  listarUsuariosAuth,
  supabaseAdminConfigurado,
  type UsuarioAuth,
} from '../auth/supabaseAdmin.js'

/** Error de negocio con código estable (la ruta lo traduce a la respuesta HTTP). */
export class ErrorEquipo extends Error {
  constructor(
    public readonly estado: number,
    public readonly codigo: string,
    mensaje: string
  ) {
    super(mensaje)
    this.name = 'ErrorEquipo'
  }
}

/** Perfiles que se pueden asignar a una cuenta NUEVA. `empleado_temporal` es transitorio: solo lo tienen las dos cuentas viejas. */
export const PERFILES_ASIGNABLES = PERFILES.filter((p) => p !== 'empleado_temporal') as Exclude<Perfil, 'empleado_temporal'>[]
/** Perfiles que solo ven su local: sin local no verían nada. */
const PERFILES_DE_LOCAL: Perfil[] = ['caja', 'produccion']

export interface CuentaEquipo {
  id: string
  nombre: string | null
  usuario: string | null
  /** Correo con el que entra (el interno `usuario@equipo…` o el real). Null si no se pudo leer de Supabase Auth. */
  correo: string | null
  correoInterno: boolean
  perfiles: string[]
  sedeId: string | null
  sedeNombre: string | null
  avisaOrdenes: boolean
  avisaPagos: boolean
  esEncargado: boolean
  activo: boolean
  desactivadoEn: string | null
  creadoEn: string
  ultimoIngreso: string | null
}

interface FilaCuenta {
  id: string
  nombre: string | null
  usuario: string | null
  perfiles: string[]
  sede_id: string | null
  sede_nombre: string | null
  avisa_ordenes: boolean
  avisa_pagos: boolean
  es_encargado: boolean
  activo: boolean
  desactivado_en: Date | string | null
  creado_en: Date | string
}

const SELECT_CUENTAS = `
  select u.id, u.nombre, u.usuario, u.perfiles, u.sede_id, s.nombre as sede_nombre,
         u.avisa_ordenes, u.avisa_pagos, u.es_encargado, u.activo, u.desactivado_en, u.creado_en
    from usuarios_dashboard u
    left join sedes s on s.id = u.sede_id`

const iso = (v: Date | string | null): string | null => (v === null ? null : new Date(v).toISOString())

function aCuenta(f: FilaCuenta, auth?: UsuarioAuth): CuentaEquipo {
  const correo = auth?.email ?? null
  return {
    id: f.id,
    nombre: f.nombre,
    usuario: f.usuario,
    correo,
    correoInterno: correo ? esCorreoInterno(correo, env.DOMINIO_EQUIPO) : f.usuario !== null,
    perfiles: f.perfiles,
    sedeId: f.sede_id,
    sedeNombre: f.sede_nombre,
    avisaOrdenes: f.avisa_ordenes,
    avisaPagos: f.avisa_pagos,
    esEncargado: f.es_encargado,
    activo: f.activo,
    desactivadoEn: iso(f.desactivado_en),
    creadoEn: iso(f.creado_en)!,
    ultimoIngreso: auth?.ultimoIngreso ?? null,
  }
}

/** Transacción que le dice a la base QUIÉN hace el cambio (la auditoría y la guardia de «no quitarte Administración» lo leen). */
async function conActor<T>(actorId: string, fn: (db: pg.PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect()
  try {
    await db.query('begin')
    await db.query(`select set_config('app.actor_id', $1, true)`, [actorId])
    const r = await fn(db)
    await db.query('commit')
    return r
  } catch (err) {
    await db.query('rollback').catch(() => {})
    throw err
  } finally {
    db.release()
  }
}

/** Errores de la base (guardias y unicidad) → errores de negocio con mensaje claro. */
function traducirErrorDeBase(err: unknown): never {
  const e = err as { code?: string; hint?: string; constraint?: string }
  if (e.hint === 'ULTIMO_ADMINISTRADOR')
    throw new ErrorEquipo(409, 'ULTIMO_ADMINISTRADOR', 'Tiene que quedar al menos un administrador activo.')
  if (e.hint === 'NO_PUEDES_QUITARTE_ADMINISTRACION')
    throw new ErrorEquipo(409, 'NO_PUEDES_QUITARTE_ADMINISTRACION', 'No puedes quitarte Administración ni desactivar tu propia cuenta.')
  if (e.code === '23505' && e.constraint === 'usuarios_dashboard_usuario_unico')
    throw new ErrorEquipo(409, 'USUARIO_EN_USO', 'Ese usuario ya existe.')
  throw err
}

function traducirErrorDeAuth(err: unknown): never {
  if (err instanceof ErrorSupabaseAuth) {
    if (['email_exists', 'user_already_exists'].includes(err.codigo))
      throw new ErrorEquipo(409, 'CORREO_EN_USO', 'Ya existe una cuenta con ese correo o usuario.')
    if (err.codigo === 'weak_password') throw new ErrorEquipo(400, 'CONTRASENA_DEBIL', 'Supabase rechazó la contraseña por débil. Prueba con otra más larga.')
    if (err.codigo === 'email_address_invalid')
      throw new ErrorEquipo(400, 'CORREO_NO_ACEPTADO', 'Supabase no aceptó ese correo.')
    throw new ErrorEquipo(502, 'AUTH_ERROR', `Supabase Auth respondió con un error (${err.codigo}).`)
  }
  throw err
}

function exigirAuthConfigurado() {
  if (!supabaseAdminConfigurado()) throw new ErrorEquipo(503, 'EQUIPO_NO_CONFIGURADO', 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.')
}

async function validarSede(sedeId: string | null) {
  if (sedeId === null) return
  const { rows } = await pool.query(`select 1 from sedes where id = $1 and activo`, [sedeId])
  if (rows.length === 0) throw new ErrorEquipo(400, 'SEDE_NO_VALIDA', 'Ese local no existe o está inactivo.')
}

function validarPerfilesYLocal(perfiles: string[], sedeId: string | null, permitirTransitorio: boolean) {
  if (perfiles.length === 0) throw new ErrorEquipo(400, 'PERFILES_REQUERIDOS', 'Elige al menos un perfil.')
  const validos = permitirTransitorio ? (PERFILES as readonly string[]) : (PERFILES_ASIGNABLES as readonly string[])
  const invalido = perfiles.find((p) => !validos.includes(p))
  if (invalido) throw new ErrorEquipo(400, 'PERFIL_NO_VALIDO', `El perfil «${invalido}» no se puede asignar.`)
  if (!perfiles.includes('administracion') && sedeId === null && perfiles.some((p) => PERFILES_DE_LOCAL.includes(p as Perfil)))
    throw new ErrorEquipo(400, 'SEDE_REQUERIDA', 'Caja y Producción trabajan en un local: elige cuál.')
}

// ———————————————————————————————————————————————————————————————— lista ————

export async function listarEquipo(): Promise<{ cuentas: CuentaEquipo[]; authDisponible: boolean }> {
  const { rows } = await pool.query<FilaCuenta>(`${SELECT_CUENTAS} order by u.activo desc, u.creado_en`)
  let porId = new Map<string, UsuarioAuth>()
  let authDisponible = false
  if (supabaseAdminConfigurado()) {
    try {
      porId = new Map((await listarUsuariosAuth()).map((u) => [u.id, u]))
      authDisponible = true
    } catch {
      // La lista sigue sirviendo sin correo ni último ingreso; el panel lo avisa.
    }
  }
  return { cuentas: rows.map((f) => aCuenta(f, porId.get(f.id))), authDisponible }
}

// ———————————————————————————————————————————————————————————————— crear ————

export interface DatosNuevaCuenta {
  nombre: string
  /** Una de las dos: usuario (correo interno) o correo real. */
  usuario?: string
  correo?: string
  password?: string
  /** Manda la invitación por correo (Resend) en vez de fijar contraseña. Solo cuentas de Administración. */
  invitar?: boolean
  perfiles: string[]
  sedeId: string | null
  avisaOrdenes: boolean
  avisaPagos: boolean
  esEncargado: boolean
}

export async function crearCuenta(actorId: string, d: DatosNuevaCuenta): Promise<{ id: string; correo: string; invitada: boolean }> {
  exigirAuthConfigurado()
  if (!!d.usuario === !!d.correo) throw new ErrorEquipo(400, 'USUARIO_O_CORREO', 'Indica el usuario o el correo real, no los dos ni ninguno.')
  const nombre = d.nombre.trim()
  if (!nombre) throw new ErrorEquipo(400, 'NOMBRE_REQUERIDO', 'Escribe el nombre de la persona.')
  validarPerfilesYLocal(d.perfiles, d.sedeId, false)
  await validarSede(d.sedeId)

  let usuario: string | null = null
  let correo: string
  if (d.usuario) {
    const v = validarUsuario(d.usuario)
    if (!v.ok) throw new ErrorEquipo(400, 'USUARIO_NO_VALIDO', v.motivo)
    usuario = v.usuario
    correo = correoInterno(usuario, env.DOMINIO_EQUIPO)
    const { rows } = await pool.query(`select 1 from usuarios_dashboard where usuario = $1`, [usuario])
    if (rows.length > 0) throw new ErrorEquipo(409, 'USUARIO_EN_USO', 'Ese usuario ya existe.')
  } else {
    correo = d.correo!.trim().toLowerCase()
    if (!esCorreoValido(correo)) throw new ErrorEquipo(400, 'CORREO_NO_VALIDO', 'El correo no tiene un formato válido.')
    if (esCorreoInterno(correo, env.DOMINIO_EQUIPO))
      throw new ErrorEquipo(400, 'CORREO_NO_VALIDO', 'Ese es el dominio interno del equipo: usa «Usuario» en vez de correo.')
  }

  const invitar = d.invitar === true
  if (invitar) {
    if (!d.correo) throw new ErrorEquipo(400, 'INVITAR_REQUIERE_CORREO', 'La invitación por correo necesita un correo real.')
    if (!d.perfiles.includes('administracion'))
      throw new ErrorEquipo(400, 'INVITAR_SOLO_ADMINISTRADORES', 'Las invitaciones por correo son solo para administradores.')
  } else {
    const p = validarContrasena(d.password ?? '')
    if (!p.ok) throw new ErrorEquipo(400, 'CONTRASENA_NO_VALIDA', p.motivo)
  }

  let authUser: UsuarioAuth
  try {
    authUser = invitar
      ? await invitarUsuarioAuth({ email: correo, redirectTo: env.URL_PANEL })
      : await crearUsuarioAuth({ email: correo, password: d.password! })
  } catch (err) {
    traducirErrorDeAuth(err)
  }

  try {
    await conActor(actorId, async (db) => {
      await db.query(
        `insert into usuarios_dashboard (id, rol, sede_id, perfiles, nombre, usuario, avisa_ordenes, avisa_pagos, es_encargado, activo)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)`,
        [
          authUser.id,
          d.perfiles.includes('administracion') ? 'admin' : 'operador',
          d.sedeId,
          d.perfiles,
          nombre,
          usuario,
          d.avisaOrdenes,
          d.avisaPagos,
          d.esEncargado,
        ]
      )
      if (invitar)
        await db.query(
          `insert into equipo_auditoria (actor_id, actor_nombre, accion, objetivo_id, objetivo_nombre, detalle)
           values ($1, (select coalesce(nombre, usuario) from usuarios_dashboard where id = $1), 'invitar', $2, $3, $4)`,
          [actorId, authUser.id, nombre, JSON.stringify({ correo })]
        )
    })
  } catch (err) {
    // La cuenta se creó en Auth pero no quedó en Bake OS: se deshace para no dejar una cuenta huérfana (que además
    // bloquearía volver a usar ese usuario). Si el deshacer falla, queda el id en el log para limpiarla a mano.
    await borrarUsuarioAuth(authUser.id).catch((e) =>
      console.error(`[equipo] No se pudo deshacer la cuenta de Auth ${authUser.id} tras un fallo al crearla:`, e instanceof Error ? e.message : e)
    )
    traducirErrorDeBase(err)
  }
  return { id: authUser.id, correo, invitada: invitar }
}

// ———————————————————————————————————————————————————————————————— editar ————

export interface CambiosCuenta {
  nombre?: string
  perfiles?: string[]
  sedeId?: string | null
  avisaOrdenes?: boolean
  avisaPagos?: boolean
  esEncargado?: boolean
}

async function leerCuenta(id: string): Promise<FilaCuenta> {
  const { rows } = await pool.query<FilaCuenta>(`${SELECT_CUENTAS} where u.id = $1`, [id])
  if (!rows[0]) throw new ErrorEquipo(404, 'CUENTA_NO_ENCONTRADA', 'Esa cuenta no existe.')
  return rows[0]
}

export async function editarCuenta(actorId: string, id: string, c: CambiosCuenta): Promise<void> {
  const actual = await leerCuenta(id)

  const perfiles = c.perfiles ?? actual.perfiles
  const sedeId = c.sedeId === undefined ? actual.sede_id : c.sedeId
  if (c.perfiles !== undefined || c.sedeId !== undefined) {
    // Quien ya tiene el perfil transitorio puede conservarlo; nadie nuevo lo recibe.
    const conserva = actual.perfiles.includes('empleado_temporal')
    validarPerfilesYLocal(perfiles, sedeId, conserva)
    if (!conserva && perfiles.includes('empleado_temporal')) throw new ErrorEquipo(400, 'PERFIL_NO_VALIDO', 'El perfil «empleado_temporal» no se puede asignar.')
  }
  if (c.sedeId !== undefined) await validarSede(c.sedeId)
  if (id === actorId && c.perfiles !== undefined && !c.perfiles.includes('administracion'))
    throw new ErrorEquipo(409, 'NO_PUEDES_QUITARTE_ADMINISTRACION', 'No puedes quitarte Administración ni desactivar tu propia cuenta.')
  if (c.nombre !== undefined && !c.nombre.trim()) throw new ErrorEquipo(400, 'NOMBRE_REQUERIDO', 'Escribe el nombre de la persona.')

  const sets: string[] = []
  const valores: unknown[] = [id]
  const poner = (columna: string, valor: unknown) => {
    valores.push(valor)
    sets.push(`${columna} = $${valores.length}`)
  }
  if (c.nombre !== undefined) poner('nombre', c.nombre.trim())
  if (c.perfiles !== undefined) {
    poner('perfiles', c.perfiles)
    poner('rol', c.perfiles.includes('administracion') ? 'admin' : 'operador')
  }
  if (c.sedeId !== undefined) poner('sede_id', c.sedeId)
  if (c.avisaOrdenes !== undefined) poner('avisa_ordenes', c.avisaOrdenes)
  if (c.avisaPagos !== undefined) poner('avisa_pagos', c.avisaPagos)
  if (c.esEncargado !== undefined) poner('es_encargado', c.esEncargado)
  if (sets.length === 0) return

  try {
    await conActor(actorId, (db) => db.query(`update usuarios_dashboard set ${sets.join(', ')} where id = $1`, valores))
  } catch (err) {
    traducirErrorDeBase(err)
  }
}

// ———————————————————————————————————————————————————————————————— contraseña ————

export async function cambiarContrasena(actorId: string, id: string, password: string): Promise<void> {
  exigirAuthConfigurado()
  const v = validarContrasena(password)
  if (!v.ok) throw new ErrorEquipo(400, 'CONTRASENA_NO_VALIDA', v.motivo)
  const cuenta = await leerCuenta(id)
  try {
    await cambiarContrasenaAuth(id, password)
  } catch (err) {
    traducirErrorDeAuth(err)
  }
  // Se deja constancia de QUE se cambió; la contraseña no se guarda en ningún lado.
  await pool.query(
    `insert into equipo_auditoria (actor_id, actor_nombre, accion, objetivo_id, objetivo_nombre, detalle)
     values ($1, (select coalesce(nombre, usuario) from usuarios_dashboard where id = $1), 'cambiar_password', $2, $3, '{}'::jsonb)`,
    [actorId, id, cuenta.nombre ?? cuenta.usuario]
  )
}

// ———————————————————————————————————————————————————————————————— desactivar / reactivar ————

export async function desactivarCuenta(actorId: string, id: string): Promise<{ sesionBloqueada: boolean }> {
  exigirAuthConfigurado()
  if (id === actorId) throw new ErrorEquipo(409, 'NO_PUEDES_QUITARTE_ADMINISTRACION', 'No puedes quitarte Administración ni desactivar tu propia cuenta.')
  const actual = await leerCuenta(id)
  if (!actual.activo) return { sesionBloqueada: true }
  // Primero la base: desde este momento la cuenta no ve ningún dato, aunque su sesión siga vigente.
  try {
    await conActor(actorId, (db) => db.query(`update usuarios_dashboard set activo = false where id = $1`, [id]))
  } catch (err) {
    traducirErrorDeBase(err)
  }
  // Después se le bloquea el ingreso. Si esto falla la cuenta YA está desactivada en Bake OS; solo avisamos.
  try {
    await bloquearUsuarioAuth(id, true)
    return { sesionBloqueada: true }
  } catch (err) {
    console.error(`[equipo] Cuenta ${id} desactivada en Bake OS pero no se pudo bloquear su ingreso en Auth:`, err instanceof Error ? err.message : err)
    return { sesionBloqueada: false }
  }
}

export async function reactivarCuenta(actorId: string, id: string): Promise<void> {
  exigirAuthConfigurado()
  const actual = await leerCuenta(id)
  if (actual.activo) return
  // Primero se le devuelve el ingreso; si luego la base falla, la cuenta sigue inactiva (sin acceso a nada).
  try {
    await bloquearUsuarioAuth(id, false)
  } catch (err) {
    traducirErrorDeAuth(err)
  }
  await conActor(actorId, (db) => db.query(`update usuarios_dashboard set activo = true where id = $1`, [id]))
}

// ———————————————————————————————————————————————————————————————— auditoría ————

export interface RegistroAuditoria {
  id: number
  cuando: string
  actorId: string | null
  actorNombre: string | null
  accion: string
  objetivoId: string
  objetivoNombre: string | null
  detalle: Record<string, unknown>
}

export async function listarAuditoria(opciones: { objetivoId?: string; limite: number; desde: number }): Promise<RegistroAuditoria[]> {
  const { rows } = await pool.query(
    `select id, cuando, actor_id, actor_nombre, accion, objetivo_id, objetivo_nombre, detalle
       from equipo_auditoria
      where ($1::uuid is null or objetivo_id = $1::uuid)
      order by cuando desc, id desc
      limit $2 offset $3`,
    [opciones.objetivoId ?? null, opciones.limite, opciones.desde]
  )
  return rows.map((r) => ({
    id: Number(r.id),
    cuando: new Date(r.cuando).toISOString(),
    actorId: r.actor_id,
    actorNombre: r.actor_nombre,
    accion: r.accion,
    objetivoId: r.objetivo_id,
    objetivoNombre: r.objetivo_nombre,
    detalle: r.detalle ?? {},
  }))
}

/**
 * Cliente mínimo del API de ADMINISTRACIÓN de Supabase Auth (GoTrue). Es el ÚNICO lugar del repo que usa la llave de
 * servicio (`SUPABASE_SERVICE_ROLE_KEY`), que se salta toda la seguridad de Supabase (RLS incluida). Reglas:
 *   · la llave solo vive en Coolify (variable de entorno), nunca en el panel ni en git;
 *   · este módulo solo lo llaman las rutas de Equipo, DESPUÉS de verificarJwtOperador + soloAdmin;
 *   · la llave nunca se escribe en logs ni en mensajes de error (los errores de Supabase se resumen a un código);
 *   · se usa `fetch` directo (sin librería nueva): son seis llamadas.
 */
import { env } from '../env.js'

const URL_POR_DEFECTO = 'https://umyaytrojtbdvdzbrily.supabase.co'
const TIEMPO_MAXIMO_MS = 10_000
/** Equivale a «para siempre» para GoTrue (ban_duration usa duraciones de Go). */
const BLOQUEO_PERMANENTE = '876000h'

export interface UsuarioAuth {
  id: string
  email: string | null
  creadoEn: string | null
  ultimoIngreso: string | null
  confirmado: boolean
  bloqueadoHasta: string | null
}

/** Error legible de Supabase Auth: el código es el de GoTrue (email_exists, weak_password…), el mensaje no lleva secretos. */
export class ErrorSupabaseAuth extends Error {
  constructor(
    public readonly estado: number,
    public readonly codigo: string,
    mensaje: string
  ) {
    super(mensaje)
    this.name = 'ErrorSupabaseAuth'
  }
}

export class SupabaseAdminNoConfigurado extends Error {
  constructor() {
    super('SUPABASE_SERVICE_ROLE_KEY no está configurada')
    this.name = 'SupabaseAdminNoConfigurado'
  }
}

const baseUrl = () => (env.SUPABASE_URL ?? URL_POR_DEFECTO).replace(/\/+$/, '')
const llave = () => (env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()

export const supabaseAdminConfigurado = (): boolean => llave() !== ''

function cabeceras(): Record<string, string> {
  const k = llave()
  if (!k) throw new SupabaseAdminNoConfigurado()
  // La llave clásica (service_role) es un JWT y va en las dos cabeceras; las llaves nuevas (sb_secret_…) no son JWT y
  // solo van en `apikey`.
  return {
    apikey: k,
    ...(k.startsWith('eyJ') ? { Authorization: `Bearer ${k}` } : {}),
    'Content-Type': 'application/json',
  }
}

async function llamar(metodo: string, ruta: string, cuerpo?: unknown): Promise<unknown> {
  let respuesta: Response
  try {
    respuesta = await fetch(`${baseUrl()}${ruta}`, {
      method: metodo,
      headers: cabeceras(),
      ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    })
  } catch (err) {
    if (err instanceof SupabaseAdminNoConfigurado) throw err
    throw new ErrorSupabaseAuth(503, 'auth_inalcanzable', 'No se pudo hablar con Supabase Auth')
  }
  const texto = await respuesta.text()
  let json: unknown = null
  if (texto) {
    try {
      json = JSON.parse(texto)
    } catch {
      json = null
    }
  }
  if (!respuesta.ok) {
    const o = (json ?? {}) as { error_code?: string; code?: string | number; msg?: string; message?: string; error_description?: string }
    const codigo = String(o.error_code ?? (typeof o.code === 'string' ? o.code : '') ?? '') || `http_${respuesta.status}`
    // El mensaje de GoTrue no lleva la llave; igual se recorta para no arrastrar texto largo a los logs.
    const mensaje = String(o.msg ?? o.message ?? o.error_description ?? 'Error de Supabase Auth').slice(0, 200)
    throw new ErrorSupabaseAuth(respuesta.status, codigo, mensaje)
  }
  return json
}

interface UsuarioAuthCrudo {
  id: string
  email?: string | null
  created_at?: string | null
  last_sign_in_at?: string | null
  email_confirmed_at?: string | null
  confirmed_at?: string | null
  banned_until?: string | null
}

const aUsuario = (u: UsuarioAuthCrudo): UsuarioAuth => ({
  id: u.id,
  email: u.email ?? null,
  creadoEn: u.created_at ?? null,
  ultimoIngreso: u.last_sign_in_at ?? null,
  confirmado: !!(u.email_confirmed_at ?? u.confirmed_at),
  bloqueadoHasta: u.banned_until ?? null,
})

/** Crea la cuenta YA CONFIRMADA y con contraseña: no se manda ningún correo. */
export async function crearUsuarioAuth(datos: { email: string; password: string }): Promise<UsuarioAuth> {
  const u = (await llamar('POST', '/auth/v1/admin/users', { email: datos.email, password: datos.password, email_confirm: true })) as UsuarioAuthCrudo
  return aUsuario(u)
}

/** Invita por correo (Resend): crea la cuenta sin contraseña y manda el enlace «Define tu contraseña». Solo administradores. */
export async function invitarUsuarioAuth(datos: { email: string; redirectTo: string }): Promise<UsuarioAuth> {
  const u = (await llamar('POST', `/auth/v1/invite?redirect_to=${encodeURIComponent(datos.redirectTo)}`, { email: datos.email })) as UsuarioAuthCrudo
  return aUsuario(u)
}

export async function cambiarContrasenaAuth(id: string, password: string): Promise<void> {
  await llamar('PUT', `/auth/v1/admin/users/${encodeURIComponent(id)}`, { password })
}

/** Bloquea o desbloquea el inicio de sesión (la cuenta sigue existiendo). */
export async function bloquearUsuarioAuth(id: string, bloqueado: boolean): Promise<void> {
  await llamar('PUT', `/auth/v1/admin/users/${encodeURIComponent(id)}`, { ban_duration: bloqueado ? BLOQUEO_PERMANENTE : 'none' })
}

/** Solo para deshacer una creación a medias (la cuenta se creó en Auth pero no en la tabla). Nunca borra cuentas con historial. */
export async function borrarUsuarioAuth(id: string): Promise<void> {
  await llamar('DELETE', `/auth/v1/admin/users/${encodeURIComponent(id)}`)
}

/** Todas las cuentas de Auth (son pocas: se pagina de a 200 por seguridad). */
export async function listarUsuariosAuth(): Promise<UsuarioAuth[]> {
  const todos: UsuarioAuth[] = []
  for (let pagina = 1; pagina <= 20; pagina++) {
    const r = (await llamar('GET', `/auth/v1/admin/users?page=${pagina}&per_page=200`)) as { users?: UsuarioAuthCrudo[] }
    const lote = r?.users ?? []
    todos.push(...lote.map(aUsuario))
    if (lote.length < 200) break
  }
  return todos
}

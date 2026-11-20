/**
 * Cuentas del equipo creadas desde el panel (Equipo, solo Administración). Reglas puras que usan el panel (formulario y
 * pantalla de ingreso) y la API (validación del lado servidor), para que digan exactamente lo mismo.
 *
 * Una cuenta se identifica por un USUARIO (ej. `caja.cedros`). Por dentro, en Supabase Auth, su correo es
 * `usuario@equipo.bakebrothers.pe`: un correo interno que no recibe nada, ya confirmado, para que no se mande ningún
 * correo. Las cuentas con correo real (administradores) entran con ese correo.
 */
export const DOMINIO_EQUIPO_POR_DEFECTO = 'equipo.bakebrothers.pe'

/** Mismo formato que el `check` de la columna `usuarios_dashboard.usuario` (0056). */
export const FORMATO_USUARIO = /^[a-z0-9][a-z0-9._-]{2,29}$/

export const LARGO_MINIMO_CONTRASENA = 10
export const LARGO_MAXIMO_CONTRASENA = 72 // bcrypt (lo que usa Supabase Auth) ignora lo que pase de 72 bytes

/** Normaliza lo que alguien escribe como usuario: sin espacios alrededor y en minúsculas. */
export const normalizarUsuario = (texto: string): string => texto.trim().toLowerCase()

export function validarUsuario(texto: string): { ok: true; usuario: string } | { ok: false; motivo: string } {
  const usuario = normalizarUsuario(texto)
  if (usuario.includes('@')) return { ok: false, motivo: 'El usuario no lleva «@». Si la persona tiene correo real, usa la opción «Correo real».' }
  if (!FORMATO_USUARIO.test(usuario))
    return { ok: false, motivo: 'El usuario tiene de 3 a 30 caracteres: letras sin tilde, números, punto, guion o guion bajo, y empieza con letra o número.' }
  return { ok: true, usuario }
}

export function validarContrasena(texto: string): { ok: true } | { ok: false; motivo: string } {
  if (texto.length < LARGO_MINIMO_CONTRASENA) return { ok: false, motivo: `La contraseña debe tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres.` }
  if (new TextEncoder().encode(texto).length > LARGO_MAXIMO_CONTRASENA) return { ok: false, motivo: `La contraseña no puede pasar de ${LARGO_MAXIMO_CONTRASENA} caracteres.` }
  return { ok: true }
}

export const correoInterno = (usuario: string, dominio: string = DOMINIO_EQUIPO_POR_DEFECTO): string => `${normalizarUsuario(usuario)}@${dominio}`

/**
 * Lo que alguien escribe en «Usuario o correo» al entrar: con «@» es un correo; sin «@» es un usuario y se completa el
 * dominio interno.
 */
export function correoDeAcceso(entrada: string, dominio: string = DOMINIO_EQUIPO_POR_DEFECTO): string {
  const limpio = entrada.trim().toLowerCase()
  return limpio.includes('@') ? limpio : correoInterno(limpio, dominio)
}

/** ¿Este correo es el interno de una cuenta creada desde Equipo? (sirve para mostrar «usuario» en vez del correo) */
export const esCorreoInterno = (correo: string, dominio: string = DOMINIO_EQUIPO_POR_DEFECTO): boolean => correo.trim().toLowerCase().endsWith(`@${dominio}`)

/** Correo real: formato razonable, sin pretender validar todo el estándar (Supabase tiene la última palabra). */
export const esCorreoValido = (correo: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo.trim())

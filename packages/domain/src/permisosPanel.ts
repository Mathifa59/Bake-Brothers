/**
 * Qué ve y qué puede hacer cada persona en Bake OS. Una cuenta tiene uno o varios PERFILES y su acceso es la unión de
 * los perfiles. Lógica pura y compartida: el menú, las rutas del panel, la API y los tests usan esta misma tabla.
 * La barrera REAL de los datos vive en la base (RLS, migración 0054) y en la API (`exigirPerfil`); esto decide qué se
 * muestra, a dónde se redirige y a qué rutas deja entrar la API.
 *
 * Perfiles (lista del equipo, 2026-11-19):
 *  - administracion   Todo. Recibe avisos de pagos reportados (si la cuenta lo tiene activo).
 *  - caja             Pedidos (del día) y Stock, de su local.
 *  - venta_digital    Conversaciones, Pedidos, Nuevo pedido y Clientes (reducido). SIN filtro de local: atiende el
 *                     único WhatsApp de los dos locales, así que ve Cedros, Santa Marina y el delivery sin local.
 *  - ordenes          Órdenes (registrar e imprimir la hoja del día) y Unidades (salidas a calle). SIN filtro de local: ve todas las órdenes y
 *                     todos los mayoristas.
 *  - produccion       Producción y sus hojas para imprimir, de su local.
 *  - empleado_temporal  TRANSITORIO: el acceso de empleado que tenían las cuentas anteriores (adminalameda y
 *                     adminsantamaria) hasta que las cuentas nuevas estén probadas. Se retira junto con esas cuentas.
 *
 * `rol` en la base sigue existiendo y queda DERIVADO: 'admin' si y solo si la cuenta tiene el perfil administracion.
 */
export type RolPanel = 'admin' | 'operador'

export const PERFILES = ['administracion', 'caja', 'venta_digital', 'ordenes', 'produccion', 'empleado_temporal'] as const
export type Perfil = (typeof PERFILES)[number]

export const NOMBRE_DE_PERFIL: Record<Perfil, string> = {
  administracion: 'Administración',
  caja: 'Caja',
  venta_digital: 'Venta digital',
  ordenes: 'Órdenes',
  produccion: 'Producción y empaque',
  empleado_temporal: 'Empleado',
}

export const esPerfil = (valor: unknown): valor is Perfil => typeof valor === 'string' && (PERFILES as readonly string[]).includes(valor)

/** Rutas (sin «/») que abre cada perfil. Administración abre todas (ver `puedeVerRuta`). Ajustes y Avisos son de todos. */
export const RUTAS_COMUNES = ['ajustes', 'avisos'] as const
export const RUTAS_POR_PERFIL: Record<Exclude<Perfil, 'administracion'>, readonly string[]> = {
  caja: ['pedidos', 'stock'],
  venta_digital: ['conversaciones', 'pedidos', 'nuevo-pedido', 'clientes'],
  // «Unidades»: Órdenes registra las salidas a calle (los precios internos, pagos y reportes son solo de Administración, en la API).
  ordenes: ['ordenes', 'unidades'],
  produccion: ['produccion'],
  empleado_temporal: ['pedidos', 'nuevo-pedido', 'ordenes', 'produccion', 'conversaciones', 'stock'],
}

/** Compatibilidad: lo que abría el «empleado» antes de los perfiles. */
export const RUTAS_DE_EMPLEADO = [...RUTAS_POR_PERFIL.empleado_temporal, ...RUTAS_COMUNES] as const

/**
 * Perfiles efectivos de una cuenta. Si todavía no tiene perfiles guardados (base sin la migración 0054, o una fila
 * vieja) se derivan del rol: admin → administracion, operador → empleado_temporal (su acceso de siempre).
 */
export function perfilesEfectivos(rol: RolPanel | null | undefined, perfiles?: readonly unknown[] | null): Perfil[] {
  const validos = (perfiles ?? []).filter(esPerfil)
  if (validos.length > 0) return [...new Set(validos)]
  if (rol === 'admin') return ['administracion']
  if (rol === 'operador') return ['empleado_temporal']
  return []
}

export const esAdministracion = (perfiles: readonly Perfil[] | null | undefined): boolean => !!perfiles?.includes('administracion')

/** ¿Tiene alguno de estos perfiles? Administración cuenta siempre (ve y hace todo). */
export function tienePerfil(perfiles: readonly Perfil[] | null | undefined, ...candidatos: Perfil[]): boolean {
  if (!perfiles || perfiles.length === 0) return false
  if (esAdministracion(perfiles)) return true
  return candidatos.some((c) => perfiles.includes(c))
}

const limpiar = (ruta: string) => ruta.replace(/^#?\/*/, '').split(/[?#/]/)[0]

export function puedeVerRuta(perfiles: readonly Perfil[] | null | undefined, ruta: string): boolean {
  if (!perfiles || perfiles.length === 0) return false
  if (esAdministracion(perfiles)) return true
  const r = limpiar(ruta)
  if ((RUTAS_COMUNES as readonly string[]).includes(r)) return true
  return perfiles.some((p) => p !== 'administracion' && RUTAS_POR_PERFIL[p].includes(r))
}

/** Pantalla a la que se entra al iniciar sesión (o cuando se pide una que el perfil no tiene). */
export function rutaInicial(perfiles: readonly Perfil[] | null | undefined): string {
  if (esAdministracion(perfiles)) return '/resumen'
  const orden: [Perfil, string][] = [
    ['venta_digital', '/conversaciones'],
    ['ordenes', '/ordenes'],
    ['produccion', '/produccion'],
    ['caja', '/pedidos'],
    ['empleado_temporal', '/pedidos'],
  ]
  for (const [perfil, ruta] of orden) if (perfiles?.includes(perfil)) return ruta
  return '/avisos'
}

/** Áreas de trabajo con datos por local. Sirven para decidir si una cuenta ve un solo local o todos. */
export type AreaDeLocal = 'pedidos' | 'nuevo_pedido' | 'conversaciones' | 'ordenes' | 'hoja_del_dia' | 'produccion' | 'stock'

/** Perfiles que, en cada área, trabajan SIN filtro de local (Administración siempre). El resto queda en su local. */
export const PERFILES_SIN_FILTRO_DE_LOCAL: Record<AreaDeLocal, readonly Perfil[]> = {
  pedidos: ['venta_digital', 'ordenes'],
  nuevo_pedido: ['venta_digital'],
  conversaciones: ['venta_digital'],
  ordenes: ['ordenes'],
  hoja_del_dia: ['ordenes'],
  produccion: [],
  stock: [],
}

export function veTodosLosLocales(perfiles: readonly Perfil[] | null | undefined, area: AreaDeLocal): boolean {
  return tienePerfil(perfiles, ...PERFILES_SIN_FILTRO_DE_LOCAL[area])
}

/** Clientes completo (segmentos, contactos, consentimientos) es solo de Administración; el resto ve la versión reducida. */
export const veClientesCompleto = (perfiles: readonly Perfil[] | null | undefined): boolean => esAdministracion(perfiles)

/** Texto corto para el encabezado: «Caja», «Venta digital + Órdenes». */
export function nombreDePerfiles(perfiles: readonly Perfil[] | null | undefined): string {
  if (!perfiles || perfiles.length === 0) return 'Sin perfil'
  if (esAdministracion(perfiles)) return NOMBRE_DE_PERFIL.administracion
  return perfiles.map((p) => NOMBRE_DE_PERFIL[p]).join(' + ')
}

/** @deprecated usa `nombreDePerfiles`. Se conserva por si algún código viejo lo importa. */
export function nombreDeRol(rol: RolPanel | null | undefined): string {
  return rol === 'admin' ? NOMBRE_DE_PERFIL.administracion : NOMBRE_DE_PERFIL.empleado_temporal
}

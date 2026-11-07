/**
 * Qué secciones de Bake OS ve cada rol. Rol «operador» en la base = «Empleado» en pantalla (temporal, hasta
 * tener la lista del equipo con sus roles). Un empleado ve SOLO lo de su sede para trabajar el día:
 * Pedidos (con Nuevo pedido), Órdenes (el tablero de Producción), Conversaciones y Stock. Todo lo demás
 * (resumen, alertas, clientes, atención, métricas, atribución, Mifact y simulador) es de dirección.
 *
 * Lógica pura y compartida: el menú, las rutas del panel y los tests usan esta misma lista. La barrera REAL
 * de los datos vive en la base (RLS y el chequeo de admin dentro de las funciones de métricas, migración 0038)
 * y en la API (rutas solo-admin); esto decide qué se muestra y a dónde se redirige.
 */
export type RolPanel = 'admin' | 'operador'

/** Rutas (sin «/») que un empleado puede abrir. */
// «ajustes»: ahí cada persona activa los avisos de su celular (y dirección maneja el bot).
export const RUTAS_DE_EMPLEADO = ['pedidos', 'nuevo-pedido', 'produccion', 'conversaciones', 'stock', 'ajustes', 'avisos'] as const

const limpiar = (ruta: string) => ruta.replace(/^#?\/*/, '').split(/[?#/]/)[0]

export function puedeVerRuta(rol: RolPanel | null | undefined, ruta: string): boolean {
  if (rol === 'admin') return true
  if (rol !== 'operador') return false
  return (RUTAS_DE_EMPLEADO as readonly string[]).includes(limpiar(ruta))
}

/** Pantalla a la que se entra al iniciar sesión (o cuando se pide una que el rol no tiene). */
export function rutaInicial(rol: RolPanel | null | undefined): string {
  return rol === 'admin' ? '/resumen' : '/pedidos'
}

export function nombreDeRol(rol: RolPanel | null | undefined): string {
  return rol === 'admin' ? 'Dirección' : 'Empleado'
}

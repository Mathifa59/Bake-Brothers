// Textos y ayudas de la pantalla Equipo (solo interfaz; las reglas de verdad están en packages/domain y en la API).

export const PERFILES_EDITABLES = [
  { id: 'administracion', nombre: 'Administración', ayuda: 'Todo: Resumen, Métricas, Catálogo, Clientes y Equipo.' },
  { id: 'caja', nombre: 'Caja', ayuda: 'Pedidos del día y Stock de su local.' },
  { id: 'venta_digital', nombre: 'Venta digital', ayuda: 'Conversaciones, Pedidos, Nuevo pedido y Clientes, de los dos locales.' },
  { id: 'ordenes', nombre: 'Órdenes', ayuda: 'Órdenes de mayoristas y Rappi, y la hoja del día, de los dos locales.' },
  { id: 'produccion', nombre: 'Producción y empaque', ayuda: 'Producción y sus hojas para imprimir, de su local.' },
]

/** Perfiles que solo ven su local: sin local no verían nada. */
export const PERFILES_DE_LOCAL = ['caja', 'produccion']

/** Letras y números sin los que se confunden (0/O, 1/l/I) para que la contraseña se pueda dictar. */
const ALFABETO = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generarContrasena(largo = 14) {
  const valores = new Uint32Array(largo)
  crypto.getRandomValues(valores)
  return Array.from(valores, (v) => ALFABETO[v % ALFABETO.length]).join('')
}

const RELATIVO = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })

/** «hace 3 h», «ayer», «hace 2 semanas»… (a partir de una fecha ISO). */
export function haceCuanto(iso, ahora = Date.now()) {
  if (!iso) return null
  const seg = Math.round((new Date(iso).getTime() - ahora) / 1000)
  const pasos = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 7],
    ['week', 4.34524],
    ['month', 12],
    ['year', Infinity],
  ]
  let valor = seg
  for (const [unidad, tope] of pasos) {
    if (Math.abs(valor) < tope) return RELATIVO.format(Math.round(valor), unidad)
    valor /= tope
  }
  return null
}

const FECHA_HORA = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})
export const fechaHoraLegible = (iso) => (iso ? FECHA_HORA.format(new Date(iso)) : '')

/** Qué decirle a la persona cuando la API rechaza algo. */
export function mensajeDeErrorEquipo(err) {
  if (err?.codigo === 'EQUIPO_NO_CONFIGURADO')
    return 'Falta configurar la llave de Supabase en el servidor (SUPABASE_SERVICE_ROLE_KEY). Hasta entonces no se pueden crear ni cambiar cuentas.'
  if (err?.codigo === 'SOLO_ADMIN') return 'Solo Administración puede gestionar el equipo.'
  if (err?.codigo === 'CUENTA_DESACTIVADA') return 'Tu cuenta está desactivada.'
  return err?.detalle || err?.message || 'No se pudo completar la acción.'
}

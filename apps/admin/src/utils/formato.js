export const formatoPrecio = (valor) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(valor)

// Todo lo que se muestra como "hoy"/"ahora" va en hora de Lima, no en la del
// dispositivo (ver packages/domain/src/zonaLima.ts).
const PARTES_FECHA = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const HORA = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

/** "LUNES, 5 DE OCTUBRE DE 2026 · 12:16 P. M." — la línea naranja de cada portada. */
export function fechaPortada(ahora = new Date()) {
  return `${PARTES_FECHA.format(ahora)} · ${HORA.format(ahora)}`.toUpperCase()
}

/** "12:16 p. m." en Lima. */
export const horaLegible = (fecha) => HORA.format(fecha).toLowerCase()

/** "Buenos días" / "Buenas tardes" / "Buenas noches" según la hora de Lima. */
export function saludoSegunHora(ahora = new Date()) {
  const hora = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Lima', hour: '2-digit', hourCycle: 'h23' }).format(ahora)
  )
  if (hora < 12) return 'Buenos días'
  if (hora < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

/** 45 → "45 s", 420 → "7 min", 4800 → "1 h 20 min". */
export function duracionLegible(segundos) {
  if (segundos === null || segundos === undefined) return '—'
  if (segundos < 60) return `${Math.round(segundos)} s`
  const min = Math.round(segundos / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

/** "5 oct", sin año, para fechas de entrega. */
export function fechaCorta(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d, 12)))
    .replace('.', '')
}

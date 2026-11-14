/**
 * Fechas de los pedidos y horario de atención de las personas (hora de Lima).
 *
 * El bot atiende las 24 horas. Reglas de fecha (decisión del cliente, 2026-11-13):
 *  - Un pedido para MAÑANA se acepta hasta las 11:00 p. m. de hoy, para todos. Desde las 11:00 p. m. la fecha más
 *    cercana es pasado mañana. (Es el mismo corte de las órdenes del equipo: `corteOrdenes.ts`.)
 *  - Un pedido para HOY SÍ lo crea el bot, pero solo si el servidor puede validarlo: producto disponible en el Stock del
 *    local, hora de recojo dentro del horario del local ese día (`horarioLocal.ts`) y que no sea un producto solo por
 *    encargo (esos se agendan desde mañana). Si algo no se puede validar, se deriva a una persona.
 *  - Lo que pase a una persona cuando nadie atiende se responde «te escribimos a primera hora».
 *
 * Lógica pura: recibe el instante y devuelve decisiones. La hora siempre es la de Lima (nunca la del servidor).
 */
import { CORTE_HORA, CORTE_MINUTO, CORTE_TEXTO } from './corteOrdenes.js'
import { fechaLimaISO, partesLima, sumarDiasISO } from './zonaLima.js'

/** 11:00 p. m.: hasta ahí se toma un pedido para mañana (una sola definición, la de las órdenes del equipo). */
export const CORTE_MANANA_MINUTOS = CORTE_HORA * 60 + CORTE_MINUTO

/**
 * Horario en que las PERSONAS atienden WhatsApp (dato confirmado por el cliente, 2026-11-13): lunes a sábado de
 * 8:00 a. m. a 8:30 p. m.; domingo de 10:00 a. m. a 8:30 p. m. Es distinto del horario de cada local (que vive en
 * `sedes_horarios`). Si cambia, se ajusta aquí.
 */
export const ATENCION_PERSONAS_DESDE_LUN_SAB_MINUTOS = 8 * 60
export const ATENCION_PERSONAS_DESDE_DOMINGO_MINUTOS = 10 * 60
export const ATENCION_PERSONAS_HASTA_MINUTOS = 20 * 60 + 30

const esDomingo = (fechaISO: string) => new Date(`${fechaISO}T12:00:00Z`).getUTCDay() === 0
/** Minutos desde la medianoche a los que las personas empiezan a atender ese día (YYYY-MM-DD, Lima). */
export const atencionPersonasDesde = (fechaISO: string) =>
  esDomingo(fechaISO) ? ATENCION_PERSONAS_DESDE_DOMINGO_MINUTOS : ATENCION_PERSONAS_DESDE_LUN_SAB_MINUTOS

const minutosDelDiaLima = (ahora: Date) => {
  const p = partesLima(ahora)
  return p.hora * 60 + p.minuto
}

const formatoHora = (min: number) => {
  const h24 = Math.floor(min / 60)
  const m = min % 60
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'a. m.' : 'p. m.'}`
}

/** ¿Ya pasó el corte de las 11:00 p. m. (hora de Lima)? Desde la hora exacta en adelante. */
export function pasoElCorteDeManana(ahora: Date): boolean {
  return minutosDelDiaLima(ahora) >= CORTE_MANANA_MINUTOS
}

/**
 * La primera fecha (YYYY-MM-DD, Lima) para un pedido que NO puede ser para hoy (solo por encargo): mañana, o pasado
 * mañana si ya pasó el corte de las 11:00 p. m.
 */
export function fechaMinimaPorEncargo(ahora: Date): string {
  const hoy = fechaLimaISO(ahora)
  return sumarDiasISO(hoy, pasoElCorteDeManana(ahora) ? 2 : 1)
}

export type ResultadoFechaPedido =
  | { ok: true; /** La fecha de entrega es hoy: el servidor aplica las validaciones de «pedido para hoy». */ paraHoy: boolean }
  | { ok: false; error: 'CORTE_DEL_DIA'; fechaMinima: string; corte: string }

/**
 * Valida la fecha de entrega contra el corte: para MAÑANA solo hasta las 11:00 p. m. de hoy (después, la fecha más
 * cercana es pasado mañana); para HOY se acepta (con sus validaciones); más adelante, sin corte. Una fecha mal formada o
 * pasada la rechaza otra validación (anticipación), no esta.
 */
export function validarFechaDePedido(fechaEntregaISO: string, ahora: Date): ResultadoFechaPedido {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaEntregaISO)) return { ok: true, paraHoy: false }
  const hoy = fechaLimaISO(ahora)
  if (fechaEntregaISO === hoy) return { ok: true, paraHoy: true }
  if (fechaEntregaISO === sumarDiasISO(hoy, 1) && pasoElCorteDeManana(ahora)) {
    return { ok: false, error: 'CORTE_DEL_DIA', fechaMinima: sumarDiasISO(hoy, 2), corte: CORTE_TEXTO }
  }
  return { ok: true, paraHoy: false }
}

/** ¿Hay personas atendiendo ahora? (el horario cambia por día: el domingo empiezan a las 10:00 a. m.) */
export function hayPersonasAtendiendo(ahora: Date): boolean {
  const m = minutosDelDiaLima(ahora)
  return m >= atencionPersonasDesde(fechaLimaISO(ahora)) && m < ATENCION_PERSONAS_HASTA_MINUTOS
}

/**
 * Cuándo vuelven a atender las personas: «desde las 8:00 a. m.» si todavía es antes de abrir hoy, o «mañana desde
 * las 10:00 a. m.» si ya cerraron (o si mañana es domingo, que abre más tarde). Solo tiene sentido cuando nadie atiende.
 */
export function proximaAtencionLegible(ahora: Date): string {
  const hoy = fechaLimaISO(ahora)
  if (minutosDelDiaLima(ahora) < atencionPersonasDesde(hoy)) return `desde las ${formatoHora(atencionPersonasDesde(hoy))}`
  const manana = sumarDiasISO(hoy, 1)
  return `mañana desde las ${formatoHora(atencionPersonasDesde(manana))}`
}

export const textoPrimeraHora = (ahora: Date) =>
  `Ahora estamos fuera de horario: te escribimos a primera hora (${proximaAtencionLegible(ahora)}). 🙏`

/** Agrega «te escribimos a primera hora» a un texto que deriva a una persona, solo si nadie atiende y aún no lo dice. */
export function conAvisoPrimeraHora(texto: string, ahora: Date): string {
  if (hayPersonasAtendiendo(ahora) || /primera hora/i.test(texto)) return texto
  return `${texto.trimEnd()}\n\n${textoPrimeraHora(ahora)}`
}

/**
 * Lo que se le dice al modelo en cada turno sobre las fechas (corte), los pedidos para hoy y la atención de personas.
 * `horarioDeHoy` es el texto de `textoHorarioDeHoy` (horarios de recojo de hoy de cada local), si se conoce.
 */
export function textoContextoCortes(ahora: Date, horarioDeHoy?: string): string {
  const lineas: string[] = []
  if (pasoElCorteDeManana(ahora)) {
    lineas.push(
      `CORTE DEL DÍA: ya pasaron las ${CORTE_TEXTO}. Un pedido para MAÑANA ya NO se toma; la fecha más cercana es ${fechaMinimaPorEncargo(ahora)}. Dile con amabilidad que por el horario no alcanza para mañana y ofrécele esa fecha o una posterior. El servidor rechaza cualquier pedido para mañana (CORTE_DEL_DIA).`
    )
  } else {
    lineas.push(`CORTE DEL DÍA: los pedidos para mañana se toman hasta las ${CORTE_TEXTO} de hoy; desde esa hora, la fecha más cercana es pasado mañana.`)
  }
  lineas.push(
    'PEDIDOS PARA HOY: SÍ los puedes tomar (regla 10), el servidor valida antes de crearlos: el producto (y su tamaño o sabor) tiene que estar disponible en el Stock de ese local, la hora de recojo tiene que caer dentro del horario del local de hoy (y ser posterior a la hora actual) y no puede ser un producto solo por encargo (tortas, postres enteros, personalizados: esos se agendan desde la fecha mínima que te indique el error).'
  )
  if (horarioDeHoy) lineas.push(horarioDeHoy)
  lineas.push(
    hayPersonasAtendiendo(ahora)
      ? 'ATENCIÓN DE PERSONAS: ahora hay equipo atendiendo.'
      : `ATENCIÓN DE PERSONAS: ahora NO hay equipo atendiendo. Si derivas a una persona (escalarAHumano), dile al cliente que «te escribimos a primera hora» (${proximaAtencionLegible(ahora)}); nunca prometas una hora exacta ni una respuesta inmediata.`
  )
  return lineas.join(String.fromCharCode(10))
}

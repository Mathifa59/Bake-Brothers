/**
 * Cortes del día y horario de atención de las personas (hora de Lima).
 *
 * El bot atiende las 24 horas, pero:
 *  - Después del CORTE (8:00 p. m. para clientes, 11:00 p. m. para mayoristas) no se ofrece entrega para ese mismo
 *    día: el pedido se toma para el día siguiente. Vale para recojo y delivery (es la fecha de entrega).
 *  - Lo que pase a una persona cuando nadie atiende se responde «te escribimos a primera hora».
 *
 * Lógica pura: recibe el instante y devuelve decisiones. La hora siempre es la de Lima (nunca la del servidor).
 */
import { fechaLimaISO, partesLima, sumarDiasISO } from './zonaLima.js'

export const CORTE_CLIENTES_MINUTOS = 20 * 60 // 8:00 p. m.
export const CORTE_MAYORISTAS_MINUTOS = 23 * 60 // 11:00 p. m.

/**
 * Horario en que las PERSONAS atienden WhatsApp (dato confirmado por el cliente, 2026-11-13): lunes a sábado de
 * 8:00 a. m. a 8:30 p. m.; domingo de 10:00 a. m. a 8:30 p. m. Es distinto del horario de cada local (que vive en
 * `sedes.horario`). Si cambia, se ajusta aquí.
 */
export const ATENCION_PERSONAS_DESDE_LUN_SAB_MINUTOS = 8 * 60
export const ATENCION_PERSONAS_DESDE_DOMINGO_MINUTOS = 10 * 60
export const ATENCION_PERSONAS_HASTA_MINUTOS = 20 * 60 + 30

const esDomingo = (fechaISO: string) => new Date(`${fechaISO}T12:00:00Z`).getUTCDay() === 0
/** Minutos desde la medianoche a los que las personas empiezan a atender ese día (YYYY-MM-DD, Lima). */
export const atencionPersonasDesde = (fechaISO: string) =>
  esDomingo(fechaISO) ? ATENCION_PERSONAS_DESDE_DOMINGO_MINUTOS : ATENCION_PERSONAS_DESDE_LUN_SAB_MINUTOS

export type TipoCliente = 'cliente' | 'mayorista'

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

export const corteDe = (tipo: TipoCliente) => (tipo === 'mayorista' ? CORTE_MAYORISTAS_MINUTOS : CORTE_CLIENTES_MINUTOS)
export const corteLegible = (tipo: TipoCliente) => formatoHora(corteDe(tipo))

/** ¿Ya pasó el corte de hoy (hora de Lima)? Desde la hora exacta del corte en adelante. */
export function pasoElCorte(ahora: Date, tipo: TipoCliente = 'cliente'): boolean {
  return minutosDelDiaLima(ahora) >= corteDe(tipo)
}

/** La primera fecha (YYYY-MM-DD, Lima) para la que se puede tomar un pedido: hoy, o mañana si ya pasó el corte. */
export function fechaMinimaDeEntrega(ahora: Date, tipo: TipoCliente = 'cliente'): string {
  const hoy = fechaLimaISO(ahora)
  return pasoElCorte(ahora, tipo) ? sumarDiasISO(hoy, 1) : hoy
}

export type ResultadoCorte = { ok: true } | { ok: false; fechaMinima: string; corte: string }

/** Rechaza una fecha de entrega anterior a la mínima por el corte (p. ej. «para hoy» a las 8:15 p. m.). */
export function validarFechaPorCorte(fechaEntregaISO: string, ahora: Date, tipo: TipoCliente = 'cliente'): ResultadoCorte {
  const minima = fechaMinimaDeEntrega(ahora, tipo)
  // YYYY-MM-DD se compara bien como texto; una fecha mal formada la rechaza otra validación (anticipación).
  if (/^\d{4}-\d{2}-\d{2}$/.test(fechaEntregaISO) && fechaEntregaISO < minima) {
    return { ok: false, fechaMinima: minima, corte: corteLegible(tipo) }
  }
  return { ok: true }
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

/** Lo que se le dice al modelo en cada turno sobre el corte y la atención de personas. */
export function textoContextoCortes(ahora: Date): string {
  const lineas: string[] = []
  if (pasoElCorte(ahora, 'cliente')) {
    lineas.push(
      `CORTE DEL DÍA: ya pasaron las ${corteLegible('cliente')}. NO ofrezcas entrega ni recojo para HOY (la fecha mínima es ${fechaMinimaDeEntrega(ahora, 'cliente')}): toma el pedido para mañana o un día posterior y dile con amabilidad que por el horario no alcanza para hoy. Si pides la fecha y el cliente dice «hoy», explícale lo del corte. El servidor rechaza cualquier pedido para hoy (CORTE_DEL_DIA).`
    )
  } else {
    lineas.push(`CORTE DEL DÍA: los pedidos para hoy se toman hasta las ${corteLegible('cliente')}; pasada esa hora solo para mañana en adelante.`)
  }
  lineas.push(
    hayPersonasAtendiendo(ahora)
      ? 'ATENCIÓN DE PERSONAS: ahora hay equipo atendiendo.'
      : `ATENCIÓN DE PERSONAS: ahora NO hay equipo atendiendo. Si derivas a una persona (escalarAHumano), dile al cliente que «te escribimos a primera hora» (${proximaAtencionLegible(ahora)}); nunca prometas una hora exacta ni una respuesta inmediata.`
  )
  return lineas.join('\n')
}

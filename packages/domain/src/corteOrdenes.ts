import { partesLima, sumarDiasISO } from './zonaLima.js'

/**
 * Corte de las órdenes para el día siguiente: 10:30 p. m. (hora de Lima) del día anterior. Pasado el corte se
 * AVISA, no se bloquea: la orden se registra igual, marcada «fuera de corte», para que producción sepa que llegó
 * tarde. Mismo criterio de «hora de Lima, nunca la del dispositivo» que el resto del dominio.
 */
export const CORTE_HORA = 22
export const CORTE_MINUTO = 30
export const CORTE_TEXTO = '10:30 p. m.'

export interface ResultadoCorte {
  /** true si se registró pasado el corte (o la orden ya es para hoy o para una fecha pasada). */
  fueraDeCorte: boolean
  /** Para el aviso en pantalla; null si está a tiempo. */
  motivo: 'pasado_el_corte' | 'para_hoy_o_antes' | null
}

/**
 * ¿Esta orden llegó tarde? Solo importa para entregas del día siguiente:
 *  - para mañana, registrada antes de las 10:30 p. m. de hoy → a tiempo;
 *  - para mañana, registrada desde las 10:30 p. m. → fuera de corte;
 *  - para hoy (o una fecha pasada) → fuera de corte (ya no se alcanza el plan de esa noche);
 *  - para pasado mañana o más → a tiempo (el corte de ese día todavía no llega).
 */
export function evaluarCorteOrden(ahora: Date, fechaEntregaISO: string): ResultadoCorte {
  const { fecha: hoy, hora, minuto } = partesLima(ahora)
  if (fechaEntregaISO <= hoy) return { fueraDeCorte: true, motivo: 'para_hoy_o_antes' }
  if (fechaEntregaISO === sumarDiasISO(hoy, 1) && (hora > CORTE_HORA || (hora === CORTE_HORA && minuto >= CORTE_MINUTO))) {
    return { fueraDeCorte: true, motivo: 'pasado_el_corte' }
  }
  return { fueraDeCorte: false, motivo: null }
}

import { esDomingo } from './availability.js'
import { inicioDiaLima, partesLima, sumarDiasISO } from './zonaLima.js'

export type SemaforoCatering = 'verde' | 'amarillo' | 'rojo'

export interface ReglaCateringInput {
  unidadesMinimas: number
  /**
   * Qué pasa si piden para HOY (columna "Hoy" de la Guía v2.0):
   *   false → "NO CONFIRMAR" (no es estándar) → rojo.
   *   true  → "CONSULTAR" (se valida stock/disponibilidad antes de prometer) → amarillo.
   */
  saleMismoDia: boolean
  anticipacionHoras: number
  // Ver 0018_semaforo_catering.sql: no todos los ítems admiten el corte de
  // las 8:30pm — la fuente no es uniforme, así que esto viene del dato real
  // de reglas_catering, nunca de una suposición genérica acá.
  admiteCorteNocheAnterior: boolean
}

export interface PedidoCateringInput {
  cantidadSolicitada: number
  /** YYYY-MM-DD — el día en que el cliente quiere la entrega. */
  fechaEntregaISO: string
  /** Momento del pedido/consulta. Default: ahora real; parametrizable para tests. */
  ahora?: Date
}

// 20:30 — corte documentado en la Guía de Agendamiento v2.0 (sección 10)
// para los ítems que admiten agendar el día siguiente pedido la noche
// anterior. Mismo corte para todos los ítems que lo admiten: la fuente no
// da una hora distinta por ítem, solo distingue "lo admite" / "no lo admite".
const MINUTOS_CORTE_NOCHE_ANTERIOR = 20 * 60 + 30

// Guía v2.0, "Reglas no negociables": máximo estándar de 500 bocaditos dentro de
// una misma franja de una hora; si se supera, CONSULTAR capacidad. Acá solo se
// puede ver el ítem que se está evaluando: la suma con otros ítems u otros
// pedidos de esa misma franja la revisa la persona.
export const CAPACIDAD_ESTANDAR_BOCADITOS_POR_HORA = 500

/**
 * Semáforo de catering (🟢/🟡/🔴) — Guía de Agendamiento de Catering v2.0,
 * sección 10. Evalúa un pedido contra las reglas de UN catering_item; nunca
 * agrega/decide movilidad, auto obligatorio ni arma la cotización completa
 * — eso lo sigue haciendo el operador a mano, a propósito.
 *
 * 🔴 (rojo) NO significa "rechazar" — significa "fuera de estándar, no
 * confirmar sin escalar la excepción". 🟡 (amarillo) significa "no
 * prometer todavía, consultar antes". Ver el comentario de cada regla.
 *
 * Orden de evaluación — no negociable, cada regla puede cortar antes de
 * llegar a la siguiente (ver Guía de Agendamiento v2.0, sección 10):
 *   1. Domingo (fecha de ENTREGA) → siempre amarillo, sin importar el
 *      resto — ni mínimo ni anticipación lo cambian.
 *   2. Cantidad pedida por debajo del mínimo del ítem → rojo.
 *   3. Piden para HOY: columna "Hoy" de la Guía — "No confirmar" → rojo,
 *      "Consultar" → amarillo (nunca verde: ningún ítem sale hoy sin
 *      validar). El corte de las 8:30pm de la regla 5 es sobre pedir HOY
 *      para entregar MAÑANA, no sobre entregar hoy.
 *   4. Más de 500 unidades de un ítem → amarillo (capacidad estándar por
 *      franja de una hora; consultar).
 *   5. No cumple la anticipación mínima (`cumpleAnticipacionMinima`,
 *      misma función que ya usa `packages/domain` para productos de
 *      tienda) → amarillo — salvo que la regla admita el corte de la
 *      noche anterior (`admiteCorteNocheAnterior`) Y la entrega sea
 *      justo mañana Y el pedido llegue antes de las 8:30pm de hoy: ahí
 *      se trata como si cumpliera, sin marcar amarillo por este motivo.
 *   6. Si todo lo anterior pasa → verde.
 */
export function evaluarSemaforoCatering(
  regla: ReglaCateringInput,
  pedido: PedidoCateringInput
): SemaforoCatering {
  // Todo en hora de Lima, nunca la del servidor (que en Coolify es UTC): a las
  // 8:00 p. m. de Lima el servidor ya está en el día siguiente.
  const ahora = pedido.ahora ?? new Date()
  const lima = partesLima(ahora)

  if (esDomingo(pedido.fechaEntregaISO)) return 'amarillo'

  if (pedido.cantidadSolicitada < regla.unidadesMinimas) return 'rojo'

  // HOY: la Guía distingue "NO CONFIRMAR" (rojo) de "CONSULTAR" (amarillo).
  if (pedido.fechaEntregaISO === lima.fecha) return regla.saleMismoDia ? 'amarillo' : 'rojo'

  if (pedido.cantidadSolicitada > CAPACIDAD_ESTANDAR_BOCADITOS_POR_HORA) return 'amarillo'

  // Horas desde ahora hasta las 00:00 (Lima) del día de entrega — misma
  // convención conservadora que `horasDeAnticipacion`, pero sin depender del
  // huso del servidor.
  const horas = (inicioDiaLima(pedido.fechaEntregaISO).getTime() - ahora.getTime()) / 3_600_000
  if (Number.isNaN(horas)) return 'amarillo'

  if (horas < regla.anticipacionHoras) {
    const esManana = pedido.fechaEntregaISO === sumarDiasISO(lima.fecha, 1)
    const antesDelCorte = lima.hora * 60 + lima.minuto < MINUTOS_CORTE_NOCHE_ANTERIOR
    if (!(regla.admiteCorteNocheAnterior && esManana && antesDelCorte)) return 'amarillo'
  }

  return 'verde'
}

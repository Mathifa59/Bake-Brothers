import { cumpleAnticipacionMinima, esDomingo } from './availability.js'

export type SemaforoCatering = 'verde' | 'amarillo' | 'rojo'

export interface ReglaCateringInput {
  unidadesMinimas: number
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

const formatISODate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const sumarDias = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

// 20:30 — corte documentado en la Guía de Agendamiento v2.0 (sección 10)
// para los ítems que admiten agendar el día siguiente pedido la noche
// anterior. Mismo corte para todos los ítems que lo admiten: la fuente no
// da una hora distinta por ítem, solo distingue "lo admite" / "no lo admite".
const MINUTOS_CORTE_NOCHE_ANTERIOR = 20 * 60 + 30

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
 *   3. El ítem no sale el mismo día Y piden para hoy → rojo. La fuente no
 *      documenta ninguna excepción para "hoy" en ningún ítem (la columna
 *      "Hoy" de los 14 dice "No confirmar" o "Consultar", nunca un sí
 *      condicionado por horario) — el corte de las 8:30pm de la regla 4
 *      es sobre pedir HOY para entregar MAÑANA, no sobre entregar hoy.
 *   4. No cumple la anticipación mínima (`cumpleAnticipacionMinima`,
 *      misma función que ya usa `packages/domain` para productos de
 *      tienda) → amarillo — salvo que la regla admita el corte de la
 *      noche anterior (`admiteCorteNocheAnterior`) Y la entrega sea
 *      justo mañana Y el pedido llegue antes de las 8:30pm de hoy: ahí
 *      se trata como si cumpliera, sin marcar amarillo por este motivo.
 *   5. Si todo lo anterior pasa → verde.
 */
export function evaluarSemaforoCatering(
  regla: ReglaCateringInput,
  pedido: PedidoCateringInput
): SemaforoCatering {
  const ahora = pedido.ahora ?? new Date()

  if (esDomingo(pedido.fechaEntregaISO)) return 'amarillo'

  if (pedido.cantidadSolicitada < regla.unidadesMinimas) return 'rojo'

  const esHoy = pedido.fechaEntregaISO === formatISODate(ahora)
  if (!regla.saleMismoDia && esHoy) return 'rojo'

  const cumpleAnticipacion = cumpleAnticipacionMinima({
    fechaEntregaISO: pedido.fechaEntregaISO,
    anticipacionHorasMinima: regla.anticipacionHoras,
    ahora,
  })

  if (!cumpleAnticipacion) {
    const esManana = pedido.fechaEntregaISO === formatISODate(sumarDias(ahora, 1))
    const minutosDelDia = ahora.getHours() * 60 + ahora.getMinutes()
    const antesDelCorte = minutosDelDia < MINUTOS_CORTE_NOCHE_ANTERIOR
    const aplicaCorteNocheAnterior = regla.admiteCorteNocheAnterior && esManana && antesDelCorte
    if (!aplicaCorteNocheAnterior) return 'amarillo'
  }

  return 'verde'
}

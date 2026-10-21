/**
 * Control Tower: alertas reales, sin puntajes. Cada tipo es una consulta a
 * datos que ya existen; acá solo se agrupan y se mide su antigüedad.
 */
export interface StockAgotado {
  id: string
  producto: string
  tamano: string | null
  sede: string | null
}

export interface PedidoPreProduccion {
  numero: string
  estado: string
  requiere_confirmar_combo: boolean
  actualizado_en: string
  fecha_entrega: string
  horario_entrega: string
  cliente: string | null
  sede: string | null
}

export interface ConversacionEscalada {
  id: string
  canal: string
  ultimo_mensaje_en: string
  sede: string | null
}

export interface EntradaAlertas {
  stockAgotado: StockAgotado[]
  /** Pedidos aún sin entrar a producción (draft/confirmed/payment_pending/paid). */
  pedidosPreProduccion: PedidoPreProduccion[]
  escaladas: ConversacionEscalada[]
  /** YYYY-MM-DD de hoy en Lima. */
  hoy: string
}

export interface AlertasControlTower {
  agotados: StockAgotado[]
  /** Combos vendidos por el bot con sustitución, que el equipo todavía no revisó (el pedido aún no entró a producción). */
  combosPorRevisar: PedidoPreProduccion[]
  /** Conversaciones que el bot escaló y nadie atendió todavía (la más antigua primero). */
  escaladasSinAtender: ConversacionEscalada[]
  /** Pedidos pagados que todavía no empezaron producción (el más antiguo primero). */
  pagadosSinEmpezar: PedidoPreProduccion[]
  /** De los pagados/confirmados sin empezar, los que se entregan hoy. Subconjunto: no suma al total. */
  paraHoySinEmpezar: PedidoPreProduccion[]
  /** Excepciones activas: agotados + combos + escaladas + pagados sin empezar. */
  total: number
}

export function construirAlertas(entrada: EntradaAlertas): AlertasControlTower {
  const sinEmpezar = entrada.pedidosPreProduccion.filter((p) => p.estado === 'paid' || p.estado === 'confirmed')
  const combosPorRevisar = entrada.pedidosPreProduccion.filter((p) => p.requiere_confirmar_combo)
  const pagadosSinEmpezar = entrada.pedidosPreProduccion.filter((p) => p.estado === 'paid')
  const paraHoySinEmpezar = sinEmpezar.filter((p) => p.fecha_entrega === entrada.hoy)
  const escaladasSinAtender = [...entrada.escaladas].sort(
    (a, b) => new Date(a.ultimo_mensaje_en).getTime() - new Date(b.ultimo_mensaje_en).getTime()
  )
  return {
    agotados: entrada.stockAgotado,
    combosPorRevisar,
    escaladasSinAtender,
    pagadosSinEmpezar: [...pagadosSinEmpezar].sort(
      (a, b) => new Date(a.actualizado_en).getTime() - new Date(b.actualizado_en).getTime()
    ),
    paraHoySinEmpezar,
    total: entrada.stockAgotado.length + combosPorRevisar.length + escaladasSinAtender.length + pagadosSinEmpezar.length,
  }
}

/** "hace 5 min", "hace 2 h", "hace 3 d" — antigüedad legible (sin inventar urgencias). */
export function antiguedadLegible(desdeISO: string, ahora: Date): string {
  const min = Math.max(0, Math.floor((ahora.getTime() - new Date(desdeISO).getTime()) / 60000))
  if (min < 1) return 'hace instantes'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} d`
}

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
  /** El cliente mandó la captura de su pago y nadie lo ha confirmado ni rechazado todavía (0036). */
  pago_por_confirmar?: boolean
}

export interface ConversacionEscalada {
  id: string
  canal: string
  ultimo_mensaje_en: string
  sede: string | null
}

/** Un comprobante (boleta/factura) que sigue esperando respuesta de Mifact/SUNAT. */
export interface ComprobanteEsperando {
  id: string
  /** «B002-00000001». */
  numero: string
  pedido: string
  /** pendiente_envio | en_proceso | anulacion_solicitada */
  estado: string
  estadoLegible: string
  /** YYYY-MM-DD. */
  fechaEmision: string
}

/**
 * SUNAT acepta las boletas por el resumen diario: a la mañana siguiente ya deberían estar aceptadas. Pasados más de
 * estos días sin respuesta algo falló y hay que avisar a Mifact.
 */
export const DIAS_SIN_RESPUESTA_COMPROBANTE = 2
/** Estados que significan «todavía esperando a Mifact/SUNAT» (los demás ya tienen respuesta, buena o mala). */
export const ESTADOS_COMPROBANTE_ESPERANDO: readonly string[] = ['pendiente_envio', 'en_proceso', 'anulacion_solicitada']

/** Días completos entre dos fechas YYYY-MM-DD (hora de Lima ya resuelta por quien las da). */
export function diasEntreFechas(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000)
}

export interface EntradaAlertas {
  stockAgotado: StockAgotado[]
  /** Pedidos aún sin entrar a producción (draft/confirmed/payment_pending/paid). */
  pedidosPreProduccion: PedidoPreProduccion[]
  escaladas: ConversacionEscalada[]
  /** Comprobantes que siguen esperando a Mifact/SUNAT (se miden aquí: solo cuentan los de más de 2 días). Solo Administración los carga. */
  comprobantes?: ComprobanteEsperando[]
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
  /** Pagos reportados con captura que nadie ha confirmado ni rechazado (el más antiguo primero). El bot no los confirma solo. */
  pagosPorConfirmar: PedidoPreProduccion[]
  /** Boletas/facturas con más de 2 días sin respuesta de Mifact/SUNAT (la más antigua primero). */
  comprobantesSinRespuesta: (ComprobanteEsperando & { dias: number })[]
  /** Excepciones activas: agotados + combos + escaladas + pagados sin empezar + pagos por confirmar + comprobantes sin respuesta. */
  total: number
}

export function construirAlertas(entrada: EntradaAlertas): AlertasControlTower {
  const sinEmpezar = entrada.pedidosPreProduccion.filter((p) => p.estado === 'paid' || p.estado === 'confirmed')
  const combosPorRevisar = entrada.pedidosPreProduccion.filter((p) => p.requiere_confirmar_combo)
  const pagadosSinEmpezar = entrada.pedidosPreProduccion.filter((p) => p.estado === 'paid')
  const paraHoySinEmpezar = sinEmpezar.filter((p) => p.fecha_entrega === entrada.hoy)
  const pagosPorConfirmar = entrada.pedidosPreProduccion
    .filter((p) => p.pago_por_confirmar === true)
    .sort((a, b) => new Date(a.actualizado_en).getTime() - new Date(b.actualizado_en).getTime())
  const escaladasSinAtender = [...entrada.escaladas].sort(
    (a, b) => new Date(a.ultimo_mensaje_en).getTime() - new Date(b.ultimo_mensaje_en).getTime()
  )
  const comprobantesSinRespuesta = (entrada.comprobantes ?? [])
    .filter((c) => ESTADOS_COMPROBANTE_ESPERANDO.includes(c.estado))
    .map((c) => ({ ...c, dias: diasEntreFechas(c.fechaEmision, entrada.hoy) }))
    .filter((c) => c.dias > DIAS_SIN_RESPUESTA_COMPROBANTE)
    .sort((a, b) => b.dias - a.dias)
  return {
    agotados: entrada.stockAgotado,
    combosPorRevisar,
    escaladasSinAtender,
    pagadosSinEmpezar: [...pagadosSinEmpezar].sort(
      (a, b) => new Date(a.actualizado_en).getTime() - new Date(b.actualizado_en).getTime()
    ),
    paraHoySinEmpezar,
    pagosPorConfirmar,
    comprobantesSinRespuesta,
    total:
      entrada.stockAgotado.length +
      combosPorRevisar.length +
      escaladasSinAtender.length +
      pagadosSinEmpezar.length +
      pagosPorConfirmar.length +
      comprobantesSinRespuesta.length,
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

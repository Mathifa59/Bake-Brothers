import { ESTADOS_QUE_CUENTAN_COMO_INGRESO, type EstadoPedido } from './orderStatus.js'
import { inicioDiaLima, partesLima, sumarDiasISO } from './zonaLima.js'

/** Lo mínimo de un pedido para medir ventas. */
export interface PedidoVenta {
  total: number | string
  estado: string
  creado_en: string
}

/** ¿Este pedido suma como venta? Misma definición que `metricas_kpis` (todo menos `cancelled`) — una sola lista, la del dominio. */
export function cuentaComoIngreso(estado: string): boolean {
  return (ESTADOS_QUE_CUENTAN_COMO_INGRESO as readonly string[]).includes(estado as EstadoPedido)
}

export function sumarIngresos(pedidos: PedidoVenta[]): number {
  return pedidos.filter((p) => cuentaComoIngreso(p.estado)).reduce((acc, p) => acc + Number(p.total), 0)
}

export interface VentaHora {
  hora: number
  ventas: number
  pedidos: number
}

/** Ventas por hora de Lima (00-23) de un conjunto de pedidos del mismo día. Solo devuelve horas con al menos un pedido contable. */
export function ventasPorHora(pedidos: PedidoVenta[]): VentaHora[] {
  const porHora = new Map<number, VentaHora>()
  for (const p of pedidos) {
    if (!cuentaComoIngreso(p.estado)) continue
    const { hora } = partesLima(new Date(p.creado_en))
    const fila = porHora.get(hora) ?? { hora, ventas: 0, pedidos: 0 }
    fila.ventas += Number(p.total)
    fila.pedidos += 1
    porHora.set(hora, fila)
  }
  return [...porHora.values()].sort((a, b) => a.hora - b.hora)
}

export interface VentanaComparacion {
  /** Desde 00:00 de hoy (Lima) hasta ahora. */
  hoy: { desde: Date; hasta: Date }
  /** Desde 00:00 del mismo día de la semana anterior (Lima) hasta la MISMA hora y minuto de Lima que ahora. */
  semanaAnterior: { desde: Date; hasta: Date }
  /** Fecha (YYYY-MM-DD) del mismo día de la semana anterior. */
  fechaSemanaAnterior: string
}

/**
 * Las dos ventanas que se comparan en el Resumen: hoy hasta ahora vs. el mismo
 * día de la semana anterior hasta la misma hora de Lima — nunca contra el día
 * completo de la semana anterior (sería injusto a media mañana).
 */
export function ventanasComparacion(ahora: Date): VentanaComparacion {
  const { fecha } = partesLima(ahora)
  const inicioHoy = inicioDiaLima(fecha)
  const transcurrido = ahora.getTime() - inicioHoy.getTime()
  const fechaAnterior = sumarDiasISO(fecha, -7)
  const inicioAnterior = inicioDiaLima(fechaAnterior)
  return {
    hoy: { desde: inicioHoy, hasta: ahora },
    semanaAnterior: { desde: inicioAnterior, hasta: new Date(inicioAnterior.getTime() + transcurrido) },
    fechaSemanaAnterior: fechaAnterior,
  }
}

/** Variación porcentual de `actual` contra `anterior`; null si no hay base comparable (anterior = 0). */
export function variacionPorcentual(actual: number, anterior: number): number | null {
  if (!(anterior > 0)) return null
  return ((actual - anterior) / anterior) * 100
}

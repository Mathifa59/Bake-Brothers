import { cuentaComoIngreso } from './resumenDia.js'
import { partesLima } from './zonaLima.js'

export interface ClienteSegmentable {
  id: string
  creado_en: string
}

export interface PedidoDeCliente {
  customer_id: string
  creado_en: string
  estado: string
}

export interface SegmentosClientes {
  /** 2+ compras (pedidos no cancelados). */
  frecuentes: Set<string>
  /** Compraron alguna vez, pero la última fue hace MÁS de 30 días. */
  sinComprar30: Set<string>
  /** Clientes creados en el mes calendario actual (hora de Lima). */
  nuevosDelMes: Set<string>
}

const DIA_MS = 24 * 60 * 60 * 1000
export const DIAS_SIN_COMPRAR = 30
export const COMPRAS_FRECUENTE = 2

/** Segmentos de clientes, calculados solo con lo que ya existe (customers + orders) — sin tabla nueva. */
export function segmentarClientes(
  clientes: ClienteSegmentable[],
  pedidos: PedidoDeCliente[],
  ahora: Date = new Date()
): SegmentosClientes {
  const compras = new Map<string, { n: number; ultima: number }>()
  for (const p of pedidos) {
    if (!cuentaComoIngreso(p.estado)) continue
    const t = new Date(p.creado_en).getTime()
    const c = compras.get(p.customer_id) ?? { n: 0, ultima: 0 }
    c.n += 1
    c.ultima = Math.max(c.ultima, t)
    compras.set(p.customer_id, c)
  }

  const mesActual = partesLima(ahora).fecha.slice(0, 7)
  const frecuentes = new Set<string>()
  const sinComprar30 = new Set<string>()
  const nuevosDelMes = new Set<string>()

  for (const c of clientes) {
    const compra = compras.get(c.id)
    if (compra && compra.n >= COMPRAS_FRECUENTE) frecuentes.add(c.id)
    if (compra && ahora.getTime() - compra.ultima > DIAS_SIN_COMPRAR * DIA_MS) sinComprar30.add(c.id)
    if (partesLima(new Date(c.creado_en)).fecha.slice(0, 7) === mesActual) nuevosDelMes.add(c.id)
  }
  return { frecuentes, sinComprar30, nuevosDelMes }
}

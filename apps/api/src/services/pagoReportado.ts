import type pg from 'pg'
import { evaluarPagoReportado, fechaLimaISO, type EvaluacionPago, type ExtraccionPago } from '@bakebrothers/domain'

/**
 * Deja un pedido como "pago reportado": guarda lo que se leyó de la captura y cómo cuadra con el pedido
 * (packages/domain pagoReportado.ts). NUNCA cambia el estado del pedido ni lo marca pagado: eso lo hace una
 * persona en el panel (0036). Lo único que escribe es orders.pago_reportado / pago_reportado_en — y el trigger de
 * la base reabre la revisión si ya había un resultado anterior (el cliente mandó otra captura).
 */

export type ResultadoPagoReportado =
  | { ok: true; numeroPedido: string; evaluacion: EvaluacionPago }
  | { ok: false; error: 'SIN_PEDIDO_PENDIENTE' }

interface PedidoPendiente {
  id: string
  numero: string
  total: number
}

export async function registrarPagoReportado(
  client: pg.PoolClient,
  datos: { conversacionId: string; extraccion: ExtraccionPago; mediaId: string; hoyISO?: string }
): Promise<ResultadoPagoReportado> {
  const { rows } = await client.query<{ id: string; numero: string; total: string }>(
    `select id, numero, total from orders
     where conversacion_id = $1 and estado = 'payment_pending'
     order by creado_en desc`,
    [datos.conversacionId]
  )
  const pendientes: PedidoPendiente[] = rows.map((r) => ({ id: r.id, numero: r.numero, total: Number(r.total) }))
  if (pendientes.length === 0) return { ok: false, error: 'SIN_PEDIDO_PENDIENTE' }

  // Con varios pedidos pendientes en la misma conversación, la captura va al que calza con el monto; si ninguno
  // calza, al más reciente (y el reporte queda marcado "no coincide" para que la trabajadora lo mire).
  const monto = datos.extraccion.monto
  const elegido =
    (monto !== null ? pendientes.find((p) => Math.abs(Math.round(p.total * 100) - Math.round(monto * 100)) <= 1) : undefined) ??
    pendientes[0]

  // Un mismo número de operación en dos pedidos distintos es una señal de alerta (un comprobante usado dos veces).
  let operacionRepetida = false
  if (datos.extraccion.numeroOperacion) {
    const repetida = await client.query(
      `select 1 from orders where pago_reportado ->> 'numeroOperacion' = $1 and id <> $2 limit 1`,
      [datos.extraccion.numeroOperacion, elegido.id]
    )
    operacionRepetida = (repetida.rowCount ?? 0) > 0
  }

  const evaluacion = evaluarPagoReportado({
    total: elegido.total,
    hoyISO: datos.hoyISO ?? fechaLimaISO(),
    extraccion: datos.extraccion,
    operacionRepetida,
  })

  await client.query(
    `update orders set pago_reportado = $2::jsonb, pago_reportado_en = now() where id = $1`,
    [
      elegido.id,
      JSON.stringify({
        ...datos.extraccion,
        coincideTotal: evaluacion.coincideTotal,
        requiereRevision: evaluacion.requiereRevision,
        motivos: evaluacion.motivos,
        mediaId: datos.mediaId,
      }),
    ]
  )

  return { ok: true, numeroPedido: elegido.numero, evaluacion }
}

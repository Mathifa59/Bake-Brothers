/**
 * Pago reportado por el cliente con una captura (Yape, Plin, transferencia).
 *
 * El bot LEE la captura (monto, fecha, número de operación) y deja el pedido como "pago reportado": la
 * trabajadora lo confirma o lo rechaza con un toque en el panel. El bot NUNCA da un pago por confirmado solo —
 * leer una imagen no prueba que el dinero llegó (puede estar editada, ser de otra operación, o ser de otro
 * monto). Esta función solo decide si los datos leídos CUADRAN con el pedido; si algo no cuadra, el reporte
 * queda marcado "requiere revisión" con el motivo, para que la trabajadora lo mire con más cuidado.
 *
 * Lógica pura, sin I/O: la lectura de la imagen (modelo) y la base viven en apps/api.
 */

/** Lo que el modelo logró leer de la imagen. Todo lo que no se pudo leer viene en null — nunca inventado. */
export interface ExtraccionPago {
  /** ¿La imagen parece un comprobante de pago (Yape, Plin, transferencia, voucher)? */
  esComprobante: boolean
  /** ¿Se lee con claridad? (borrosa, recortada o ilegible → false) */
  legible: boolean
  monto: number | null
  /** 'PEN' para soles; cualquier otra cosa se manda a revisión. */
  moneda: string | null
  /** AAAA-MM-DD */
  fecha: string | null
  numeroOperacion: string | null
  medio: 'yape' | 'plin' | 'transferencia' | 'otro' | null
}

export interface EvaluacionPago {
  /** true si el monto leído es el total del pedido (tolerancia de un céntimo); null si no se pudo leer el monto. */
  coincideTotal: boolean | null
  requiereRevision: boolean
  /** Por qué requiere revisión, en lenguaje que entiende quien confirma el pago. */
  motivos: string[]
}

/** Cuántos días hacia atrás se acepta la fecha de una captura sin pedir revisión. */
export const DIAS_MAXIMOS_ANTIGUEDAD_CAPTURA = 3

const sumarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

const soles = (n: number) => `S/ ${n.toFixed(2)}`

export function evaluarPagoReportado(params: {
  /** Total del pedido en soles. */
  total: number
  /** Fecha de hoy en Lima, AAAA-MM-DD. */
  hoyISO: string
  extraccion: ExtraccionPago
  /** true si el mismo número de operación ya figura en otro pedido (un comprobante usado dos veces). */
  operacionRepetida?: boolean
}): EvaluacionPago {
  const { total, hoyISO, extraccion: e, operacionRepetida } = params
  const motivos: string[] = []

  if (!e.esComprobante) motivos.push('La imagen no parece un comprobante de pago.')
  else if (!e.legible) motivos.push('El comprobante no se lee con claridad.')

  let coincideTotal: boolean | null = null
  if (e.monto === null) {
    motivos.push('No se pudo leer el monto.')
  } else {
    // En céntimos enteros: 25.91 - 25.90 da 0.0100000000000013 en punto flotante y quedaría fuera de la tolerancia.
    coincideTotal = Math.abs(Math.round(e.monto * 100) - Math.round(total * 100)) <= 1
    if (!coincideTotal) motivos.push(`El monto de la captura (${soles(e.monto)}) no coincide con el total del pedido (${soles(total)}).`)
  }

  if (e.moneda !== null && e.moneda.toUpperCase() !== 'PEN') motivos.push(`La moneda de la captura es ${e.moneda}, no soles.`)

  if (!e.numeroOperacion) motivos.push('No se leyó el número de operación.')
  else if (operacionRepetida) motivos.push(`El número de operación ${e.numeroOperacion} ya aparece en otro pedido.`)

  if (!e.fecha) {
    motivos.push('No se leyó la fecha.')
  } else if (e.fecha > sumarDias(hoyISO, 1)) {
    motivos.push(`La fecha de la captura (${e.fecha}) es futura.`)
  } else if (e.fecha < sumarDias(hoyISO, -DIAS_MAXIMOS_ANTIGUEDAD_CAPTURA)) {
    motivos.push(`La captura es antigua (${e.fecha}).`)
  }

  return { coincideTotal, requiereRevision: motivos.length > 0, motivos }
}

/**
 * Comprobantes electrónicos (boleta y factura) emitidos desde un pedido — reglas puras, sin I/O.
 *
 * Los precios de Bake Brothers YA INCLUYEN el IGV (18 %). SUNAT pide cada línea desglosada en valor sin IGV + IGV, y
 * que los totales cuadren. Todo se calcula en CÉNTIMOS ENTEROS (nunca en decimales de punto flotante) y de forma que
 *   valor de venta + IGV = lo que el cliente pagó, al céntimo, en cada línea y en el total.
 * El armado del JSON de Mifact vive en apps/api; aquí solo lo que es regla de negocio (como el resto de la lógica de
 * precios del proyecto, que vive únicamente en `packages/domain`).
 */

export type TipoComprobante = 'boleta' | 'factura'
/** Catálogo 01 de SUNAT: tipo de comprobante. */
export const CODIGO_TIPO_CPE = { boleta: '03', factura: '01' } as const satisfies Record<TipoComprobante, string>
export const TASA_IGV_PORCENTAJE = 18
/** SUNAT: una boleta de más de S/ 700 exige identificar al comprador con su documento. */
export const LIMITE_BOLETA_SIN_IDENTIFICAR = 700

// ———————————————————————————————————————————————————————————————— desglose ————

export interface LineaVenta {
  descripcion: string
  /** Cantidad entera mayor que cero. */
  cantidad: number
  /** Precio por unidad, YA con IGV, en soles (como está en el pedido). */
  precioUnitarioConIgv: number
}

export interface LineaDesglosada {
  descripcion: string
  cantidad: number
  precioUnitarioConIgv: number
  /** Valor unitario sin IGV (hasta 10 decimales, como pide Mifact). */
  valorUnitario: number
  /** Valor de venta de la línea sin IGV (base imponible), en soles con 2 decimales. */
  valorVenta: number
  igv: number
  /** Total de la línea con IGV. */
  totalConIgv: number
}

export interface DesgloseComprobante {
  lineas: LineaDesglosada[]
  gravado: number
  igv: number
  total: number
}

const aCentimos = (soles: number): number => Math.round(soles * 100)
const aSoles = (centimos: number): number => centimos / 100

/**
 * Desglosa líneas con IGV incluido. Por línea: base = total/1,18 redondeado al céntimo e IGV = total − base, así la
 * suma de la base y el IGV da exactamente lo cobrado. Los totales son la suma de las líneas (sin redondear aparte).
 */
export function desglosarLineas(lineas: readonly LineaVenta[]): DesgloseComprobante {
  if (lineas.length === 0) throw new Error('Un comprobante necesita al menos una línea')
  let gravadoC = 0
  let igvC = 0
  const salida: LineaDesglosada[] = lineas.map((l) => {
    if (!Number.isInteger(l.cantidad) || l.cantidad <= 0) throw new Error(`Cantidad inválida en «${l.descripcion}»`)
    if (!(l.precioUnitarioConIgv > 0)) throw new Error(`Precio inválido en «${l.descripcion}»`)
    const totalC = aCentimos(l.precioUnitarioConIgv) * l.cantidad
    const baseC = Math.round((totalC * 100) / (100 + TASA_IGV_PORCENTAJE))
    const lineaIgvC = totalC - baseC
    gravadoC += baseC
    igvC += lineaIgvC
    return {
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precioUnitarioConIgv: aSoles(aCentimos(l.precioUnitarioConIgv)),
      valorUnitario: Number((baseC / 100 / l.cantidad).toFixed(10)),
      valorVenta: aSoles(baseC),
      igv: aSoles(lineaIgvC),
      totalConIgv: aSoles(totalC),
    }
  })
  return { lineas: salida, gravado: aSoles(gravadoC), igv: aSoles(igvC), total: aSoles(gravadoC + igvC) }
}

/** ¿Cuadran el total del comprobante y el del pedido? (a lo más medio céntimo de diferencia: la misma cifra). */
export const totalesCoinciden = (a: number, b: number): boolean => aCentimos(a) === aCentimos(b)

// ———————————————————————————————————————————————————————————— documentos ————

/** RUC peruano: 11 dígitos, prefijo válido y dígito verificador (módulo 11 de SUNAT). */
export function validarRuc(ruc: string): boolean {
  if (!/^[0-9]{11}$/.test(ruc)) return false
  if (!['10', '15', '16', '17', '20'].includes(ruc.slice(0, 2))) return false
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const suma = pesos.reduce((s, p, i) => s + p * Number(ruc[i]), 0)
  const resto = 11 - (suma % 11)
  const digito = resto === 10 ? 0 : resto === 11 ? 1 : resto
  return digito === Number(ruc[10])
}

export const validarDni = (dni: string): boolean => /^[0-9]{8}$/.test(dni)

/** Tipo de documento del receptor (catálogo 06 de SUNAT) que aceptamos en un comprobante. */
export type TipoDocReceptor = '0' | '1' | '4' | '6' | '7'

export interface ReceptorEntrada {
  /** Si no viene se deduce por el largo del documento (8 → DNI, 11 → RUC). */
  tipoDoc?: TipoDocReceptor | null
  numeroDoc?: string | null
  nombre?: string | null
  direccion?: string | null
  correo?: string | null
}

export interface Receptor {
  tipoDoc: TipoDocReceptor
  numeroDoc: string
  nombre: string
  direccion: string
  correo: string | null
}

export type ErrorReceptor =
  | 'FACTURA_REQUIERE_RUC'
  | 'RUC_INVALIDO'
  | 'DNI_INVALIDO'
  | 'DOCUMENTO_NO_RECONOCIDO'
  | 'NOMBRE_REQUERIDO'
  | 'BOLETA_SOBRE_LIMITE_REQUIERE_DOCUMENTO'
  | 'CORREO_INVALIDO'

export type ResultadoReceptor = { ok: true; receptor: Receptor } | { ok: false; error: ErrorReceptor; detalle: string }

const limpiar = (s: string | null | undefined, max: number): string =>
  (s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Decide quién es el receptor del comprobante y rechaza lo que SUNAT rechazaría, ANTES de gastar un correlativo.
 *   · Factura: exige RUC válido y razón social.
 *   · Boleta: DNI, RUC, carnet de extranjería o pasaporte; sin documento solo hasta S/ 700 (CLIENTE SIN NOMBRE).
 */
export function resolverReceptor(tipo: TipoComprobante, entrada: ReceptorEntrada, totalSoles: number): ResultadoReceptor {
  const numero = limpiar(entrada.numeroDoc, 15)
  const nombre = limpiar(entrada.nombre, 100)
  const direccion = limpiar(entrada.direccion, 100)
  const correo = limpiar(entrada.correo, 100)
  if (correo && !CORREO.test(correo)) return { ok: false, error: 'CORREO_INVALIDO', detalle: 'El correo del receptor no es válido' }

  const tipoDoc: TipoDocReceptor | null =
    entrada.tipoDoc ?? (numero.length === 8 ? '1' : numero.length === 11 ? '6' : numero ? null : '0')
  if (tipoDoc === null) return { ok: false, error: 'DOCUMENTO_NO_RECONOCIDO', detalle: 'No se reconoce el tipo de documento: indica si es DNI, RUC, carnet o pasaporte' }

  if (tipo === 'factura') {
    if (tipoDoc !== '6') return { ok: false, error: 'FACTURA_REQUIERE_RUC', detalle: 'Una factura se emite a un RUC' }
    if (!validarRuc(numero)) return { ok: false, error: 'RUC_INVALIDO', detalle: 'El RUC no es válido (11 dígitos, dígito verificador)' }
    if (!nombre) return { ok: false, error: 'NOMBRE_REQUERIDO', detalle: 'Falta la razón social del receptor' }
    return { ok: true, receptor: { tipoDoc, numeroDoc: numero, nombre, direccion: direccion || '-', correo: correo || null } }
  }

  if (tipoDoc === '0' || numero === '') {
    if (totalSoles > LIMITE_BOLETA_SIN_IDENTIFICAR)
      return {
        ok: false,
        error: 'BOLETA_SOBRE_LIMITE_REQUIERE_DOCUMENTO',
        detalle: `Una boleta de más de S/ ${LIMITE_BOLETA_SIN_IDENTIFICAR} necesita el documento del comprador`,
      }
    return { ok: true, receptor: { tipoDoc: '0', numeroDoc: '00000000', nombre: nombre || 'CLIENTE SIN NOMBRE', direccion: direccion || 'SIN DIRECCION', correo: correo || null } }
  }
  if (tipoDoc === '1' && !validarDni(numero)) return { ok: false, error: 'DNI_INVALIDO', detalle: 'El DNI debe tener 8 dígitos' }
  if (tipoDoc === '6' && !validarRuc(numero)) return { ok: false, error: 'RUC_INVALIDO', detalle: 'El RUC no es válido (11 dígitos, dígito verificador)' }
  if (!nombre) return { ok: false, error: 'NOMBRE_REQUERIDO', detalle: 'Falta el nombre del receptor' }
  return { ok: true, receptor: { tipoDoc, numeroDoc: numero, nombre, direccion: direccion || 'SIN DIRECCION', correo: correo || null } }
}

// ———————————————————————————————————————————————————————————————— estados ————

/** Estado que Mifact devuelve en `estado_documento`. */
export const ESTADOS_MIFACT = {
  101: 'en_proceso',
  102: 'aceptado',
  103: 'aceptado_con_observaciones',
  104: 'rechazado',
  105: 'anulado',
  108: 'anulacion_solicitada',
} as const

export type EstadoComprobante =
  | 'pendiente_envio'
  | 'en_proceso'
  | 'aceptado'
  | 'aceptado_con_observaciones'
  | 'rechazado'
  | 'anulacion_solicitada'
  | 'anulado'
  | 'error'

/** Traduce el código de Mifact (101…108) a nuestro estado; null si no es uno conocido (nunca se inventa). */
export function estadoDeCodigoMifact(codigo: string | number | null | undefined): { codigo: keyof typeof ESTADOS_MIFACT; estado: EstadoComprobante } | null {
  const n = Number(codigo)
  if (!Number.isInteger(n) || !(n in ESTADOS_MIFACT)) return null
  const c = n as keyof typeof ESTADOS_MIFACT
  return { codigo: c, estado: ESTADOS_MIFACT[c] }
}

const LEGIBLE: Record<EstadoComprobante, string> = {
  pendiente_envio: 'Pendiente de envío',
  en_proceso: 'En proceso',
  aceptado: 'Aceptado por SUNAT',
  aceptado_con_observaciones: 'Aceptado con observaciones',
  rechazado: 'Rechazado por SUNAT',
  anulacion_solicitada: 'Anulación solicitada',
  anulado: 'Anulado',
  error: 'Con error',
}
export const estadoComprobanteLegible = (e: EstadoComprobante): string => LEGIBLE[e]

/** Estados en los que el comprobante todavía vale y se puede pedir su anulación. */
export const ESTADOS_ANULABLES: readonly EstadoComprobante[] = ['en_proceso', 'aceptado', 'aceptado_con_observaciones']
/** «Vigente» = el pedido ya tiene su comprobante: no se emite otro (debe coincidir con el índice único de la 0052). */
export const ESTADOS_VIGENTES: readonly EstadoComprobante[] = ['pendiente_envio', 'en_proceso', 'aceptado', 'aceptado_con_observaciones']

/** Un pedido se factura cuando ya es una venta firme: no en borrador, ni esperando el pago, ni anulado. */
export const ESTADOS_PEDIDO_FACTURABLES = ['confirmed', 'paid', 'in_production', 'out_for_delivery', 'delivered'] as const
export const pedidoEsFacturable = (estadoPedido: string): boolean => (ESTADOS_PEDIDO_FACTURABLES as readonly string[]).includes(estadoPedido)

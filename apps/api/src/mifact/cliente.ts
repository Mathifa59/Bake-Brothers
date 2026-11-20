/**
 * Cliente HTTP de la API JSON de Mifact (invoiceService.svc). Solo habla con Mifact: no toca la base ni conoce pedidos.
 *
 * Cómo responde Mifact (verificado contra demo.mifact.net.pe el 2026-11-17):
 *   · SIEMPRE HTTP 200, también ante un error de negocio: lo que importa es el campo `errors` (vacío = bien).
 *     Ejemplos reales: «el documento ya existe en la BD» (número repetido), «El documento consultado no existe».
 *   · El cuerpo es JSON (a veces llega como cadena JSON dentro de JSON: se desenvuelve).
 *
 * Dos clases de fallo, y la diferencia es lo que protege la numeración fiscal:
 *   · MifactApiError  → Mifact RESPONDIÓ y dijo que no (`errors`): el documento NO quedó registrado.
 *   · MifactRedError  → no hay respuesta confiable (sin red, tiempo agotado, HTTP 5xx, cuerpo ilegible): el documento
 *                       PUDO haber quedado registrado. Hay que consultar su estado antes de reutilizar el número.
 *
 * El token se agrega aquí y NUNCA aparece en un mensaje de error ni en un log.
 */

export interface RespuestaMifact {
  cadenaQr: string
  cdrSunat: string
  hash: string
  correlativo: string
  errors: string
  /** Código interno de Mifact: 101 en proceso, 102 aceptado, 103 con observaciones, 104 rechazado, 105 anulado, 108 anulación solicitada. */
  estadoDocumento: string
  /** PDF en base64 (solo cuando se pide). */
  pdfBytes: string | null
  serie: string
  sunatDescription: string
  sunatNote: string
  sunatResponseCode: string
  ticketSunat: string
  tipo: string
  /** URL pública donde Mifact publica el PDF. */
  url: string
  xmlEnviado: string
}

export class MifactRedError extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'MifactRedError'
  }
}

export class MifactApiError extends Error {
  constructor(
    mensaje: string,
    readonly respuesta: RespuestaMifact
  ) {
    super(mensaje)
    this.name = 'MifactApiError'
  }
}

/** Mifact dice que ese serie-correlativo ya está registrado. */
export const esNumeroYaUsado = (e: unknown): boolean => e instanceof MifactApiError && /ya existe/i.test(e.message)
/** Mifact dice que no conoce ese documento. */
export const esDocumentoInexistente = (e: unknown): boolean => e instanceof MifactApiError && /no existe/i.test(e.message)

export interface OpcionesCliente {
  /** Por defecto `fetch` global (se lee al llamar, así los tests pueden sustituirlo). */
  fetch?: typeof fetch
  timeoutMs?: number
}

export interface IdentificadorDocumento {
  ruc: string
  /** '01' factura, '03' boleta. */
  tipoCpe: string
  serie: string
  correlativo: number
  /** AAAA-MM-DD; Mifact lo exige para buscar el documento. */
  fechaEmision: string
}

const s = (x: unknown): string => (typeof x === 'string' ? x : x == null ? '' : String(x))
const correlativo8 = (n: number) => String(n).padStart(8, '0')

export function crearClienteMifact(config: { url: string; token: string }, opciones: OpcionesCliente = {}) {
  const base = config.url.replace(/\/+$/, '')
  const timeoutMs = opciones.timeoutMs ?? 30_000

  const sinToken = (texto: string): string => (config.token ? texto.split(config.token).join('***') : texto)
  const limpiar = (texto: string): string => sinToken(texto).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 1000)

  async function llamar(metodo: string, cuerpo: Record<string, unknown>): Promise<RespuestaMifact> {
    const hacerFetch = opciones.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a))
    let res: Response
    try {
      res = await hacerFetch(`${base}/${metodo}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ TOKEN: config.token, ...cuerpo }),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (err) {
      const motivo = err instanceof Error && err.name === 'TimeoutError' ? 'se agotó el tiempo de espera' : 'no se pudo conectar'
      throw new MifactRedError(`Mifact (${metodo}): ${motivo}`)
    }
    if (!res.ok) throw new MifactRedError(`Mifact (${metodo}) respondió HTTP ${res.status}`)

    let datos: unknown
    try {
      datos = JSON.parse(await res.text())
      if (typeof datos === 'string') datos = JSON.parse(datos) // a veces llega como cadena JSON
    } catch {
      throw new MifactRedError(`Mifact (${metodo}) devolvió una respuesta ilegible`)
    }
    if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) throw new MifactRedError(`Mifact (${metodo}) devolvió una respuesta inesperada`)
    const d = datos as Record<string, unknown>
    const respuesta: RespuestaMifact = {
      cadenaQr: s(d.cadena_para_codigo_qr),
      cdrSunat: s(d.cdr_sunat),
      hash: s(d.codigo_hash),
      correlativo: s(d.correlativo_cpe),
      errors: limpiar(s(d.errors)),
      estadoDocumento: s(d.estado_documento),
      pdfBytes: typeof d.pdf_bytes === 'string' && d.pdf_bytes ? d.pdf_bytes : null,
      serie: s(d.serie_cpe),
      sunatDescription: limpiar(s(d.sunat_description)),
      sunatNote: limpiar(s(d.sunat_note)),
      sunatResponseCode: s(d.sunat_responsecode),
      ticketSunat: s(d.ticket_sunat),
      tipo: s(d.tipo_cpe),
      url: s(d.url),
      xmlEnviado: s(d.xml_enviado),
    }
    if (respuesta.errors) throw new MifactApiError(respuesta.errors, respuesta)
    return respuesta
  }

  const id = (d: IdentificadorDocumento) => ({
    NUM_NIF_EMIS: d.ruc,
    COD_TIP_CPE: d.tipoCpe,
    NUM_SERIE_CPE: d.serie,
    NUM_CORRE_CPE: correlativo8(d.correlativo),
    FEC_EMIS: d.fechaEmision,
  })

  return {
    /** Emite un comprobante (SendInvoice). `documento` es el JSON del comprobante SIN el token. */
    enviar: (documento: Record<string, unknown>) => llamar('SendInvoice', documento),
    /** Estado en Mifact y SUNAT (GetEstatusInvoice). */
    estado: (d: IdentificadorDocumento) => llamar('GetEstatusInvoice', id(d)),
    /** PDF en base64 y URL pública (GetInvoice). */
    descargarPdf: (d: IdentificadorDocumento, formato: '001' | '002' | '004' = '001') =>
      llamar('GetInvoice', { ...id(d), RETORNA_XML_ENVIO: 'false', RETORNA_XML_CDR: 'false', RETORNA_PDF: 'true', COD_FORM_IMPR: formato }),
    /** Pide la baja (LowInvoice): queda en 108 «anulación solicitada» y Mifact la procesa al final del día (→ 105). */
    anular: (d: IdentificadorDocumento, motivo: string, usuario: string) =>
      llamar('LowInvoice', { ...id(d), COD_TIP_NIF_EMIS: '6', TXT_DESC_MTVO: motivo, COD_PTO_VENTA: usuario }),
    /** Manda el comprobante por correo desde Mifact (SendMailInvoice). */
    enviarCorreo: (d: IdentificadorDocumento, correo: string) => llamar('SendMailInvoice', { ...id(d), TXT_CORREO_ENVIO: correo }),
  }
}

export type ClienteMifact = ReturnType<typeof crearClienteMifact>

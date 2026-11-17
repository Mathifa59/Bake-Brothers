import { CODIGO_TIPO_CPE, type DesgloseComprobante, type Receptor, type TipoComprobante } from '@bakebrothers/domain'
import type { ConfigEmisorMifact } from './config.js'

/**
 * Arma el JSON de un comprobante para Mifact (SendInvoice) a partir de datos ya validados y desglosados. Función
 * pura: no lleva el token (lo agrega el cliente HTTP), así lo que se guarda en la base y lo que se prueba nunca
 * contiene un secreto. Los nombres de los campos son los de la documentación de Mifact (DocumentacionFV_BV_NC_ND_Json).
 */

export interface EntradaDocumento {
  config: ConfigEmisorMifact
  tipo: TipoComprobante
  serie: string
  correlativo: number
  /** AAAA-MM-DD (hoy en Lima). */
  fechaEmision: string
  receptor: Receptor
  desglose: DesgloseComprobante
  /** Código de cada línea (mismo orden que `desglose.lineas`). */
  codigosItem: string[]
  /** Texto que sale como observación en el comprobante (p. ej. «Pedido BB-2500»). */
  observacion?: string
  /** Usuario que emite (Mifact lo guarda como «punto de venta»). */
  usuario: string
}

const dos = (n: number): string => n.toFixed(2)
/** Hasta 10 decimales (valor unitario), sin ceros sobrantes. */
const hasta10 = (n: number): string => String(Number(n.toFixed(10)))
const texto = (s: string, max: number): string => s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

export function construirDocumento(e: EntradaDocumento): Record<string, unknown> {
  const { config, desglose } = e
  const doc: Record<string, unknown> = {
    COD_TIP_NIF_EMIS: '6',
    NUM_NIF_EMIS: config.ruc,
    NOM_RZN_SOC_EMIS: config.razonSocial,
    ...(config.nombreComercial ? { NOM_COMER_EMIS: config.nombreComercial } : {}),
    COD_UBI_EMIS: config.ubigeo,
    TXT_DMCL_FISC_EMIS: config.direccionFiscal,
    COD_TIP_NIF_RECP: e.receptor.tipoDoc,
    NUM_NIF_RECP: e.receptor.numeroDoc,
    NOM_RZN_SOC_RECP: e.receptor.nombre,
    TXT_DMCL_FISC_RECEP: e.receptor.direccion,
    FEC_EMIS: e.fechaEmision,
    COD_TIP_CPE: CODIGO_TIPO_CPE[e.tipo],
    NUM_SERIE_CPE: e.serie,
    NUM_CORRE_CPE: String(e.correlativo).padStart(8, '0'),
    COD_MND: 'PEN',
    ...(e.receptor.correo ? { TXT_CORREO_ENVIO: e.receptor.correo } : {}),
    COD_PRCD_CARGA: '001',
    MNT_TOT_GRAVADO: dos(desglose.gravado),
    MNT_TOT_TRIB_IGV: dos(desglose.igv),
    MNT_TOT: dos(desglose.total),
    COD_PTO_VENTA: texto(e.usuario, 30) || 'bakeos',
    ENVIAR_A_SUNAT: 'true',
    RETORNA_XML_ENVIO: 'false',
    RETORNA_XML_CDR: 'false',
    // El PDF se pide aparte (GetInvoice) y se guarda en el pedido.
    RETORNA_PDF: 'false',
    COD_FORM_IMPR: config.formatoPdf,
    TXT_VERS_UBL: '2.1',
    TXT_VERS_ESTRUCT_UBL: '2.0',
    COD_ANEXO_EMIS: config.codigoAnexo,
    // Catálogo 51 de SUNAT: 0101 = venta interna.
    COD_TIP_OPE_SUNAT: '0101',
    items: desglose.lineas.map((l, i) => ({
      COD_ITEM: texto(e.codigosItem[i] ?? 'ITEM', 30) || 'ITEM',
      COD_UNID_ITEM: 'NIU',
      CANT_UNID_ITEM: String(l.cantidad),
      VAL_UNIT_ITEM: hasta10(l.valorUnitario),
      PRC_VTA_UNIT_ITEM: dos(l.precioUnitarioConIgv),
      VAL_VTA_ITEM: dos(l.valorVenta),
      MNT_PV_ITEM: dos(l.totalConIgv),
      COD_TIP_PRC_VTA: '01',
      // Catálogo 07: 10 = gravado, operación onerosa. Código de tributo 1000 = IGV.
      COD_TIP_AFECT_IGV_ITEM: '10',
      COD_TRIB_IGV_ITEM: '1000',
      POR_IGV_ITEM: '18',
      MNT_IGV_ITEM: dos(l.igv),
      TXT_DESC_ITEM: texto(l.descripcion, 500),
    })),
  }
  const obs = texto(e.observacion ?? '', 200)
  if (obs) doc.datos_adicionales = [{ COD_TIP_ADIC_SUNAT: '05', TXT_DESC_ADIC_SUNAT: obs }]
  return doc
}

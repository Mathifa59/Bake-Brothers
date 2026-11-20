import { validarRuc, type EntidadCobro } from '@bakebrothers/domain'

/**
 * Configuración de Mifact POR EMISOR (razón social), toda en variables de entorno: pasar del demo a producción es
 * cambiar variables y reiniciar, sin tocar código. Hay dos emisores (ver packages/domain/src/cobros.ts):
 *
 *   MIFACT_BAKER_BROTHERS_*   → Baker Brothers E.I.R.L.            (Santa Marina y todo delivery)
 *   MIFACT_HERMANOS_LOARTE_*  → Corporación Hermanos Loarte S.A.C. (Cedros)
 *
 * Variables de cada emisor (sufijo después del prefijo):
 *   URL            base del servicio, p. ej. https://demo.mifact.net.pe/api/invoiceService.svc  (producción: la que dé Mifact)
 *   TOKEN          token de ESE emisor (secreto: solo en variables de entorno, nunca en el repo ni en la base)
 *   RUC            RUC de ese emisor (11 dígitos)
 *   RAZON_SOCIAL   tal como está registrada en SUNAT
 *   NOMBRE_COMERCIAL  opcional
 *   UBIGEO         ubigeo INEI de la dirección fiscal (6 dígitos)
 *   DIRECCION      dirección fiscal
 *   SERIE_BOLETA   B + 3 caracteres (p. ej. B001)
 *   SERIE_FACTURA  F + 3 caracteres (p. ej. F001)
 *   CODIGO_ANEXO   opcional, código de anexo SUNAT del emisor (por defecto 0000 = principal)
 *   CODIGO_ANEXO_<LOCAL>  opcional, código de establecimiento de UN local (p. ej. CODIGO_ANEXO_SANTA_MARINA); gana sobre
 *                  CODIGO_ANEXO cuando el pedido es de ese local. Un delivery sin local usa CODIGO_ANEXO.
 *   CORRELATIVO_INICIAL  opcional: número con el que empieza cada serie la PRIMERA vez (por defecto 1)
 *   FORMATO_PDF    opcional: 001 = A4 (por defecto), 002 = A5, 004 = ticket 80 mm
 *
 * Se leen al usarlas (como META_APP_SECRET), no al arrancar: la API funciona igual sin Mifact configurado. Un emisor
 * que no está completo o tiene algo inválido responde MIFACT_NO_CONFIGURADO, diciendo QUÉ variables (nunca sus valores).
 */
export type EntornoMifact = 'demo' | 'produccion'

export interface ConfigEmisorMifact {
  emisor: EntidadCobro
  entorno: EntornoMifact
  url: string
  token: string
  ruc: string
  razonSocial: string
  nombreComercial: string | null
  ubigeo: string
  direccionFiscal: string
  serieBoleta: string
  serieFactura: string
  codigoAnexo: string
  correlativoInicial: number
  formatoPdf: '001' | '002' | '004'
}

export const PREFIJO_ENV: Record<EntidadCobro, string> = {
  baker_brothers: 'MIFACT_BAKER_BROTHERS',
  hermanos_loarte: 'MIFACT_HERMANOS_LOARTE',
}

export type ResultadoConfigEmisor =
  | { ok: true; config: ConfigEmisorMifact }
  | { ok: false; faltan: string[]; invalidas: { variable: string; motivo: string }[] }

/** «Santa Marina» → «SANTA_MARINA» (sin tildes, mayúsculas, no alfanuméricos → «_»): el sufijo de CODIGO_ANEXO_<LOCAL>. */
export function sufijoDeLocal(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * `local` = nombre de la sede que vende (p. ej. «Santa Marina»); null/omitido = sin local (delivery sin asignar):
 * se usa el anexo del emisor.
 */
export function leerConfigEmisor(
  emisor: EntidadCobro,
  fuente: Record<string, string | undefined> = process.env,
  local: string | null = null
): ResultadoConfigEmisor {
  const prefijo = PREFIJO_ENV[emisor]
  const v = (sufijo: string): string => (fuente[`${prefijo}_${sufijo}`] ?? '').trim()
  const faltan: string[] = []
  const invalidas: { variable: string; motivo: string }[] = []
  const obligatoria = (sufijo: string): string => {
    const valor = v(sufijo)
    if (!valor) faltan.push(`${prefijo}_${sufijo}`)
    return valor
  }
  const invalida = (sufijo: string, motivo: string) => invalidas.push({ variable: `${prefijo}_${sufijo}`, motivo })

  const urlCruda = obligatoria('URL')
  const token = obligatoria('TOKEN')
  const ruc = obligatoria('RUC')
  const razonSocial = obligatoria('RAZON_SOCIAL')
  const ubigeo = obligatoria('UBIGEO')
  const direccionFiscal = obligatoria('DIRECCION')
  const serieBoleta = obligatoria('SERIE_BOLETA').toUpperCase()
  const serieFactura = obligatoria('SERIE_FACTURA').toUpperCase()

  let url = ''
  let entorno: EntornoMifact = 'produccion'
  if (urlCruda) {
    try {
      const u = new URL(urlCruda)
      const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
      if (u.protocol !== 'https:' && !local) invalida('URL', 'debe ser https')
      url = urlCruda.replace(/\/+$/, '')
      // El demo de Mifact vive en demo.mifact.net.pe; cualquier otra dirección es producción (más estricta, abajo).
      entorno = u.hostname.startsWith('demo.') || local ? 'demo' : 'produccion'
    } catch {
      invalida('URL', 'no es una dirección válida')
    }
  }
  if (ruc) {
    if (!/^[0-9]{11}$/.test(ruc)) invalida('RUC', 'debe tener 11 dígitos')
    // En producción el RUC es real: se exige el dígito verificador (el RUC de pruebas de Mifact NO lo cumple, así que
    // no puede usarse por error contra la URL de producción).
    else if (entorno === 'produccion' && !validarRuc(ruc)) invalida('RUC', 'no es un RUC válido (en producción se exige el dígito verificador)')
  }
  if (ubigeo && !/^[0-9]{6}$/.test(ubigeo)) invalida('UBIGEO', 'debe tener 6 dígitos')
  if (serieBoleta && !/^B[A-Z0-9]{3}$/.test(serieBoleta)) invalida('SERIE_BOLETA', 'debe ser B + 3 caracteres (B001)')
  if (serieFactura && !/^F[A-Z0-9]{3}$/.test(serieFactura)) invalida('SERIE_FACTURA', 'debe ser F + 3 caracteres (F001)')

  // Código de establecimiento (anexo) de SUNAT: uno por local si está configurado (CODIGO_ANEXO_<LOCAL>), si no el del
  // emisor (CODIGO_ANEXO) y, si tampoco, 0000. Un delivery sin local usa el del emisor.
  const sufijoLocal = local ? sufijoDeLocal(local) : ''
  const anexoLocal = sufijoLocal ? v(`CODIGO_ANEXO_${sufijoLocal}`) : ''
  const codigoAnexo = anexoLocal || v('CODIGO_ANEXO') || '0000'
  if (!/^[0-9]{4}$/.test(codigoAnexo)) invalida(anexoLocal ? `CODIGO_ANEXO_${sufijoLocal}` : 'CODIGO_ANEXO', 'debe tener 4 dígitos')
  const inicialCrudo = v('CORRELATIVO_INICIAL') || '1'
  const correlativoInicial = Number(inicialCrudo)
  if (!Number.isInteger(correlativoInicial) || correlativoInicial < 1 || correlativoInicial > 99999999) invalida('CORRELATIVO_INICIAL', 'debe ser un entero entre 1 y 99999999')
  const formatoPdf = v('FORMATO_PDF') || '001'
  if (!['001', '002', '004'].includes(formatoPdf)) invalida('FORMATO_PDF', 'debe ser 001, 002 o 004')

  if (faltan.length > 0 || invalidas.length > 0) return { ok: false, faltan, invalidas }
  return {
    ok: true,
    config: {
      emisor,
      entorno,
      url,
      token,
      ruc,
      razonSocial,
      nombreComercial: v('NOMBRE_COMERCIAL') || null,
      ubigeo,
      direccionFiscal,
      serieBoleta,
      serieFactura,
      codigoAnexo,
      correlativoInicial,
      formatoPdf: formatoPdf as ConfigEmisorMifact['formatoPdf'],
    },
  }
}

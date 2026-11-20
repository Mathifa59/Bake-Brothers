// Configuración por emisor, cliente HTTP de Mifact y armado del JSON del comprobante. Sin base de datos y sin red:
// el «Mifact» es el simulador de test/helpers/falsoMifact.ts (reproduce lo observado en el demo real).
import { describe, expect, it } from 'vitest'
import { desglosarLineas, resolverReceptor } from '@bakebrothers/domain'
import { leerConfigEmisor, sufijoDeLocal, type ConfigEmisorMifact } from '../src/mifact/config.js'
import {
  MifactApiError,
  MifactRedError,
  crearClienteMifact,
  esDocumentoInexistente,
  esNumeroYaUsado,
} from '../src/mifact/cliente.js'
import { construirDocumento } from '../src/mifact/construirDocumento.js'
import { FalsoMifact } from './helpers/falsoMifact.js'

const TOKEN = 'TOKEN-SECRETO-DE-PRUEBA=='
const completo = (extra: Record<string, string> = {}): Record<string, string> => ({
  MIFACT_BAKER_BROTHERS_URL: 'https://demo.mifact.net.pe/api/invoiceService.svc/',
  MIFACT_BAKER_BROTHERS_TOKEN: TOKEN,
  MIFACT_BAKER_BROTHERS_RUC: '20100100100',
  MIFACT_BAKER_BROTHERS_RAZON_SOCIAL: 'empresa demo',
  MIFACT_BAKER_BROTHERS_UBIGEO: '103040',
  MIFACT_BAKER_BROTHERS_DIRECCION: 'avenida abcd',
  MIFACT_BAKER_BROTHERS_SERIE_BOLETA: 'BT01',
  MIFACT_BAKER_BROTHERS_SERIE_FACTURA: 'FT01',
  ...extra,
})

describe('configuración de Mifact por emisor (variables de entorno)', () => {
  it('con todo lo necesario: el entorno demo se reconoce por la URL y la URL se normaliza', () => {
    const r = leerConfigEmisor('baker_brothers', completo())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.config).toMatchObject({
      emisor: 'baker_brothers', entorno: 'demo', url: 'https://demo.mifact.net.pe/api/invoiceService.svc', ruc: '20100100100',
      serieBoleta: 'BT01', serieFactura: 'FT01', codigoAnexo: '0000', correlativoInicial: 1, formatoPdf: '001', nombreComercial: null,
    })
  })

  it('cada emisor lee SUS variables: lo de Baker Brothers no sirve para Hermanos Loarte', () => {
    const r = leerConfigEmisor('hermanos_loarte', completo())
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.faltan).toContain('MIFACT_HERMANOS_LOARTE_URL')
    expect(r.faltan).toContain('MIFACT_HERMANOS_LOARTE_TOKEN')
    expect(r.faltan.every((v) => v.startsWith('MIFACT_HERMANOS_LOARTE_'))).toBe(true)
  })

  it('lo que falta se dice por NOMBRE de variable y nunca se devuelve un valor (ni el token)', () => {
    const { MIFACT_BAKER_BROTHERS_UBIGEO, MIFACT_BAKER_BROTHERS_SERIE_FACTURA, ...resto } = completo()
    void MIFACT_BAKER_BROTHERS_UBIGEO
    void MIFACT_BAKER_BROTHERS_SERIE_FACTURA
    const r = leerConfigEmisor('baker_brothers', resto)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.faltan).toEqual(['MIFACT_BAKER_BROTHERS_UBIGEO', 'MIFACT_BAKER_BROTHERS_SERIE_FACTURA'])
    expect(JSON.stringify(r)).not.toContain(TOKEN)
  })

  it('valores inválidos: URL sin https, RUC corto, serie mal formada, ubigeo, anexo y correlativo inicial', () => {
    const r = leerConfigEmisor('baker_brothers', completo({
      MIFACT_BAKER_BROTHERS_URL: 'http://demo.mifact.net.pe/x',
      MIFACT_BAKER_BROTHERS_RUC: '2010010',
      MIFACT_BAKER_BROTHERS_SERIE_BOLETA: 'F001',
      MIFACT_BAKER_BROTHERS_SERIE_FACTURA: 'B001',
      MIFACT_BAKER_BROTHERS_UBIGEO: '10304',
      MIFACT_BAKER_BROTHERS_CODIGO_ANEXO: '1',
      MIFACT_BAKER_BROTHERS_CORRELATIVO_INICIAL: '0',
      MIFACT_BAKER_BROTHERS_FORMATO_PDF: '009',
    }))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.invalidas.map((i) => i.variable).sort()).toEqual([
      'MIFACT_BAKER_BROTHERS_CODIGO_ANEXO', 'MIFACT_BAKER_BROTHERS_CORRELATIVO_INICIAL', 'MIFACT_BAKER_BROTHERS_FORMATO_PDF',
      'MIFACT_BAKER_BROTHERS_RUC', 'MIFACT_BAKER_BROTHERS_SERIE_BOLETA', 'MIFACT_BAKER_BROTHERS_SERIE_FACTURA',
      'MIFACT_BAKER_BROTHERS_UBIGEO', 'MIFACT_BAKER_BROTHERS_URL',
    ])
  })

  it('PRODUCCIÓN: otra URL = producción, y el RUC debe tener dígito verificador (el RUC de pruebas de Mifact no lo cumple)', () => {
    const conRucDemo = leerConfigEmisor('baker_brothers', completo({ MIFACT_BAKER_BROTHERS_URL: 'https://api.mifact.net.pe/api/invoiceService.svc' }))
    expect(conRucDemo.ok).toBe(false)
    if (conRucDemo.ok) return
    expect(conRucDemo.invalidas).toEqual([{ variable: 'MIFACT_BAKER_BROTHERS_RUC', motivo: expect.stringContaining('dígito verificador') }])

    const real = leerConfigEmisor('baker_brothers', completo({ MIFACT_BAKER_BROTHERS_URL: 'https://api.mifact.net.pe/api/invoiceService.svc', MIFACT_BAKER_BROTHERS_RUC: '20612010880' }))
    expect(real.ok && real.config.entorno).toBe('produccion')
  })

  it('opcionales: nombre comercial, anexo, correlativo inicial y formato de PDF', () => {
    const r = leerConfigEmisor('baker_brothers', completo({
      MIFACT_BAKER_BROTHERS_NOMBRE_COMERCIAL: 'Bake Brothers', MIFACT_BAKER_BROTHERS_CODIGO_ANEXO: '0001',
      MIFACT_BAKER_BROTHERS_CORRELATIVO_INICIAL: '1235', MIFACT_BAKER_BROTHERS_FORMATO_PDF: '004',
    }))
    expect(r.ok && r.config).toMatchObject({ nombreComercial: 'Bake Brothers', codigoAnexo: '0001', correlativoInicial: 1235, formatoPdf: '004' })
  })

  it('código de establecimiento POR LOCAL: gana el del local; sin local o sin variable del local, el del emisor; sin nada, 0000', () => {
    const env = completo({ MIFACT_BAKER_BROTHERS_CODIGO_ANEXO: '0002', MIFACT_BAKER_BROTHERS_CODIGO_ANEXO_SANTA_MARINA: '0007' })
    const anexo = (local: string | null) => {
      const r = leerConfigEmisor('baker_brothers', env, local)
      return r.ok ? r.config.codigoAnexo : r
    }
    expect(anexo('Santa Marina')).toBe('0007')
    expect(anexo('santa  marina')).toBe('0007') // mayúsculas y espacios no importan
    expect(anexo('Cedros')).toBe('0002') // otro local sin variable propia → el del emisor
    expect(anexo(null)).toBe('0002') // delivery sin local → el del emisor
    const sinNada = leerConfigEmisor('baker_brothers', completo(), 'Santa Marina')
    expect(sinNada.ok && sinNada.config.codigoAnexo).toBe('0000')
  })

  it('el código de un local mal formado se reporta con SU nombre de variable (solo si ese local es el que se usa)', () => {
    const env = completo({ MIFACT_BAKER_BROTHERS_CODIGO_ANEXO_SANTA_MARINA: '7' })
    const r = leerConfigEmisor('baker_brothers', env, 'Santa Marina')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.invalidas).toEqual([{ variable: 'MIFACT_BAKER_BROTHERS_CODIGO_ANEXO_SANTA_MARINA', motivo: expect.any(String) }])
    expect(leerConfigEmisor('baker_brothers', env, 'Cedros').ok).toBe(true)
  })

  it('sufijoDeLocal: sin tildes, mayúsculas y guion bajo', () => {
    expect(sufijoDeLocal('Santa Marina')).toBe('SANTA_MARINA')
    expect(sufijoDeLocal(' Cédros ')).toBe('CEDROS')
  })

  it('el código de establecimiento del local llega al JSON que se envía (COD_ANEXO_EMIS)', () => {
    const r = leerConfigEmisor('baker_brothers', completo({ MIFACT_BAKER_BROTHERS_CODIGO_ANEXO_SANTA_MARINA: '0007' }), 'Santa Marina')
    if (!r.ok) throw new Error('config')
    const desglose = desglosarLineas([{ descripcion: 'x', cantidad: 1, precioUnitarioConIgv: 10 }])
    const rec = resolverReceptor('boleta', {}, desglose.total)
    if (!rec.ok) throw new Error('receptor')
    const doc = construirDocumento({ config: r.config, tipo: 'boleta', serie: 'BT01', correlativo: 1, fechaEmision: '2026-11-17', receptor: rec.receptor, desglose, codigosItem: ['X'], usuario: 'u' })
    expect(doc.COD_ANEXO_EMIS).toBe('0007')
  })
})

describe('cliente HTTP de Mifact', () => {
  const nuevo = () => {
    const falso = new FalsoMifact(TOKEN)
    const cliente = crearClienteMifact({ url: 'https://demo.mifact.net.pe/api/invoiceService.svc/', token: TOKEN }, { fetch: falso.fetch as typeof fetch })
    return { falso, cliente }
  }
  const doc = { ruc: '20100100100', tipoCpe: '03', serie: 'BT01', correlativo: 7, fechaEmision: '2026-11-17' }

  it('cada método llama a su endpoint con POST, JSON y el token; el correlativo va a 8 dígitos', async () => {
    const { falso, cliente } = nuevo()
    await cliente.enviar({ COD_TIP_CPE: '03', NUM_SERIE_CPE: 'BT01', NUM_CORRE_CPE: '00000007', NUM_NIF_EMIS: '20100100100' })
    await cliente.estado(doc)
    await cliente.descargarPdf(doc, '004')
    await cliente.enviarCorreo(doc, 'a@b.pe')
    await cliente.anular(doc, 'ANULACION POR ERROR', 'bakeos')
    expect(falso.llamadas.map((l) => l.metodo)).toEqual(['SendInvoice', 'GetEstatusInvoice', 'GetInvoice', 'SendMailInvoice', 'LowInvoice'])
    expect(falso.llamadas.every((l) => l.cuerpo.TOKEN === TOKEN)).toBe(true)
    const [, estado, pdf, correo, baja] = falso.llamadas.map((l) => l.cuerpo)
    expect(estado).toMatchObject({ NUM_NIF_EMIS: '20100100100', COD_TIP_CPE: '03', NUM_SERIE_CPE: 'BT01', NUM_CORRE_CPE: '00000007', FEC_EMIS: '2026-11-17' })
    expect(pdf).toMatchObject({ RETORNA_PDF: 'true', RETORNA_XML_ENVIO: 'false', RETORNA_XML_CDR: 'false', COD_FORM_IMPR: '004' })
    expect(correo).toMatchObject({ TXT_CORREO_ENVIO: 'a@b.pe', NUM_CORRE_CPE: '00000007' })
    expect(baja).toMatchObject({ COD_TIP_NIF_EMIS: '6', TXT_DESC_MTVO: 'ANULACION POR ERROR', COD_PTO_VENTA: 'bakeos' })
  })

  it('«errors» lleno es un fallo de Mifact (aunque el HTTP sea 200): número repetido y documento inexistente se distinguen', async () => {
    const { falso, cliente } = nuevo()
    falso.registrar('03', 'BT01', 7)
    const repetido = await cliente.enviar({ COD_TIP_CPE: '03', NUM_SERIE_CPE: 'BT01', NUM_CORRE_CPE: '00000007' }).catch((e) => e)
    expect(repetido).toBeInstanceOf(MifactApiError)
    expect(esNumeroYaUsado(repetido)).toBe(true)
    expect(esDocumentoInexistente(repetido)).toBe(false)

    const inexistente = await cliente.estado({ ...doc, correlativo: 999 }).catch((e) => e)
    expect(inexistente).toBeInstanceOf(MifactApiError)
    expect(esDocumentoInexistente(inexistente)).toBe(true)
    expect(esNumeroYaUsado(inexistente)).toBe(false)
  })

  it('una respuesta buena trae el estado, el hash y la URL del PDF; el JSON doblemente codificado también se entiende', async () => {
    const { falso, cliente } = nuevo()
    falso.registrar('03', 'BT01', 7)
    const r = await cliente.estado(doc)
    expect(r).toMatchObject({ estadoDocumento: '102', serie: 'BT01', errors: '', sunatResponseCode: '0' })
    const pdf = await cliente.descargarPdf(doc)
    expect(pdf.url).toContain('BT01-00000007.pdf')
    expect(Buffer.from(pdf.pdfBytes!, 'base64').subarray(0, 4).toString()).toBe('%PDF')

    const doble = crearClienteMifact({ url: 'https://x.test/svc', token: TOKEN }, {
      fetch: (async () => new Response(JSON.stringify(JSON.stringify({ errors: '', estado_documento: '102', serie_cpe: 'BT01' })))) as typeof fetch,
    })
    expect(await doble.estado(doc)).toMatchObject({ estadoDocumento: '102', serie: 'BT01' })
  })

  it('sin respuesta confiable (sin conexión, tiempo agotado, HTTP 500, cuerpo ilegible) es MifactRedError: el resultado es DUDOSO', async () => {
    for (const tipo of ['sin_conexion', 'timeout', 'http500', 'ilegible'] as const) {
      const { falso, cliente } = nuevo()
      falso.fallar('GetEstatusInvoice', { tipo })
      const e = await cliente.estado(doc).catch((x) => x)
      expect(e, tipo).toBeInstanceOf(MifactRedError)
      expect(e).not.toBeInstanceOf(MifactApiError)
    }
  })

  it('el token NUNCA aparece en un mensaje de error, aunque Mifact lo repita en su respuesta', async () => {
    const eco = crearClienteMifact({ url: 'https://x.test/svc', token: TOKEN }, {
      fetch: (async () => new Response(JSON.stringify({ errors: `Token invalido: ${TOKEN} rechazado` }))) as typeof fetch,
    })
    const e = (await eco.estado(doc).catch((x) => x)) as Error
    expect(e).toBeInstanceOf(MifactApiError)
    expect(e.message).toContain('***')
    expect(e.message).not.toContain(TOKEN)
    expect(JSON.stringify((e as MifactApiError).respuesta)).not.toContain(TOKEN)

    const { falso, cliente } = nuevo()
    falso.fallar('SendInvoice', { tipo: 'sin_conexion' })
    expect(((await cliente.enviar({}).catch((x) => x)) as Error).message).not.toContain(TOKEN)
  })
})

describe('JSON del comprobante (SendInvoice)', () => {
  const config: ConfigEmisorMifact = {
    emisor: 'baker_brothers', entorno: 'demo', url: 'https://demo.mifact.net.pe/api/invoiceService.svc', token: TOKEN, ruc: '20100100100',
    razonSocial: 'empresa demo', nombreComercial: null, ubigeo: '103040', direccionFiscal: 'avenida abcd', serieBoleta: 'BT01',
    serieFactura: 'FT01', codigoAnexo: '0000', correlativoInicial: 1, formatoPdf: '001',
  }
  const desglose = desglosarLineas([
    { descripcion: 'Caja de Alfajores Mix', cantidad: 2, precioUnitarioConIgv: 22.9 },
    { descripcion: 'Servicio de delivery', cantidad: 1, precioUnitarioConIgv: 7 },
  ])
  const receptor = (() => {
    const r = resolverReceptor('boleta', { numeroDoc: '12345678', nombre: 'ANA TORRES QUISPE', correo: 'ana@ejemplo.pe' }, desglose.total)
    if (!r.ok) throw new Error('receptor')
    return r.receptor
  })()

  it('boleta: campos, totales con 2 decimales, correlativo a 8 dígitos, IGV 18 % y SIN token', () => {
    const d = construirDocumento({ config, tipo: 'boleta', serie: 'BT01', correlativo: 7, fechaEmision: '2026-11-17', receptor, desglose, codigosItem: ['alfajor-mix', 'DELIVERY'], observacion: 'Pedido BB-2500', usuario: 'bakeos' }) as Record<string, any>
    expect(d).not.toHaveProperty('TOKEN')
    expect(JSON.stringify(d)).not.toContain(TOKEN)
    expect(d).toMatchObject({
      COD_TIP_CPE: '03', NUM_SERIE_CPE: 'BT01', NUM_CORRE_CPE: '00000007', FEC_EMIS: '2026-11-17', COD_MND: 'PEN',
      NUM_NIF_EMIS: '20100100100', COD_UBI_EMIS: '103040', COD_TIP_NIF_RECP: '1', NUM_NIF_RECP: '12345678', NOM_RZN_SOC_RECP: 'ANA TORRES QUISPE',
      TXT_CORREO_ENVIO: 'ana@ejemplo.pe', ENVIAR_A_SUNAT: 'true', RETORNA_PDF: 'false', COD_PRCD_CARGA: '001', COD_TIP_OPE_SUNAT: '0101',
      MNT_TOT_GRAVADO: '44.74', MNT_TOT_TRIB_IGV: '8.06', MNT_TOT: '52.80',
    })
    expect(d.items).toHaveLength(2)
    expect(d.items[0]).toMatchObject({
      COD_ITEM: 'alfajor-mix', CANT_UNID_ITEM: '2', PRC_VTA_UNIT_ITEM: '22.90', MNT_PV_ITEM: '45.80',
      VAL_VTA_ITEM: '38.81', MNT_IGV_ITEM: '6.99', VAL_UNIT_ITEM: '19.405', COD_TIP_AFECT_IGV_ITEM: '10', COD_TRIB_IGV_ITEM: '1000', POR_IGV_ITEM: '18',
    })
    expect(d.datos_adicionales).toEqual([{ COD_TIP_ADIC_SUNAT: '05', TXT_DESC_ADIC_SUNAT: 'Pedido BB-2500' }])
    // Lo que se suma en las líneas es exactamente lo que dicen los totales.
    const suma = (campo: string) => d.items.reduce((s: number, i: any) => s + Math.round(Number(i[campo]) * 100), 0)
    expect(suma('VAL_VTA_ITEM')).toBe(Math.round(Number(d.MNT_TOT_GRAVADO) * 100))
    expect(suma('MNT_IGV_ITEM')).toBe(Math.round(Number(d.MNT_TOT_TRIB_IGV) * 100))
    expect(suma('MNT_PV_ITEM')).toBe(Math.round(Number(d.MNT_TOT) * 100))
  })

  it('factura: tipo 01, RUC del receptor, y el nombre comercial / correo solo si existen', () => {
    const r = resolverReceptor('factura', { numeroDoc: '20123456786', nombre: 'PASTELERIA EJEMPLO SAC' }, desglose.total)
    if (!r.ok) throw new Error('receptor')
    const d = construirDocumento({ config: { ...config, nombreComercial: 'Bake Brothers' }, tipo: 'factura', serie: 'FT01', correlativo: 12, fechaEmision: '2026-11-17', receptor: r.receptor, desglose, codigosItem: [], usuario: 'bakeos' }) as Record<string, any>
    expect(d).toMatchObject({ COD_TIP_CPE: '01', NUM_SERIE_CPE: 'FT01', NUM_CORRE_CPE: '00000012', COD_TIP_NIF_RECP: '6', NUM_NIF_RECP: '20123456786', NOM_COMER_EMIS: 'Bake Brothers' })
    expect(d).not.toHaveProperty('TXT_CORREO_ENVIO')
    expect(d).not.toHaveProperty('datos_adicionales')
    expect(d.items[0].COD_ITEM).toBe('ITEM')
  })
})

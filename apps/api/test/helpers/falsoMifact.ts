/**
 * Simulador local de la API de Mifact para los tests: reproduce lo OBSERVADO en demo.mifact.net.pe (2026-11-17) —
 * siempre HTTP 200, el error de negocio va en `errors`, número repetido = «ya existe», consulta de algo que no existe,
 * estados 102 (aceptado) y 108 (baja solicitada), PDF en base64 más URL — y permite inyectar fallos de red.
 * Nada de red real: se instala con `vi.stubGlobal('fetch', falso.fetch)`.
 */

export interface LlamadaRegistrada {
  metodo: string
  cuerpo: Record<string, any>
}

type Falla = { tipo: 'timeout' | 'http500' | 'ilegible' | 'sin_conexion'; /** true = el documento SÍ se registra y solo se pierde la respuesta */ procesar?: boolean }

const PDF_FALSO = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n', 'latin1')

export class FalsoMifact {
  readonly llamadas: LlamadaRegistrada[] = []
  /** documentos registrados, por «tipo|serie|correlativo». */
  readonly documentos = new Map<string, { cuerpo: Record<string, any>; estado: string; correos: string[] }>()
  private fallas = new Map<string, Falla[]>()
  /** Estado con el que se registran los documentos nuevos (102 aceptado por defecto). */
  estadoAlRegistrar = '102'

  constructor(private readonly tokenValido: string) {}

  /** La próxima llamada a `metodo` falla de esta forma (una vez por cada vez que se llama a este método). */
  fallar(metodo: string, falla: Falla) {
    this.fallas.set(metodo, [...(this.fallas.get(metodo) ?? []), falla])
  }

  /** Deja un documento ya registrado (p. ej. un número que otro usuario ya usó en el demo compartido). */
  registrar(tipo: string, serie: string, correlativo: number, estado = '102') {
    this.documentos.set(`${tipo}|${serie}|${correlativo}`, { cuerpo: {}, estado, correos: [] })
  }

  llamadasA(metodo: string) {
    return this.llamadas.filter((l) => l.metodo === metodo)
  }

  fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const metodo = String(url).split('/').pop() as string
    const cuerpo = JSON.parse(String(init?.body ?? '{}')) as Record<string, any>
    this.llamadas.push({ metodo, cuerpo })

    const falla = this.fallas.get(metodo)?.shift()
    if (falla) {
      if (falla.procesar) this.procesar(metodo, cuerpo)
      if (falla.tipo === 'sin_conexion') throw new TypeError('fetch failed')
      if (falla.tipo === 'timeout') throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
      if (falla.tipo === 'http500') return new Response('boom', { status: 500 })
      return new Response('<html>no es json</html>', { status: 200 })
    }
    if (cuerpo.TOKEN !== this.tokenValido) return this.responder({ errors: 'Token invalido' })
    return this.responder(this.procesar(metodo, cuerpo))
  }

  private responder(r: Record<string, unknown>): Response {
    const base = {
      cadena_para_codigo_qr: '', cdr_sunat: '', codigo_hash: '', correlativo_cpe: '', errors: '', estado_documento: '',
      pdf_bytes: null, serie_cpe: '', sunat_description: '', sunat_note: '', sunat_responsecode: '', ticket_sunat: '',
      tipo_cpe: '', url: '', xml_enviado: '',
    }
    return new Response(JSON.stringify({ ...base, ...r }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  private procesar(metodo: string, c: Record<string, any>): Record<string, unknown> {
    const clave = `${c.COD_TIP_CPE}|${c.NUM_SERIE_CPE}|${Number(c.NUM_CORRE_CPE)}`
    const id = { serie_cpe: c.NUM_SERIE_CPE, correlativo_cpe: c.NUM_CORRE_CPE, tipo_cpe: c.COD_TIP_CPE }
    const doc = this.documentos.get(clave)
    switch (metodo) {
      case 'SendInvoice': {
        if (doc) return { errors: 'Se encontraron errores: 20261117-15:13:57 002|Insertar CPE_Cabecera|Error|Error el documento ya existe en la BD ;' }
        this.documentos.set(clave, { cuerpo: c, estado: this.estadoAlRegistrar, correos: [] })
        const tipo = c.COD_TIP_CPE === '03' ? 'Boleta' : 'Factura'
        return {
          ...id,
          codigo_hash: `HASH-${c.NUM_SERIE_CPE}-${c.NUM_CORRE_CPE}`,
          cadena_para_codigo_qr: `${c.NUM_NIF_EMIS}|${c.COD_TIP_CPE}|${c.NUM_SERIE_CPE}|${c.NUM_CORRE_CPE}|${c.MNT_TOT_TRIB_IGV}|${c.MNT_TOT}`,
          estado_documento: this.estadoAlRegistrar,
          sunat_description: `La ${tipo} numero ${c.NUM_SERIE_CPE}-${c.NUM_CORRE_CPE}, ha sido aceptada`,
          sunat_responsecode: '0',
        }
      }
      case 'GetEstatusInvoice':
        if (!doc) return { ...id, errors: `El documento consultado no existe: CPE: ${c.NUM_NIF_EMIS}-${c.COD_TIP_CPE}-${c.NUM_SERIE_CPE}-${c.NUM_CORRE_CPE}` }
        return {
          ...id,
          codigo_hash: `HASH-${c.NUM_SERIE_CPE}-${c.NUM_CORRE_CPE}`,
          estado_documento: doc.estado,
          sunat_description: `El documento ${c.NUM_NIF_EMIS}-${c.COD_TIP_CPE}-${c.NUM_SERIE_CPE}-${c.NUM_CORRE_CPE} fue aceptado por SUNAT`,
          sunat_responsecode: '0',
        }
      case 'GetInvoice':
        if (!doc) return { ...id, errors: `El documento consultado no existe: CPE: ${c.NUM_NIF_EMIS}-${c.COD_TIP_CPE}-${c.NUM_SERIE_CPE}-${c.NUM_CORRE_CPE}` }
        return { ...id, pdf_bytes: PDF_FALSO.toString('base64'), url: `https://pdf.falso.test/${c.NUM_NIF_EMIS}/${c.NUM_SERIE_CPE}-${c.NUM_CORRE_CPE}.pdf` }
      case 'LowInvoice':
        if (!doc) return { ...id, errors: `El documento consultado no existe: CPE: ${c.NUM_NIF_EMIS}-${c.COD_TIP_CPE}-${c.NUM_SERIE_CPE}-${c.NUM_CORRE_CPE}` }
        doc.estado = '108'
        return { ...id, estado_documento: '108' }
      case 'SendMailInvoice':
        if (!doc) return { ...id, errors: `El documento consultado no existe: CPE: ${c.NUM_NIF_EMIS}-${c.COD_TIP_CPE}-${c.NUM_SERIE_CPE}-${c.NUM_CORRE_CPE}` }
        doc.correos.push(c.TXT_CORREO_ENVIO)
        return { ...id }
      default:
        return { errors: `método desconocido ${metodo}` }
    }
  }
}

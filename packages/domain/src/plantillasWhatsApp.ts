/**
 * Plantillas de mensaje de WhatsApp (las aprobadas por Meta). Pasadas las 24 h desde el último mensaje del cliente,
 * WhatsApp solo deja enviar una plantilla aprobada. Las plantillas NO se escriben a mano en Bake OS: se leen de Meta
 * (`GET /{waba_id}/message_templates`) y aquí solo se normalizan, se piden sus variables y se arma el envío.
 *
 * Lógica pura y compartida (API y panel): no llama a Meta ni toca la base.
 *
 * Soporta lo que se puede mandar con solo texto: encabezado de texto (o sin encabezado), cuerpo, pie y botones
 * (respuesta rápida, teléfono, URL fija o con una variable). Las plantillas con encabezado de imagen, video o documento,
 * ubicación, carrusel, autenticación (OTP), flujos o catálogo se marcan como NO soportadas: no se ofrecen en el panel.
 */

export type SeccionVariable = 'encabezado' | 'cuerpo' | 'boton'

export interface VariablePlantilla {
  /** Clave única dentro de la plantilla: `cuerpo:1`, `encabezado:nombre`, `boton:0`. Es la que se usa en `valores`. */
  clave: string
  /** El nombre tal como lo escribió quien creó la plantilla: `1`, `2` o `nombre_cliente`. */
  nombre: string
  seccion: SeccionVariable
  /** Posición del botón (solo secciones `boton`). */
  indiceBoton?: number
  ejemplo: string | null
}

export interface BotonPlantilla {
  tipo: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | string
  texto: string
  url?: string
  telefono?: string
}

export interface PlantillaWhatsApp {
  nombre: string
  idioma: string
  categoria: string
  formatoParametros: 'POSITIONAL' | 'NAMED'
  encabezado: string | null
  cuerpo: string
  pie: string | null
  botones: BotonPlantilla[]
  variables: VariablePlantilla[]
  soportada: boolean
  motivoNoSoportada: string | null
}

type Obj = Record<string, unknown>
const esObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const texto = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/** Variables `{{1}}` o `{{nombre}}` de un texto, en orden de aparición y sin repetir. */
export function variablesDeTexto(t: string): string[] {
  const vistas: string[] = []
  for (const m of t.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) if (!vistas.includes(m[1])) vistas.push(m[1])
  return vistas
}

function ejemplosDelCuerpo(c: Obj, nombres: string[], nombrado: boolean): (string | null)[] {
  if (nombrado) {
    const lista = Array.isArray(c.example && (c.example as Obj).body_text_named_params) ? ((c.example as Obj).body_text_named_params as unknown[]) : []
    return nombres.map((n) => {
      const f = lista.find((x) => esObj(x) && x.param_name === n)
      return esObj(f) ? texto(f.example) : null
    })
  }
  const filas = esObj(c.example) && Array.isArray(c.example.body_text) ? (c.example.body_text as unknown[]) : []
  const fila = Array.isArray(filas[0]) ? (filas[0] as unknown[]) : []
  return nombres.map((_, i) => texto(fila[i]))
}

/** Convierte la plantilla tal como la devuelve Meta en la forma que usa Bake OS. Devuelve null si no es una plantilla válida. */
export function normalizarPlantillaMeta(raw: unknown): PlantillaWhatsApp | null {
  if (!esObj(raw)) return null
  const nombre = texto(raw.name)
  const idioma = texto(raw.language)
  if (!nombre || !idioma || !Array.isArray(raw.components)) return null

  const nombrado = raw.parameter_format === 'NAMED'
  const variables: VariablePlantilla[] = []
  const motivos: string[] = []
  let encabezado: string | null = null
  let cuerpo = ''
  let pie: string | null = null
  const botones: BotonPlantilla[] = []

  for (const c of raw.components) {
    if (!esObj(c)) continue
    const tipo = String(c.type ?? '').toUpperCase()
    if (tipo === 'HEADER') {
      const formato = String(c.format ?? 'TEXT').toUpperCase()
      if (formato !== 'TEXT') {
        const nombresFormato: Record<string, string> = { IMAGE: 'imagen', VIDEO: 'video', DOCUMENT: 'documento', LOCATION: 'ubicación' }
        motivos.push(`encabezado de ${nombresFormato[formato] ?? formato.toLowerCase()}`)
        continue
      }
      encabezado = texto(c.text) ?? ''
      const nombres = variablesDeTexto(encabezado)
      const ej = esObj(c.example) && Array.isArray(c.example.header_text) ? (c.example.header_text as unknown[]) : []
      nombres.forEach((n, i) => variables.push({ clave: `encabezado:${n}`, nombre: n, seccion: 'encabezado', ejemplo: texto(ej[i]) }))
      if (nombres.length > 1) motivos.push('encabezado con más de una variable')
    } else if (tipo === 'BODY') {
      cuerpo = texto(c.text) ?? ''
      const nombres = variablesDeTexto(cuerpo)
      const ej = ejemplosDelCuerpo(c, nombres, nombrado)
      nombres.forEach((n, i) => variables.push({ clave: `cuerpo:${n}`, nombre: n, seccion: 'cuerpo', ejemplo: ej[i] }))
    } else if (tipo === 'FOOTER') {
      pie = texto(c.text)
    } else if (tipo === 'BUTTONS' && Array.isArray(c.buttons)) {
      c.buttons.forEach((b, i) => {
        if (!esObj(b)) return
        const bt = String(b.type ?? '').toUpperCase()
        const boton: BotonPlantilla = { tipo: bt, texto: texto(b.text) ?? '' }
        if (bt === 'URL') {
          const url = texto(b.url) ?? ''
          boton.url = url
          const vs = variablesDeTexto(url)
          if (vs.length > 1) motivos.push('botón con más de una variable')
          vs.slice(0, 1).forEach((n) => {
            const ej = Array.isArray(b.example) ? texto((b.example as unknown[])[0]) : null
            variables.push({ clave: `boton:${i}`, nombre: n, seccion: 'boton', indiceBoton: i, ejemplo: ej })
          })
        } else if (bt === 'PHONE_NUMBER') {
          boton.telefono = texto(b.phone_number) ?? ''
        } else if (bt !== 'QUICK_REPLY') {
          motivos.push(`botón de tipo ${bt.toLowerCase()}`)
        }
        botones.push(boton)
      })
    } else if (tipo === 'CAROUSEL' || tipo === 'LIMITED_TIME_OFFER') {
      motivos.push(`componente ${tipo.toLowerCase()}`)
    }
  }
  if (!cuerpo) motivos.push('sin cuerpo de texto')
  const categoria = String(raw.category ?? '').toUpperCase()
  if (categoria === 'AUTHENTICATION') motivos.push('plantilla de autenticación')

  return {
    nombre,
    idioma,
    categoria,
    formatoParametros: nombrado ? 'NAMED' : 'POSITIONAL',
    encabezado,
    cuerpo,
    pie,
    botones,
    variables,
    soportada: motivos.length === 0,
    motivoNoSoportada: motivos.length ? motivos.join('; ') : null,
  }
}

/** Texto de una variable apto para WhatsApp: sin saltos de línea ni tabuladores ni 4 espacios seguidos; máx. 1024. */
export function limpiarValorVariable(v: string): string {
  return v.replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim().slice(0, 1024)
}

const sustituir = (t: string, valores: Record<string, string>, seccion: SeccionVariable) =>
  t.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (todo, n: string) => valores[`${seccion}:${n}`] ?? todo)

export interface ParametroEnvio {
  type: 'text'
  text: string
  parameter_name?: string
}
export interface ComponenteEnvio {
  type: 'header' | 'body' | 'button'
  sub_type?: 'url'
  index?: string
  parameters: ParametroEnvio[]
}

export type ResultadoCompletarPlantilla =
  | { ok: true; texto: string; componentes: ComponenteEnvio[] }
  | { ok: false; error: 'PLANTILLA_NO_SOPORTADA' | 'FALTAN_VARIABLES'; faltan?: string[] }

/**
 * Con los valores que escribió la persona, arma (a) el texto tal como lo recibirá el cliente, para dejarlo en el
 * historial, y (b) los `components` que pide la Cloud API para enviar la plantilla. No envía nada.
 */
export function completarPlantilla(p: PlantillaWhatsApp, valoresEntrada: Record<string, string>): ResultadoCompletarPlantilla {
  if (!p.soportada) return { ok: false, error: 'PLANTILLA_NO_SOPORTADA' }
  const valores: Record<string, string> = {}
  const faltan: string[] = []
  for (const v of p.variables) {
    const limpio = limpiarValorVariable(String(valoresEntrada[v.clave] ?? ''))
    if (!limpio) faltan.push(v.clave)
    else valores[v.clave] = limpio
  }
  if (faltan.length) return { ok: false, error: 'FALTAN_VARIABLES', faltan }

  const nombrado = p.formatoParametros === 'NAMED'
  const parametros = (seccion: SeccionVariable): ParametroEnvio[] =>
    p.variables
      .filter((v) => v.seccion === seccion)
      .map((v) => ({ type: 'text' as const, text: valores[v.clave], ...(nombrado && seccion !== 'boton' ? { parameter_name: v.nombre } : {}) }))

  const componentes: ComponenteEnvio[] = []
  if (parametros('encabezado').length) componentes.push({ type: 'header', parameters: parametros('encabezado') })
  if (parametros('cuerpo').length) componentes.push({ type: 'body', parameters: parametros('cuerpo') })
  for (const v of p.variables.filter((x) => x.seccion === 'boton')) {
    componentes.push({ type: 'button', sub_type: 'url', index: String(v.indiceBoton ?? 0), parameters: [{ type: 'text', text: valores[v.clave] }] })
  }

  const partes = [
    p.encabezado ? sustituir(p.encabezado, valores, 'encabezado') : null,
    sustituir(p.cuerpo, valores, 'cuerpo'),
    p.pie,
  ].filter((x): x is string => !!x)
  return { ok: true, texto: partes.join('\n\n'), componentes }
}

/** Vista previa con los ejemplos que dio quien la creó (o `{{1}}` si no hay), para mostrar la plantilla antes de llenarla. */
export function textoDePlantilla(p: PlantillaWhatsApp, valores: Record<string, string> = {}): string {
  const mapa: Record<string, string> = {}
  for (const v of p.variables) if (valores[v.clave]?.trim()) mapa[v.clave] = valores[v.clave].trim()
  const partes = [p.encabezado ? sustituir(p.encabezado, mapa, 'encabezado') : null, sustituir(p.cuerpo, mapa, 'cuerpo'), p.pie].filter(
    (x): x is string => !!x
  )
  return partes.join('\n\n')
}

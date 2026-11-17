// NINGÚN comprobante sale con datos de los ejemplos de Mifact. En la prueba contra el demo, un correo llegó saludando a
// «OSYS COMPANY SAC» (el cliente de ejemplo de su documentación) porque el recorrido de pruebas le pasó ese receptor a
// mano. Este archivo lo hace imposible de dos maneras:
//   1. REVISA lo que de verdad se manda a Mifact: todo el JSON de cada llamada (emitir, estado, PDF, baja, correo) no
//      puede contener NINGÚN valor de los ejemplos (nombres, RUC/DNI, correos, direcciones, códigos…), y el receptor tiene
//      que ser exactamente el del cliente del pedido.
//   2. REVISA el código: ningún archivo de src/ ni de scripts/ puede traer esos valores escritos a mano.
// Y comprueba que el propio detector no tiene huecos: cada valor de la lista, uno por uno, hace saltar la alarma.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { DATOS_EJEMPLO_MIFACT, normalizarParaComparar, todosLosDatosDeEjemploMifact } from '@bakebrothers/domain'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'
import { crearPedidoDePrueba, limpiarPedidosDePrueba } from '../scripts/lib/pedidoDePrueba.js'
import { anularComprobante, descargarPdf, emitirComprobante, enviarCorreoComprobante } from '../src/services/comprobantes.js'
import { FalsoMifact, type LlamadaRegistrada } from './helpers/falsoMifact.js'

const hayBaseDeDatosReal = !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

/** Todo texto que viaja en una llamada (valores y nombres de campo), normalizado. */
function textoDeLaLlamada(l: LlamadaRegistrada): string {
  const hojas: string[] = []
  const recorrer = (x: unknown) => {
    if (x === null || x === undefined) return
    if (Array.isArray(x)) return x.forEach(recorrer)
    if (typeof x === 'object') {
      for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
        hojas.push(k)
        recorrer(v)
      }
      return
    }
    hojas.push(String(x))
  }
  recorrer(l.cuerpo)
  return normalizarParaComparar(`${l.metodo} ${hojas.join(' | ')} ${JSON.stringify(l.cuerpo)}`)
}

/** Los valores de ejemplo que aparecen en una llamada (vacío = limpia). */
const datosDeEjemploEn = (l: LlamadaRegistrada): string[] => {
  const texto = textoDeLaLlamada(l)
  return todosLosDatosDeEjemploMifact().filter((v) => texto.includes(normalizarParaComparar(v)))
}

// ————————————————————————————————————————————— el detector no tiene huecos ————
describe('el detector de datos de ejemplo', () => {
  it('cada valor de la lista, uno por uno y escrito como sea (mayúsculas, tildes, espacios), hace saltar la alarma', () => {
    for (const valor of todosLosDatosDeEjemploMifact()) {
      for (const variante of [valor, valor.toUpperCase(), valor.toLowerCase(), `  ${valor}  `]) {
        const encontrados = datosDeEjemploEn({ metodo: 'SendInvoice', cuerpo: { NOM_RZN_SOC_RECP: `xx ${variante} yy` } })
        expect(encontrados.length, `no detectó «${variante}»`).toBeGreaterThan(0)
      }
    }
  })

  it('los datos reales de Bake Brothers y de un cliente corriente NO se marcan como ejemplo', () => {
    const limpio: LlamadaRegistrada = {
      metodo: 'SendInvoice',
      cuerpo: {
        NUM_NIF_EMIS: '20612010880', NOM_RZN_SOC_EMIS: 'BAKER BROTHERS E.I.R.L.', NUM_NIF_RECP: '12345678', NOM_RZN_SOC_RECP: 'ANA TORRES QUISPE',
        TXT_DMCL_FISC_RECEP: 'Av. Defensores del Morro 2270, Chorrillos', TXT_CORREO_ENVIO: 'ana@ejemplo.pe',
        items: [{ COD_ITEM: 'alfajor-mix', TXT_DESC_ITEM: 'Alfajor Mix' }],
      },
    }
    expect(datosDeEjemploEn(limpio)).toEqual([])
  })

  it('la lista cubre todo lo que trae la documentación: nombres, documentos, correos, direcciones y códigos', () => {
    for (const categoria of ['documentos', 'correos', 'empresas', 'personas', 'direcciones', 'otros'] as const) expect(DATOS_EJEMPLO_MIFACT[categoria].length).toBeGreaterThan(0)
    // Los que aparecieron en la prueba real y en el Excel de campos.
    for (const v of ['OSYS COMPANY SAC', '20601847834', 'MARIA GONZALES', '40506089', 'mifact@outlook.com', '20100100100', 'direccion del cliente', 'BCF-RR01'])
      expect(todosLosDatosDeEjemploMifact()).toContain(v)
  })
})

// ———————————————————————————————— el código no trae datos de ejemplo escritos ————
describe('el código no tiene datos de ejemplo escritos a mano', () => {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
  const archivos = (dir: string): string[] =>
    fs.existsSync(dir)
      ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? archivos(path.join(dir, e.name)) : /\.(ts|tsx|js|jsx|mjs|sql)$/.test(e.name) ? [path.join(dir, e.name)] : []))
      : []

  it('ni apps/api/src, ni apps/api/scripts, ni apps/admin/src, ni packages/domain/src (salvo la propia lista) los escriben', () => {
    const lista = path.join(raiz, 'packages', 'domain', 'src', 'datosEjemploMifact.ts')
    const buscados = [...DATOS_EJEMPLO_MIFACT.documentos, ...DATOS_EJEMPLO_MIFACT.correos, ...DATOS_EJEMPLO_MIFACT.empresas, ...DATOS_EJEMPLO_MIFACT.direcciones].map(normalizarParaComparar)
    const hallazgos: string[] = []
    for (const carpeta of [['apps', 'api', 'src'], ['apps', 'api', 'scripts'], ['apps', 'admin', 'src'], ['packages', 'domain', 'src']]) {
      for (const archivo of archivos(path.join(raiz, ...carpeta))) {
        if (path.resolve(archivo) === path.resolve(lista)) continue
        const texto = normalizarParaComparar(fs.readFileSync(archivo, 'utf8'))
        for (const v of buscados) if (texto.includes(v)) hallazgos.push(`${path.relative(raiz, archivo)}: «${v}»`)
      }
    }
    expect(hallazgos).toEqual([])
  })
})

// ———————————————————————— lo que de verdad se manda a Mifact, de punta a punta ————
const TOKEN = 'TOKEN-SECRETO-SIN-EJEMPLOS=='
const MARCA = '[PRUEBA-SIN-EJEMPLOS]'
const ENV_MIFACT: Record<string, string> = {
  MIFACT_BAKER_BROTHERS_URL: 'https://demo.mifact.test/api/invoiceService.svc',
  MIFACT_BAKER_BROTHERS_TOKEN: TOKEN,
  MIFACT_BAKER_BROTHERS_RUC: '20987654326',
  MIFACT_BAKER_BROTHERS_RAZON_SOCIAL: 'BAKER BROTHERS DE PRUEBA E.I.R.L.',
  MIFACT_BAKER_BROTHERS_UBIGEO: '150108',
  MIFACT_BAKER_BROTHERS_DIRECCION: 'Av. Emisor de Prueba 100, Chorrillos',
  MIFACT_BAKER_BROTHERS_SERIE_BOLETA: 'BS01',
  MIFACT_BAKER_BROTHERS_SERIE_FACTURA: 'FS01',
  MIFACT_HERMANOS_LOARTE_URL: 'https://demo.mifact.test/api/invoiceService.svc',
  MIFACT_HERMANOS_LOARTE_TOKEN: TOKEN,
  MIFACT_HERMANOS_LOARTE_RUC: '20987654326',
  MIFACT_HERMANOS_LOARTE_RAZON_SOCIAL: 'HERMANOS LOARTE DE PRUEBA S.A.C.',
  MIFACT_HERMANOS_LOARTE_UBIGEO: '150108',
  MIFACT_HERMANOS_LOARTE_DIRECCION: 'Av. Otro Emisor de Prueba 200, Chorrillos',
  MIFACT_HERMANOS_LOARTE_SERIE_BOLETA: 'BS02',
  MIFACT_HERMANOS_LOARTE_SERIE_FACTURA: 'FS02',
}
const SERIES = ['BS01', 'FS01', 'BS02', 'FS02']

describe.skipIf(!hayBaseDeDatosReal)('lo que se manda a Mifact sale del cliente del pedido y nunca de datos de ejemplo', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const guardado: Record<string, string | undefined> = {}
  let tenantId: string
  let falso: FalsoMifact
  let n = 0

  const pedido = (o: Partial<Parameters<typeof crearPedidoDePrueba>[1]> = {}) =>
    crearPedidoDePrueba(pool, { tenantId, marca: MARCA, sede: 'Santa Marina', items: [{ slug: 'alfajor-mix', cantidad: 2 }], numero: `TEST-SINEJ-${Date.now()}-${++n}`, ...o })
  const limpiar = async () => {
    await limpiarPedidosDePrueba(pool, MARCA)
    await pool.query(`delete from comprobantes_numeradores where serie = any($1)`, [SERIES])
  }

  beforeAll(async () => {
    for (const k of Object.keys(ENV_MIFACT)) guardado[k] = process.env[k]
    tenantId = (await pool.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
  })
  beforeEach(async () => {
    Object.assign(process.env, ENV_MIFACT)
    falso = new FalsoMifact(TOKEN)
    vi.stubGlobal('fetch', falso.fetch)
    await limpiar()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })
  afterAll(async () => {
    await limpiar()
    for (const [k, v] of Object.entries(guardado)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    await pool.end()
  })

  // Tres clientes distintos: una persona con DNI, una empresa con RUC y alguien sin documento.
  const CLIENTES = [
    { etiqueta: 'boleta con DNI', tipo: 'boleta' as const, datos: { dni: '12345678', razonSocial: 'ANA TORRES QUISPE', correoCliente: 'ana.torres@ejemplo.pe', direccionFiscal: 'Jr. Cliente 45, Lima' }, esperado: { COD_TIP_NIF_RECP: '1', NUM_NIF_RECP: '12345678', NOM_RZN_SOC_RECP: 'ANA TORRES QUISPE', TXT_DMCL_FISC_RECEP: 'Jr. Cliente 45, Lima', TXT_CORREO_ENVIO: 'ana.torres@ejemplo.pe' } },
    { etiqueta: 'factura con RUC', tipo: 'factura' as const, datos: { ruc: '20123456786', razonSocial: 'PASTELERIA EJEMPLO SAC', direccionFiscal: 'Av. Empresa 500, Lima', correoCliente: 'compras@pasteleria-ejemplo.pe' }, esperado: { COD_TIP_NIF_RECP: '6', NUM_NIF_RECP: '20123456786', NOM_RZN_SOC_RECP: 'PASTELERIA EJEMPLO SAC', TXT_DMCL_FISC_RECEP: 'Av. Empresa 500, Lima', TXT_CORREO_ENVIO: 'compras@pasteleria-ejemplo.pe' } },
    { etiqueta: 'boleta sin documento', tipo: 'boleta' as const, datos: {}, esperado: { COD_TIP_NIF_RECP: '0', NUM_NIF_RECP: '00000000', NOM_RZN_SOC_RECP: 'CLIENTE SIN NOMBRE', TXT_DMCL_FISC_RECEP: 'SIN DIRECCION' } },
  ]

  it.each(CLIENTES)('$etiqueta: el receptor del JSON es EXACTAMENTE el del cliente del pedido', async ({ tipo, datos, esperado }) => {
    const p = await pedido(datos)
    await emitirComprobante(pool, tenantId, { pedido: p.numero, tipo })
    const enviado = falso.llamadasA('SendInvoice')[0].cuerpo
    expect(enviado).toMatchObject(esperado)
    if (!('TXT_CORREO_ENVIO' in esperado)) expect(enviado).not.toHaveProperty('TXT_CORREO_ENVIO')
    // Y lo que quedó guardado en el pedido es lo mismo.
    const fila = (await pool.query(`select receptor_doc, receptor_nombre, receptor_direccion, receptor_correo from comprobantes where order_id = $1`, [p.id])).rows[0]
    expect(fila).toMatchObject({ receptor_doc: esperado.NUM_NIF_RECP, receptor_nombre: esperado.NOM_RZN_SOC_RECP })
  })

  it('NINGUNA llamada a Mifact (emitir, estado, PDF, baja, correo) contiene un solo dato de los ejemplos', async () => {
    const pedidos = await Promise.all(CLIENTES.map((c) => pedido(c.datos)))
    const emitidos = []
    for (const [i, c] of CLIENTES.entries()) emitidos.push(await emitirComprobante(pool, tenantId, { pedido: pedidos[i].numero, tipo: c.tipo }))
    // Un delivery sin sede (lo factura Baker Brothers) y una cedros (Hermanos Loarte).
    emitidos.push(await emitirComprobante(pool, tenantId, { pedido: (await pedido({ sede: null, tipoEntrega: 'delivery', delivery: 7, razonSocial: 'LUIS RAMOS PAREDES', dni: '87654321' })).numero, tipo: 'boleta' }))
    emitidos.push(await emitirComprobante(pool, tenantId, { pedido: (await pedido({ sede: 'Cedros', ...CLIENTES[1].datos })).numero, tipo: 'factura' }))
    // Y las demás operaciones sobre un comprobante.
    await descargarPdf(pool, tenantId, emitidos[0].id)
    await enviarCorreoComprobante(pool, tenantId, emitidos[1].id, 'destino.de.prueba@ejemplo.pe')
    await anularComprobante(pool, tenantId, emitidos[2].id, { motivo: 'ANULACION DE PRUEBA' })

    expect(falso.llamadas.length).toBeGreaterThanOrEqual(8)
    const metodos = new Set(falso.llamadas.map((l) => l.metodo))
    for (const m of ['SendInvoice', 'GetInvoice', 'SendMailInvoice', 'LowInvoice']) expect(metodos.has(m), `no se probó ${m}`).toBe(true)

    for (const llamada of falso.llamadas) expect(datosDeEjemploEn(llamada), `${llamada.metodo} trae datos de ejemplo`).toEqual([])
  })

  it('el RUC de pruebas de Mifact tampoco puede ser el RUC del RECEPTOR ni se escribe nada a mano: el POST de la API no acepta receptor', async () => {
    const p = await pedido({ ruc: '20100100100', razonSocial: 'PASTELERIA EJEMPLO SAC' })
    await expect(emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'factura' })).rejects.toMatchObject({ codigo: 'RECEPTOR_INVALIDO', detalle: { error: 'DATOS_DE_EJEMPLO' } })
    expect(falso.llamadas).toHaveLength(0)
    // Aunque alguien lo intente: `receptor` no es un parámetro de emitirComprobante (TypeScript lo impide) y la ruta es estricta.
    const entrada = { pedido: p.numero, tipo: 'factura', receptor: { numeroDoc: '20601847834' } } as unknown as Parameters<typeof emitirComprobante>[2]
    await expect(emitirComprobante(pool, tenantId, entrada)).rejects.toMatchObject({ codigo: 'RECEPTOR_INVALIDO' }) // se ignora el receptor: gana el cliente (con su RUC de ejemplo)
  })
})

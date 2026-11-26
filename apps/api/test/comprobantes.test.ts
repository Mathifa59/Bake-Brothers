// Comprobantes electrónicos (Mifact) desde un pedido de Bake OS — servicio completo contra Postgres real (con la
// migración 0053) y el simulador de Mifact de test/helpers/falsoMifact.ts (sin red). Se prueba lo que protege el
// dinero y la numeración fiscal: validar antes de gastar un correlativo, un número nunca se reutiliza si pudo llegar
// a Mifact, una respuesta perdida se recupera, y el token jamás queda en la base.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'
import { crearPedidoDePrueba, limpiarPedidosDePrueba } from '../scripts/lib/pedidoDePrueba.js'
import {
  ComprobanteError,
  anularComprobante,
  comprobantesDePedido,
  consultarEstado,
  descargarPdf,
  emitirComprobante,
  enviarCorreoComprobante,
  guardarDatosFacturacion,
  obtenerComprobante,
  actualizarEstadosPendientes,
  reintentarEnvio,
  resumenFacturacionDelPedido,
} from '../src/services/comprobantes.js'
import { FalsoMifact } from './helpers/falsoMifact.js'

const hayBaseDeDatosReal = !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

const TOKEN = 'TOKEN-SECRETO-DEL-TEST=='
const MARCA = '[PRUEBA-TEST-MIFACT]'
const SERIES = ['BT01', 'FT01', 'BT02', 'FT02']
// Un cliente EMPRESA de prueba (inventado; el RUC es ficticio pero con dígito verificador correcto).
const EMPRESA = { ruc: '20123456786', razonSocial: 'PASTELERIA EJEMPLO SAC', direccionFiscal: 'Av. Prueba 123, Lima', correoCliente: 'compras@pasteleria-ejemplo.pe' }

const ENV_MIFACT: Record<string, string> = {
  MIFACT_BAKER_BROTHERS_URL: 'https://demo.mifact.test/api/invoiceService.svc',
  MIFACT_BAKER_BROTHERS_TOKEN: TOKEN,
  MIFACT_BAKER_BROTHERS_RUC: '20100100100',
  MIFACT_BAKER_BROTHERS_RAZON_SOCIAL: 'empresa demo',
  MIFACT_BAKER_BROTHERS_UBIGEO: '103040',
  MIFACT_BAKER_BROTHERS_DIRECCION: 'avenida abcd',
  MIFACT_BAKER_BROTHERS_SERIE_BOLETA: 'BT01',
  MIFACT_BAKER_BROTHERS_SERIE_FACTURA: 'FT01',
  MIFACT_HERMANOS_LOARTE_URL: 'https://demo.mifact.test/api/invoiceService.svc',
  MIFACT_HERMANOS_LOARTE_TOKEN: TOKEN,
  MIFACT_HERMANOS_LOARTE_RUC: '20100100100',
  MIFACT_HERMANOS_LOARTE_RAZON_SOCIAL: 'empresa demo dos',
  MIFACT_HERMANOS_LOARTE_UBIGEO: '103040',
  MIFACT_HERMANOS_LOARTE_DIRECCION: 'avenida efgh',
  MIFACT_HERMANOS_LOARTE_SERIE_BOLETA: 'BT02',
  MIFACT_HERMANOS_LOARTE_SERIE_FACTURA: 'FT02',
}

describe.skipIf(!hayBaseDeDatosReal)('comprobantes electrónicos desde un pedido (Mifact)', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const guardado: Record<string, string | undefined> = {}
  let tenantId: string
  let falso: FalsoMifact
  let contador = 0

  const pedido = (o: Partial<Parameters<typeof crearPedidoDePrueba>[1]> = {}) =>
    crearPedidoDePrueba(pool, {
      tenantId,
      marca: MARCA,
      sede: 'Santa Marina',
      items: [{ slug: 'alfajor-mix', cantidad: 1 }],
      numero: `TEST-MIF-${Date.now()}-${++contador}`,
      ...o,
    })
  const error = async (p: Promise<unknown>) => (await p.then(() => null, (e) => e)) as ComprobanteError | null
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

  // ————————————————————————————————————————————————————————————— emisión ————
  describe('emisión', () => {
    it('boleta desde un pedido de Santa Marina: la razón social es Baker Brothers, queda GUARDADA y aceptada, y el JSON cuadra con el pedido', async () => {
      const p = await pedido()
      const c = await emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'boleta' })
      expect(c).toMatchObject({
        pedido: p.numero, tipo: 'boleta', serie: 'BT01', correlativo: 1, numero: 'BT01-00000001', emisor: 'baker_brothers', entorno: 'demo',
        estado: 'aceptado', estadoCodigo: 102, estadoLegible: 'Aceptado por SUNAT', total: p.total,
        receptor: { tipoDoc: '0', documento: '00000000', nombre: 'CLIENTE SIN NOMBRE' },
      })
      expect(c.hash).toBe('HASH-BT01-00000001')
      expect(c.sunat.descripcion).toContain('ha sido aceptada')
      expect(c.gravado + c.igv).toBeCloseTo(c.total, 10)

      const enviado = falso.llamadasA('SendInvoice')
      expect(enviado).toHaveLength(1)
      expect(enviado[0].cuerpo).toMatchObject({ COD_TIP_CPE: '03', NUM_SERIE_CPE: 'BT01', NUM_CORRE_CPE: '00000001', MNT_TOT: p.total.toFixed(2), ENVIAR_A_SUNAT: 'true' })
      expect(enviado[0].cuerpo.items).toHaveLength(1)
      expect(enviado[0].cuerpo.datos_adicionales[0].TXT_DESC_ADIC_SUNAT).toBe(`Pedido ${p.numero}`)
      expect((await comprobantesDePedido(pool, tenantId, p.numero)).map((x) => x.numero)).toEqual(['BT01-00000001'])
    })

    it('qué razón social factura: recojo en Cedros → Hermanos Loarte; recojo en Santa Marina y TODO delivery (con o sin sede) → Baker Brothers', async () => {
      const cedros = await emitirComprobante(pool, tenantId, { pedido: (await pedido({ sede: 'Cedros' })).numero, tipo: 'boleta' })
      const santaMarina = await emitirComprobante(pool, tenantId, { pedido: (await pedido({ sede: 'Santa Marina' })).numero, tipo: 'boleta' })
      const deliveryCedros = await emitirComprobante(pool, tenantId, { pedido: (await pedido({ sede: 'Cedros', tipoEntrega: 'delivery', delivery: 7 })).numero, tipo: 'boleta' })
      const deliverySinSede = await emitirComprobante(pool, tenantId, { pedido: (await pedido({ sede: null, tipoEntrega: 'delivery', delivery: 7 })).numero, tipo: 'boleta' })
      expect([cedros.emisor, santaMarina.emisor, deliveryCedros.emisor, deliverySinSede.emisor]).toEqual(['hermanos_loarte', 'baker_brothers', 'baker_brothers', 'baker_brothers'])
      expect(cedros.serie).toBe('BT02')
      expect(santaMarina.serie).toBe('BT01')
      // Cada emisor lleva SU numeración: Baker Brothers ya va por el 3 y Hermanos Loarte por el 1.
      expect([cedros.correlativo, santaMarina.correlativo, deliveryCedros.correlativo, deliverySinSede.correlativo]).toEqual([1, 1, 2, 3])
    })

    it('el delivery se factura como una línea y el total del comprobante es el del pedido', async () => {
      const p = await pedido({ tipoEntrega: 'delivery', delivery: 7, items: [{ slug: 'alfajor-mix', cantidad: 2 }] })
      const c = await emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'boleta' })
      const items = falso.llamadasA('SendInvoice')[0].cuerpo.items as Record<string, string>[]
      expect(items.map((i) => i.TXT_DESC_ITEM)).toEqual(['Alfajor Mix', 'Servicio de delivery'])
      expect(items[1]).toMatchObject({ COD_ITEM: 'DELIVERY', MNT_PV_ITEM: '7.00' })
      expect(c.total).toBe(p.total)
    })

    it('correlativos consecutivos por serie; la factura lleva su propia serie y empieza en 1', async () => {
      const a = await emitirComprobante(pool, tenantId, { pedido: (await pedido()).numero, tipo: 'boleta' })
      const b = await emitirComprobante(pool, tenantId, { pedido: (await pedido()).numero, tipo: 'boleta' })
      const f = await emitirComprobante(pool, tenantId, { pedido: (await pedido(EMPRESA)).numero, tipo: 'factura' })
      expect([a.numero, b.numero, f.numero]).toEqual(['BT01-00000001', 'BT01-00000002', 'FT01-00000001'])
      expect(f.receptor).toMatchObject({ tipoDoc: '6', documento: EMPRESA.ruc, nombre: EMPRESA.razonSocial, correo: EMPRESA.correoCliente })
      expect(falso.llamadasA('SendInvoice')[2].cuerpo).toMatchObject({ COD_TIP_CPE: '01', COD_TIP_NIF_RECP: '6', NUM_NIF_RECP: EMPRESA.ruc, NOM_RZN_SOC_RECP: EMPRESA.razonSocial, TXT_CORREO_ENVIO: EMPRESA.correoCliente })
    })

    it('«CORRELATIVO_INICIAL» fija el primer número de una serie (para continuar una numeración existente)', async () => {
      process.env.MIFACT_BAKER_BROTHERS_CORRELATIVO_INICIAL = '1235'
      try {
        const a = await emitirComprobante(pool, tenantId, { pedido: (await pedido()).numero, tipo: 'boleta' })
        const b = await emitirComprobante(pool, tenantId, { pedido: (await pedido()).numero, tipo: 'boleta' })
        expect([a.correlativo, b.correlativo]).toEqual([1235, 1236])
      } finally {
        delete process.env.MIFACT_BAKER_BROTHERS_CORRELATIVO_INICIAL
      }
    })

    it('el receptor de la BOLETA sale del cliente: DNI, nombre legal y correo (la razón social gana sobre el nombre del cliente)', async () => {
      const p = await pedido({ dni: '12345678', nombreCliente: 'ANA', razonSocial: 'ANA TORRES QUISPE', correoCliente: 'ana@ejemplo.pe' })
      const c = await emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'boleta' })
      expect(c.receptor).toMatchObject({ tipoDoc: '1', documento: '12345678', nombre: 'ANA TORRES QUISPE', correo: 'ana@ejemplo.pe' })
    })

    it('boleta sin razón social: se usa el nombre del cliente SOLO si está confirmado (no el del perfil de WhatsApp ni el de una agenda)', async () => {
      const confirmado = await emitirComprobante(pool, tenantId, { pedido: (await pedido({ dni: '12345678', nombreCliente: 'ANA TORRES', nombreConfirmado: true })).numero, tipo: 'boleta' })
      expect(confirmado.receptor.nombre).toContain('ANA TORRES')
      const sinConfirmar = await error(emitirComprobante(pool, tenantId, { pedido: (await pedido({ dni: '12345679', nombreCliente: '🍰 Ana WhatsApp', nombreConfirmado: false })).numero, tipo: 'boleta' }))
      expect(sinConfirmar?.codigo).toBe('RECEPTOR_INVALIDO')
      expect((sinConfirmar?.detalle as { error: string }).error).toBe('NOMBRE_REQUERIDO')
      // Sin ningún documento, el nombre sin confirmar tampoco va en el comprobante.
      const anonimo = await emitirComprobante(pool, tenantId, { pedido: (await pedido({ nombreCliente: '🍰 Ana WhatsApp', nombreConfirmado: false })).numero, tipo: 'boleta' })
      expect(anonimo.receptor).toMatchObject({ tipoDoc: '0', nombre: 'CLIENTE SIN NOMBRE' })
    })

    it('boleta de un cliente que solo tiene RUC: va a su RUC y razón social', async () => {
      const c = await emitirComprobante(pool, tenantId, { pedido: (await pedido(EMPRESA)).numero, tipo: 'boleta' })
      expect(c.receptor).toMatchObject({ tipoDoc: '6', documento: EMPRESA.ruc, nombre: EMPRESA.razonSocial })
    })

    it('ENTRE VARIOS pedidos: dos emisiones a la vez nunca comparten número', async () => {
      const [p1, p2, p3] = [await pedido(), await pedido(), await pedido()]
      const r = await Promise.all([p1, p2, p3].map((p) => emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'boleta' })))
      expect(r.map((c) => c.correlativo).sort()).toEqual([1, 2, 3])
    })

    it('EL MISMO pedido a la vez: solo una emisión gana y la otra no gasta número', async () => {
      const p = await pedido()
      const r = await Promise.allSettled([
        emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'boleta' }),
        emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'boleta' }),
      ])
      expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
      const perdedora = r.find((x) => x.status === 'rejected') as PromiseRejectedResult
      expect((perdedora.reason as ComprobanteError).codigo).toBe('COMPROBANTE_YA_EMITIDO')
      expect(falso.llamadasA('SendInvoice')).toHaveLength(1)
      expect((await pool.query(`select ultimo from comprobantes_numeradores where serie = 'BT01'`)).rows[0].ultimo).toBe(1)
    })
  })

  // ——————————————————————————————————— se valida ANTES de gastar un número ————
  describe('validaciones previas (no se gasta correlativo ni se llama a Mifact)', () => {
    const sinHuellas = async () => {
      expect(falso.llamadas).toHaveLength(0)
      expect((await pool.query(`select count(*)::int n from comprobantes_numeradores where serie = any($1)`, [SERIES])).rows[0].n).toBe(0)
      expect((await pool.query(`select count(*)::int n from comprobantes where order_id in (select id from orders where nota like $1)`, [`${MARCA}%`])).rows[0].n).toBe(0)
    }

    it('estados de pedido que no se facturan: borrador, pago pendiente, anulado', async () => {
      for (const estado of ['draft', 'payment_pending', 'cancelled'] as const) {
        const e = await error(emitirComprobante(pool, tenantId, { pedido: (await pedido({ estado })).numero, tipo: 'boleta' }))
        expect(e?.codigo, estado).toBe('PEDIDO_NO_FACTURABLE')
      }
      await sinHuellas()
    })

    it('un pedido con el total por cotizar, uno inexistente y uno cuyo total no cuadra con sus líneas', async () => {
      const pendiente = await pedido()
      await pool.query(`update orders set total_pendiente = true where id = $1`, [pendiente.id])
      expect((await error(emitirComprobante(pool, tenantId, { pedido: pendiente.numero, tipo: 'boleta' })))?.codigo).toBe('PEDIDO_TOTAL_PENDIENTE')
      expect((await error(emitirComprobante(pool, tenantId, { pedido: 'NO-EXISTE-99', tipo: 'boleta' })))?.codigo).toBe('PEDIDO_NO_ENCONTRADO')

      const descuadrado = await pedido()
      await pool.query(`update orders set total = total + 1 where id = $1`, [descuadrado.id])
      const e = await error(emitirComprobante(pool, tenantId, { pedido: descuadrado.numero, tipo: 'boleta' }))
      expect(e?.codigo).toBe('TOTAL_NO_COINCIDE')
      expect(e?.detalle).toEqual({ totalPedido: descuadrado.total + 1, totalLineas: descuadrado.total })
      await sinHuellas()
    })

    it('factura: exige el RUC del CLIENTE (válido y con razón social); correo mal escrito; boleta de más de S/ 700 exige su documento', async () => {
      const p = await pedido()
      const detalle = (e: ComprobanteError | null) => (e?.detalle as { error: string } | undefined)?.error
      // Cliente sin RUC.
      const sinRuc = await error(emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'factura' }))
      expect([sinRuc?.codigo, detalle(sinRuc)]).toEqual(['RECEPTOR_INVALIDO', 'FACTURA_REQUIERE_RUC'])
      // RUC con 11 dígitos pero dígito verificador incorrecto.
      const cliente = (await pool.query(`select customer_id from orders where id = $1`, [p.id])).rows[0].customer_id
      await pool.query(`update customers set ruc = '20123456785', razon_social = 'EMPRESA SAC' where id = $1`, [cliente])
      expect(detalle(await error(emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'factura' })))).toBe('RUC_INVALIDO')
      // RUC válido pero sin razón social ni nombre confirmado.
      await pool.query(`update customers set ruc = '20123456786', razon_social = null, nombre_confirmado = false where id = $1`, [cliente])
      expect(detalle(await error(emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'factura' })))).toBe('NOMBRE_REQUERIDO')
      // Correo del cliente mal escrito.
      await pool.query(`update customers set correo = 'mal-correo' where id = $1`, [cliente])
      expect(detalle(await error(emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'boleta' })))).toBe('CORREO_INVALIDO')

      const grande = await pedido({ items: [{ slug: 'alfajor-mix', cantidad: 60 }] })
      expect(grande.total).toBeGreaterThan(700)
      expect(detalle(await error(emitirComprobante(pool, tenantId, { pedido: grande.numero, tipo: 'boleta' })))).toBe('BOLETA_SOBRE_LIMITE_REQUIERE_DOCUMENTO')
      await sinHuellas()
      // Con el DNI cargado en el cliente, se puede.
      await pool.query(`update customers set dni = '12345678', razon_social = 'ANA TORRES QUISPE' where id = (select customer_id from orders where id = $1)`, [grande.id])
      expect((await emitirComprobante(pool, tenantId, { pedido: grande.numero, tipo: 'boleta' })).estado).toBe('aceptado')
    })

    it('un cliente con datos de EJEMPLO de Mifact (RUC, DNI o correo de su documentación) no sale en ningún comprobante', async () => {
      const ruc = await error(emitirComprobante(pool, tenantId, { pedido: (await pedido({ ruc: '20601847834', razonSocial: 'PASTELERIA EJEMPLO SAC' })).numero, tipo: 'factura' }))
      expect([ruc?.codigo, (ruc?.detalle as { error: string }).error]).toEqual(['RECEPTOR_INVALIDO', 'DATOS_DE_EJEMPLO'])
      const dni = await error(emitirComprobante(pool, tenantId, { pedido: (await pedido({ dni: '40506089', razonSocial: 'ANA TORRES' })).numero, tipo: 'boleta' }))
      expect((dni?.detalle as { error: string }).error).toBe('DATOS_DE_EJEMPLO')
      const correo = await error(emitirComprobante(pool, tenantId, { pedido: (await pedido({ correoCliente: 'mifact@outlook.com' })).numero, tipo: 'boleta' }))
      expect((correo?.detalle as { error: string }).error).toBe('DATOS_DE_EJEMPLO')
      await sinHuellas()
    })

    it('sin las variables de entorno del emisor: MIFACT_NO_CONFIGURADO, con el NOMBRE de lo que falta (nunca un valor)', async () => {
      delete process.env.MIFACT_BAKER_BROTHERS_TOKEN
      delete process.env.MIFACT_BAKER_BROTHERS_SERIE_FACTURA
      const e = await error(emitirComprobante(pool, tenantId, { pedido: (await pedido()).numero, tipo: 'boleta' }))
      expect(e?.codigo).toBe('MIFACT_NO_CONFIGURADO')
      expect(e?.detalle).toMatchObject({ faltan: ['MIFACT_BAKER_BROTHERS_TOKEN', 'MIFACT_BAKER_BROTHERS_SERIE_FACTURA'] })
      expect(JSON.stringify(e?.detalle)).not.toContain(TOKEN)
      await sinHuellas()
    })

    it('un pedido tiene a lo sumo un comprobante vigente; tras pedir su anulación se puede emitir otro', async () => {
      const p = await pedido(EMPRESA)
      const a = await emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'boleta' })
      const repetido = await error(emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'factura' }))
      expect(repetido?.codigo).toBe('COMPROBANTE_YA_EMITIDO')
      expect(repetido?.message).toContain('BT01-00000001')
      expect(falso.llamadasA('SendInvoice')).toHaveLength(1)

      await anularComprobante(pool, tenantId, a.id, { motivo: 'ERROR EN EL TIPO DE COMPROBANTE' })
      const f = await emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'factura' })
      expect(f.numero).toBe('FT01-00000001')
      expect((await comprobantesDePedido(pool, tenantId, p.numero)).map((x) => [x.numero, x.estado])).toEqual([
        ['BT01-00000001', 'anulacion_solicitada'],
        ['FT01-00000001', 'aceptado'],
      ])
    })

    it('la base lo sostiene aunque el código fallara: el índice único impide dos comprobantes vigentes del mismo pedido', async () => {
      const p = await pedido()
      await emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'boleta' })
      const vigente = (await pool.query(`select * from comprobantes where order_id = $1`, [p.id])).rows[0]
      const intento = pool.query(
        `insert into comprobantes (tenant_id, order_id, emisor, entorno, tipo, serie, correlativo, fecha_emision, receptor_tipo_doc, receptor_doc, receptor_nombre, gravado, igv, total, payload)
         values ($1,$2,'baker_brothers','demo','boleta','BT01',99,current_date,'0','00000000','X',1,0.18,1.18,'{}')`,
        [tenantId, p.id]
      )
      await expect(intento).rejects.toMatchObject({ code: '23505', constraint: 'comprobantes_uno_vigente_por_pedido' })
      expect(vigente.estado).toBe('aceptado')
    })
  })

  // ————————————————————————————————————— numeración y respuestas dudosas ————
  describe('numeración y fallos de Mifact', () => {
    it('si el número YA existe en Mifact (el demo es compartido) se pasa al siguiente; el número gastado queda marcado y no se reutiliza', async () => {
      falso.registrar('03', 'BT01', 1)
      const p = await pedido()
      const c = await emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'boleta' })
      expect(c.numero).toBe('BT01-00000002')
      expect(falso.llamadasA('SendInvoice').map((l) => l.cuerpo.NUM_CORRE_CPE)).toEqual(['00000001', '00000002'])
      const filas = (await pool.query(`select correlativo, estado from comprobantes where order_id = $1 order by correlativo`, [p.id])).rows
      expect(filas).toEqual([{ correlativo: 1, estado: 'error' }, { correlativo: 2, estado: 'aceptado' }])
    })

    it('si los 5 números siguientes ya existen: NUMERO_NO_DISPONIBLE (no sigue gastando números)', async () => {
      for (let n = 1; n <= 5; n++) falso.registrar('03', 'BT01', n)
      const e = await error(emitirComprobante(pool, tenantId, { pedido: (await pedido()).numero, tipo: 'boleta' }))
      expect(e?.codigo).toBe('NUMERO_NO_DISPONIBLE')
      expect(falso.llamadasA('SendInvoice')).toHaveLength(5)
    })

    it('Mifact rechaza el documento (token inválido): MIFACT_RECHAZO, la fila queda «con error» SIN el token, y el pedido puede volver a intentarse', async () => {
      const p = await pedido()
      falso = new FalsoMifact('otro-token')
      vi.stubGlobal('fetch', falso.fetch)
      const e = await error(emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'boleta' }))
      expect(e?.codigo).toBe('MIFACT_RECHAZO')
      expect(e?.message).toContain('Token invalido')
      expect(e?.comprobanteId).toBeTruthy()
      const fila = await obtenerComprobante(pool, tenantId, e!.comprobanteId!)
      expect(fila).toMatchObject({ estado: 'error', ultimoError: 'Token invalido' })

      falso = new FalsoMifact(TOKEN)
      vi.stubGlobal('fetch', falso.fetch)
      const bien = await emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'boleta' })
      expect([bien.estado, bien.correlativo]).toEqual(['aceptado', 2]) // el 1 quedó gastado (hueco documentado)
    })

    it('RESPUESTA PERDIDA con el documento ya registrado: queda «pendiente de envío», bloquea el pedido, y consultar el estado lo ADOPTA sin volver a enviar', async () => {
      const p = await pedido()
      falso.fallar('SendInvoice', { tipo: 'timeout', procesar: true })
      const e = await error(emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'boleta' }))
      expect(e?.codigo).toBe('MIFACT_SIN_RESPUESTA')
      expect(e?.message).toContain('tiempo de espera')
      const pendiente = await obtenerComprobante(pool, tenantId, e!.comprobanteId!)
      expect(pendiente).toMatchObject({ estado: 'pendiente_envio', numero: 'BT01-00000001' })

      expect((await error(emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'boleta' })))?.codigo).toBe('COMPROBANTE_YA_EMITIDO')
      const adoptado = await consultarEstado(pool, tenantId, pendiente.id)
      expect(adoptado).toMatchObject({ estado: 'aceptado', estadoCodigo: 102, numero: 'BT01-00000001' })
      expect(falso.llamadasA('SendInvoice')).toHaveLength(1)
    })

    it('RESPUESTA PERDIDA con el documento NO registrado: reintentar manda EXACTAMENTE lo mismo, con el MISMO número', async () => {
      const p = await pedido()
      falso.fallar('SendInvoice', { tipo: 'sin_conexion' })
      const e = await error(emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'boleta' }))
      expect(e?.codigo).toBe('MIFACT_SIN_RESPUESTA')
      const id = e!.comprobanteId!

      const consulta = await consultarEstado(pool, tenantId, id)
      expect(consulta.estado).toBe('pendiente_envio')
      expect(consulta.ultimoError).toContain('no llegó a registrarse')

      const c = await reintentarEnvio(pool, tenantId, id)
      expect(c).toMatchObject({ estado: 'aceptado', numero: 'BT01-00000001', ultimoError: null })
      const envios = falso.llamadasA('SendInvoice')
      expect(envios).toHaveLength(2)
      expect(envios[1].cuerpo).toEqual(envios[0].cuerpo)
      expect((await pool.query(`select intentos from comprobantes where id = $1`, [id])).rows[0].intentos).toBe(2)
      expect((await error(reintentarEnvio(pool, tenantId, id)))?.codigo).toBe('ESTADO_NO_PERMITE') // ya no está pendiente
    })

    it('reintentar un pendiente que Mifact YA tiene lo adopta: no vuelve a enviar nada', async () => {
      const p = await pedido()
      falso.fallar('SendInvoice', { tipo: 'http500', procesar: true })
      const e = await error(emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'boleta' }))
      const c = await reintentarEnvio(pool, tenantId, e!.comprobanteId!)
      expect(c.estado).toBe('aceptado')
      expect(falso.llamadasA('SendInvoice')).toHaveLength(1)
    })

    it('el token no queda en NINGUNA columna de texto, ni en el payload guardado', async () => {
      const p = await pedido()
      await emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'boleta' })
      const todo = (await pool.query(`select c::text as fila from comprobantes c where order_id = $1`, [p.id])).rows[0].fila as string
      expect(todo).not.toContain(TOKEN)
      expect(todo).toContain('NUM_NIF_EMIS')
    })
  })

  // ——————————————————————————————————————————————————————————————— estado ————
  describe('consultar el estado y guardarlo en el pedido', () => {
    const emitida = async () => {
      const p = await pedido()
      return emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'boleta' })
    }
    const mifactDice = (c: { tipo: string; serie: string; correlativo: number }, estado: string) => {
      falso.documentos.get(`${c.tipo === 'boleta' ? '03' : '01'}|${c.serie}|${c.correlativo}`)!.estado = estado
    }

    it('traduce cada estado de Mifact: 101 en proceso, 102 aceptado, 103 con observaciones, 104 rechazado, 108 baja solicitada, 105 anulado', async () => {
      const c = await emitida()
      const esperado: [string, string][] = [
        ['101', 'en_proceso'], ['103', 'aceptado_con_observaciones'], ['104', 'rechazado'], ['108', 'anulacion_solicitada'], ['105', 'anulado'], ['102', 'aceptado'],
      ]
      for (const [codigo, estado] of esperado) {
        mifactDice(c, codigo)
        const r = await consultarEstado(pool, tenantId, c.id)
        expect([r.estadoCodigo, r.estado], codigo).toEqual([Number(codigo), estado])
        expect(r.consultadoEn).not.toBeNull()
        expect(r.sunat.codigo).toBe('0')
      }
    })

    it('un código que Mifact no documenta NO se inventa: el estado guardado no cambia', async () => {
      const c = await emitida()
      mifactDice(c, '777')
      const r = await consultarEstado(pool, tenantId, c.id)
      expect([r.estado, r.estadoCodigo]).toEqual(['aceptado', 102])
    })

    it('si Mifact no encuentra un comprobante que ya estaba aceptado, lo anota sin cambiar su estado', async () => {
      const c = await emitida()
      falso.documentos.clear()
      const r = await consultarEstado(pool, tenantId, c.id)
      expect(r.estado).toBe('aceptado')
      expect(r.ultimoError).toContain('ya no encuentra')
    })

    it('si Mifact no responde: MIFACT_SIN_RESPUESTA y nada cambia', async () => {
      const c = await emitida()
      falso.fallar('GetEstatusInvoice', { tipo: 'timeout' })
      const e = await error(consultarEstado(pool, tenantId, c.id))
      expect(e?.codigo).toBe('MIFACT_SIN_RESPUESTA')
      expect((await obtenerComprobante(pool, tenantId, c.id)).estado).toBe('aceptado')
    })

    it('un comprobante del DEMO no se opera con la configuración de PRODUCCIÓN (ni se hace la llamada)', async () => {
      const c = await emitida()
      const antes = falso.llamadas.length
      process.env.MIFACT_BAKER_BROTHERS_URL = 'https://api.mifact.net.pe/api/invoiceService.svc'
      process.env.MIFACT_BAKER_BROTHERS_RUC = '20612010880'
      const e = await error(consultarEstado(pool, tenantId, c.id))
      expect(e?.codigo).toBe('ENTORNO_NO_COINCIDE')
      expect(falso.llamadas).toHaveLength(antes)
    })

    it('comprobante inexistente', async () => {
      expect((await error(consultarEstado(pool, tenantId, '00000000-0000-0000-0000-000000000000')))?.codigo).toBe('COMPROBANTE_NO_ENCONTRADO')
    })
  })

  // ——————————————————————————————————————————————————————————————— PDF ————
  describe('PDF', () => {
    it('se baja de Mifact la primera vez y queda guardado en el pedido (bytes + URL); las siguientes salen de la base', async () => {
      const p = await pedido()
      const c = await emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'boleta' })
      const a = await descargarPdf(pool, tenantId, c.id)
      expect(a.pdf.subarray(0, 4).toString()).toBe('%PDF')
      expect(a.nombreArchivo).toBe('BT01-00000001.pdf')
      expect(a.url).toContain('BT01-00000001.pdf')
      expect(falso.llamadasA('GetInvoice')).toHaveLength(1)
      expect(falso.llamadasA('GetInvoice')[0].cuerpo).toMatchObject({ RETORNA_PDF: 'true', COD_FORM_IMPR: '001' })

      const guardado = await obtenerComprobante(pool, tenantId, c.id)
      expect(guardado).toMatchObject({ tienePdf: true, urlPdf: a.url })
      expect((await pool.query(`select length(pdf) as n, pdf_guardado_en is not null as fecha from comprobantes where id = $1`, [c.id])).rows[0]).toMatchObject({ n: a.pdf.length, fecha: true })

      const b = await descargarPdf(pool, tenantId, c.id)
      expect(b.pdf.equals(a.pdf)).toBe(true)
      expect(falso.llamadasA('GetInvoice')).toHaveLength(1)
      await descargarPdf(pool, tenantId, c.id, { actualizar: true })
      expect(falso.llamadasA('GetInvoice')).toHaveLength(2)
    })

    it('sin PDF todavía si el comprobante está pendiente de envío; y un archivo que no es PDF se rechaza', async () => {
      const p = await pedido()
      falso.fallar('SendInvoice', { tipo: 'sin_conexion' })
      const e = await error(emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'boleta' }))
      expect((await error(descargarPdf(pool, tenantId, e!.comprobanteId!)))?.codigo).toBe('ESTADO_NO_PERMITE')

      const q = await pedido()
      const c = await emitirComprobante(pool, tenantId, { pedido: q.numero, tipo: 'boleta' })
      vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ errors: '', pdf_bytes: Buffer.from('esto no es un pdf').toString('base64') })))
      expect((await error(descargarPdf(pool, tenantId, c.id)))?.codigo).toBe('SIN_PDF')
      expect((await obtenerComprobante(pool, tenantId, c.id)).tienePdf).toBe(false)
    })
  })

  // ————————————————————————————————————————————————————————— anulación ————
  describe('anulación', () => {
    it('pide la baja a Mifact (108), guarda el motivo y la hora; y un comprobante ya en baja no se vuelve a anular', async () => {
      const p = await pedido()
      const c = await emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'boleta' })
      const a = await anularComprobante(pool, tenantId, c.id, { motivo: '  ANULACION   POR ERROR ' })
      expect(a).toMatchObject({ estado: 'anulacion_solicitada', estadoCodigo: 108, motivoAnulacion: 'ANULACION POR ERROR' })
      expect(falso.llamadasA('LowInvoice')[0].cuerpo).toMatchObject({ TXT_DESC_MTVO: 'ANULACION POR ERROR', COD_TIP_NIF_EMIS: '6', COD_TIP_CPE: '03', NUM_SERIE_CPE: 'BT01', NUM_CORRE_CPE: '00000001' })
      expect((await pool.query(`select anulacion_solicitada_en is not null as hora from comprobantes where id = $1`, [c.id])).rows[0].hora).toBe(true)
      expect((await error(anularComprobante(pool, tenantId, c.id, { motivo: 'OTRA VEZ' })))?.codigo).toBe('ESTADO_NO_PERMITE')
      expect(falso.llamadasA('LowInvoice')).toHaveLength(1)

      // Al final del día Mifact la procesa y pasa a «anulado» (105): se refleja al consultar.
      falso.documentos.get('03|BT01|1')!.estado = '105'
      expect((await consultarEstado(pool, tenantId, c.id)).estado).toBe('anulado')
    })

    it('el motivo debe tener sentido (3 a 100 caracteres) y un comprobante con error no se anula', async () => {
      const c = await emitirComprobante(pool, tenantId, { pedido: (await pedido()).numero, tipo: 'boleta' })
      expect((await error(anularComprobante(pool, tenantId, c.id, { motivo: 'ab' })))?.codigo).toBe('MOTIVO_INVALIDO')
      expect((await error(anularComprobante(pool, tenantId, c.id, { motivo: 'x'.repeat(101) })))?.codigo).toBe('MOTIVO_INVALIDO')
      await pool.query(`update comprobantes set estado = 'error' where id = $1`, [c.id])
      expect((await error(anularComprobante(pool, tenantId, c.id, { motivo: 'ANULACION POR ERROR' })))?.codigo).toBe('ESTADO_NO_PERMITE')
      expect(falso.llamadasA('LowInvoice')).toHaveLength(0)
    })

    it('si Mifact no responde la baja, el estado NO cambia (se puede volver a pedir)', async () => {
      const c = await emitirComprobante(pool, tenantId, { pedido: (await pedido()).numero, tipo: 'boleta' })
      falso.fallar('LowInvoice', { tipo: 'timeout' })
      expect((await error(anularComprobante(pool, tenantId, c.id, { motivo: 'ANULACION POR ERROR' })))?.codigo).toBe('MIFACT_SIN_RESPUESTA')
      expect((await obtenerComprobante(pool, tenantId, c.id)).estado).toBe('aceptado')
      expect((await anularComprobante(pool, tenantId, c.id, { motivo: 'ANULACION POR ERROR' })).estado).toBe('anulacion_solicitada')
    })
  })

  // ————————————————————————————————————————————————————————————— correo ————
  describe('envío por correo', () => {
    it('Mifact envía el comprobante al correo y queda anotado en el pedido', async () => {
      const c = await emitirComprobante(pool, tenantId, { pedido: (await pedido()).numero, tipo: 'boleta' })
      const r = await enviarCorreoComprobante(pool, tenantId, c.id, '  cliente@ejemplo.pe ')
      expect(r.correoEnviadoA).toBe('cliente@ejemplo.pe')
      expect(falso.llamadasA('SendMailInvoice')[0].cuerpo).toMatchObject({ TXT_CORREO_ENVIO: 'cliente@ejemplo.pe', NUM_SERIE_CPE: 'BT01', NUM_CORRE_CPE: '00000001' })
      expect(falso.documentos.get('03|BT01|1')!.correos).toEqual(['cliente@ejemplo.pe'])
      expect((await pool.query(`select correo_enviado_en is not null as hora from comprobantes where id = $1`, [c.id])).rows[0].hora).toBe(true)
    })

    it('correo inválido, comprobante sin vigencia y fallo de Mifact: no se anota ningún envío', async () => {
      const c = await emitirComprobante(pool, tenantId, { pedido: (await pedido()).numero, tipo: 'boleta' })
      expect((await error(enviarCorreoComprobante(pool, tenantId, c.id, 'no-es-correo')))?.codigo).toBe('CORREO_INVALIDO')
      falso.fallar('SendMailInvoice', { tipo: 'http500' })
      expect((await error(enviarCorreoComprobante(pool, tenantId, c.id, 'a@b.pe')))?.codigo).toBe('MIFACT_SIN_RESPUESTA')
      await pool.query(`update comprobantes set estado = 'anulado' where id = $1`, [c.id])
      expect((await error(enviarCorreoComprobante(pool, tenantId, c.id, 'a@b.pe')))?.codigo).toBe('ESTADO_NO_PERMITE')
      expect((await obtenerComprobante(pool, tenantId, c.id)).correoEnviadoA).toBeNull()
    })
  })

  // ——————————————————————————————————————— lo que muestra el panel en el pedido ————
  describe('resumen de facturación del pedido (lo que usa el botón del panel)', () => {
    it('dice QUÉ razón social factura (por local), a quién se emitiría (del cliente) y qué botones se habilitan', async () => {
      const sm = await resumenFacturacionDelPedido(pool, tenantId, (await pedido({ sede: 'Santa Marina', ...EMPRESA })).numero)
      expect(sm.emisor).toMatchObject({ clave: 'baker_brothers', razonSocial: 'Baker Brothers E.I.R.L.', configurado: true, entorno: 'demo' })
      expect(sm.puede.factura).toMatchObject({ ok: true, receptor: { tipoDoc: '6', documento: EMPRESA.ruc, nombre: EMPRESA.razonSocial } })
      expect(sm.puede.boleta).toMatchObject({ ok: true, receptor: { tipoDoc: '6', nombre: EMPRESA.razonSocial } })
      expect(sm.cliente).toMatchObject({ ruc: EMPRESA.ruc, razonSocial: EMPRESA.razonSocial })

      const cedros = await resumenFacturacionDelPedido(pool, tenantId, (await pedido({ sede: 'Cedros' })).numero)
      expect(cedros.emisor.razonSocial).toBe('Corporación Hermanos Loarte S.A.C.')
      const delivery = await resumenFacturacionDelPedido(pool, tenantId, (await pedido({ sede: 'Cedros', tipoEntrega: 'delivery', delivery: 7 })).numero)
      expect(delivery.emisor.razonSocial).toBe('Baker Brothers E.I.R.L.')
    })

    it('la FACTURA solo se habilita si el cliente tiene RUC; la boleta sin documento sale «CLIENTE SIN NOMBRE»', async () => {
      const r = await resumenFacturacionDelPedido(pool, tenantId, (await pedido()).numero)
      expect(r.puede.factura).toMatchObject({ ok: false, codigo: 'RECEPTOR_INVALIDO', detalle: { error: 'FACTURA_REQUIERE_RUC' } })
      expect(r.puede.boleta).toMatchObject({ ok: true, receptor: { tipoDoc: '0', documento: '00000000', nombre: 'CLIENTE SIN NOMBRE' } })
    })

    it('un pedido que no se factura, o con Mifact sin configurar, explica por qué (y no habilita nada)', async () => {
      const pendiente = await resumenFacturacionDelPedido(pool, tenantId, (await pedido({ estado: 'payment_pending' })).numero)
      expect(pendiente.puede.boleta).toMatchObject({ ok: false, codigo: 'PEDIDO_NO_FACTURABLE' })
      expect(pendiente.puede.factura.ok).toBe(false)

      delete process.env.MIFACT_BAKER_BROTHERS_TOKEN
      const sinConfig = await resumenFacturacionDelPedido(pool, tenantId, (await pedido()).numero)
      expect(sinConfig.emisor).toMatchObject({ configurado: false, entorno: null })
      expect(sinConfig.puede.boleta).toMatchObject({ ok: false, codigo: 'MIFACT_NO_CONFIGURADO' })
      expect(falso.llamadas).toHaveLength(0)
    })

    it('incluye los comprobantes del pedido con su estado, y ya no deja emitir otro mientras haya uno vigente', async () => {
      const p = await pedido(EMPRESA)
      const c = await emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'factura' })
      const r = await resumenFacturacionDelPedido(pool, tenantId, p.numero)
      expect(r.comprobantes.map((x) => [x.id, x.numero, x.estado])).toEqual([[c.id, 'FT01-00000001', 'aceptado']])
      expect(r.puede.boleta).toMatchObject({ ok: false, codigo: 'COMPROBANTE_YA_EMITIDO' })
      expect(r.puede.factura).toMatchObject({ ok: false, codigo: 'COMPROBANTE_YA_EMITIDO' })
    })
  })

  // ————————————————————————————————————— datos del cliente para sus comprobantes ————
  describe('datos del cliente para sus comprobantes', () => {
    const clienteDe = async (p: { id: string }) => (await pool.query(`select customer_id from orders where id = $1`, [p.id])).rows[0].customer_id as string

    it('se guardan en el CLIENTE (RUC, razón social, dirección fiscal, DNI, correo) y el siguiente comprobante los usa', async () => {
      const p = await pedido()
      const id = await clienteDe(p)
      const guardado = await guardarDatosFacturacion(pool, tenantId, id, { ruc: '  20123456786 ', razonSocial: ' Pastelería   Ejemplo SAC ', direccionFiscal: 'Av. Prueba 123', correo: 'compras@pasteleria-ejemplo.pe' })
      expect(guardado).toMatchObject({ ruc: '20123456786', razonSocial: 'Pastelería Ejemplo SAC', direccionFiscal: 'Av. Prueba 123', correo: 'compras@pasteleria-ejemplo.pe' })
      const c = await emitirComprobante(pool, tenantId, { pedido: p.numero, tipo: 'factura' })
      expect(c.receptor).toMatchObject({ documento: '20123456786', nombre: 'Pastelería Ejemplo SAC', direccion: 'Av. Prueba 123' })
    })

    it('un campo omitido no se toca; null o vacío lo borra', async () => {
      const id = await clienteDe(await pedido({ ...EMPRESA, dni: '12345678' }))
      await guardarDatosFacturacion(pool, tenantId, id, { razonSocial: 'OTRA SAC' })
      let c = (await pool.query(`select ruc, razon_social, dni from customers where id = $1`, [id])).rows[0]
      expect(c).toEqual({ ruc: EMPRESA.ruc, razon_social: 'OTRA SAC', dni: '12345678' })
      await guardarDatosFacturacion(pool, tenantId, id, { ruc: null, dni: '' })
      c = (await pool.query(`select ruc, razon_social, dni from customers where id = $1`, [id])).rows[0]
      expect(c).toEqual({ ruc: null, razon_social: 'OTRA SAC', dni: null })
    })

    it('valida todo: RUC con dígito verificador, DNI de 8 dígitos, correo; rechaza datos de ejemplo de Mifact; nada se guarda a medias', async () => {
      const id = await clienteDe(await pedido())
      const malo = async (datos: Parameters<typeof guardarDatosFacturacion>[3]) => {
        const e = await error(guardarDatosFacturacion(pool, tenantId, id, datos))
        expect(e?.codigo).toBe('DATOS_CLIENTE_INVALIDOS')
        return (e?.detalle as { campo: string }).campo
      }
      expect(await malo({ ruc: '20123456785' })).toBe('ruc')
      expect(await malo({ ruc: '2012345' })).toBe('ruc')
      expect(await malo({ dni: '1234567' })).toBe('dni')
      expect(await malo({ correo: 'sin-arroba' })).toBe('correo')
      expect(await malo({ ruc: '20601847834' })).toBe('ruc') // el RUC de ejemplo de Mifact
      expect(await malo({ dni: '40506089' })).toBe('dni')
      expect(await malo({ razonSocial: 'osys company sac' })).toBe('razonSocial')
      expect(await malo({ correo: 'mifact@outlook.com' })).toBe('correo')
      expect(await malo({})).toBe('')
      // Un campo bueno junto a uno malo: no se guarda ninguno.
      expect(await malo({ razonSocial: 'BUENA SAC', ruc: '20123456785' })).toBe('ruc')
      expect((await pool.query(`select razon_social, ruc from customers where id = $1`, [id])).rows[0]).toEqual({ razon_social: null, ruc: null })
    })

    it('un cliente que no existe', async () => {
      const e = await error(guardarDatosFacturacion(pool, tenantId, '00000000-0000-0000-0000-000000000000', { razonSocial: 'X SAC' }))
      expect(e?.codigo).toBe('CLIENTE_NO_ENCONTRADO')
    })
  })

  // ———————————————————— actualización automática (la boleta «En proceso» pasa a «Aceptado» sola) ————
  describe('actualización automática de estados', () => {
    const clave = (c: { tipo: string; serie: string; correlativo: number }) => `${c.tipo === 'boleta' ? '03' : '01'}|${c.serie}|${c.correlativo}`
    /** Emite con Mifact respondiendo «101 en proceso» (como las boletas reales: SUNAT las acepta al día siguiente). */
    const enProceso = async () => {
      falso.estadoAlRegistrar = '101'
      const c = await emitirComprobante(pool, tenantId, { pedido: (await pedido()).numero, tipo: 'boleta' })
      expect(c.estado).toBe('en_proceso')
      return c
    }
    /** Hace como si la boleta se hubiera emitido hace `dias` días (hora de Lima) y nunca se hubiera consultado. */
    const emitidaHaceDias = (id: string, dias: number) =>
      pool.query(`update comprobantes set fecha_emision = (now() at time zone 'America/Lima')::date - $2::int, consultado_en = null where id = $1`, [id, dias])
    const estadoEnBase = async (id: string) => (await pool.query(`select estado, estado_codigo from comprobantes where id = $1`, [id])).rows[0]

    it('una boleta en proceso de AYER se consulta sola y queda aceptada', async () => {
      const c = await enProceso()
      await emitidaHaceDias(c.id, 1)
      falso.documentos.get(clave(c))!.estado = '102'
      const r = await actualizarEstadosPendientes(pool, tenantId)
      expect(r).toEqual({ consultados: 1, cambiaron: 1, fallaron: 0 })
      expect(await estadoEnBase(c.id)).toEqual({ estado: 'aceptado', estado_codigo: 102 })
      expect(falso.llamadasA('GetEstatusInvoice')).toHaveLength(1)
    })

    it('lo de HOY no se consulta: todavía no hay nada que preguntarle a SUNAT', async () => {
      const c = await enProceso()
      const r = await actualizarEstadosPendientes(pool, tenantId)
      expect(r.consultados).toBe(0)
      expect(falso.llamadasA('GetEstatusInvoice')).toHaveLength(0)
      expect((await estadoEnBase(c.id)).estado).toBe('en_proceso')
    })

    it('si SUNAT todavía no responde, sigue «En proceso»: se anota la consulta y no se repite de inmediato', async () => {
      const c = await enProceso()
      await emitidaHaceDias(c.id, 1)
      const a = await actualizarEstadosPendientes(pool, tenantId)
      expect(a).toEqual({ consultados: 1, cambiaron: 0, fallaron: 0 })
      expect((await estadoEnBase(c.id)).estado).toBe('en_proceso')
      expect((await obtenerComprobante(pool, tenantId, c.id)).consultadoEn).not.toBeNull()
      // Una segunda vuelta enseguida no vuelve a molestar a Mifact por el mismo comprobante…
      expect((await actualizarEstadosPendientes(pool, tenantId)).consultados).toBe(0)
      // …pero pasada la hora sí, y entonces lo encuentra aceptado.
      await pool.query(`update comprobantes set consultado_en = now() - interval '2 hours' where id = $1`, [c.id])
      falso.documentos.get(clave(c))!.estado = '102'
      expect(await actualizarEstadosPendientes(pool, tenantId)).toEqual({ consultados: 1, cambiaron: 1, fallaron: 0 })
    })

    it('una baja solicitada de un día anterior pasa sola a «Anulado»', async () => {
      const c = await enProceso()
      await anularComprobante(pool, tenantId, c.id, { motivo: 'Error en el pedido' })
      await pool.query(`update comprobantes set anulacion_solicitada_en = now() - interval '2 days', consultado_en = null where id = $1`, [c.id])
      falso.documentos.get(clave(c))!.estado = '105'
      expect(await actualizarEstadosPendientes(pool, tenantId)).toEqual({ consultados: 1, cambiaron: 1, fallaron: 0 })
      expect(await estadoEnBase(c.id)).toEqual({ estado: 'anulado', estado_codigo: 105 })
    })

    it('NO toca lo que ya terminó, lo pendiente de envío ni lo que tiene error', async () => {
      const aceptada = await emitirComprobante(pool, tenantId, { pedido: (await pedido()).numero, tipo: 'boleta' })
      falso.estadoAlRegistrar = '101'
      const pendiente = await emitirComprobante(pool, tenantId, { pedido: (await pedido()).numero, tipo: 'boleta' })
      const conError = await emitirComprobante(pool, tenantId, { pedido: (await pedido()).numero, tipo: 'boleta' })
      await pool.query(`update comprobantes set estado = 'pendiente_envio' where id = $1`, [pendiente.id])
      await pool.query(`update comprobantes set estado = 'error', ultimo_error = 'x' where id = $1`, [conError.id])
      for (const c of [aceptada, pendiente, conError]) await emitidaHaceDias(c.id, 3)
      const r = await actualizarEstadosPendientes(pool, tenantId)
      expect(r.consultados).toBe(0)
      expect(falso.llamadasA('GetEstatusInvoice')).toHaveLength(0)
    })

    it('si Mifact falla con uno, sigue con los demás y no lanza', async () => {
      const a = await enProceso()
      const b = await enProceso()
      for (const c of [a, b]) await emitidaHaceDias(c.id, 1)
      falso.documentos.get(clave(b))!.estado = '102'
      falso.fallar('GetEstatusInvoice', { tipo: 'sin_conexion' })
      const falladas: string[] = []
      const r = await actualizarEstadosPendientes(pool, tenantId, { alFallar: (id) => falladas.push(id) })
      expect(r).toMatchObject({ consultados: 2, fallaron: 1 })
      expect(falladas).toHaveLength(1)
      // El que falló sigue como estaba y se reintenta en la próxima vuelta; el otro se actualizó.
      const estados = (await Promise.all([a, b].map((c) => estadoEnBase(c.id)))).map((x) => x.estado).sort()
      expect(estados).toEqual(['aceptado', 'en_proceso'])
    })

    it('respeta el tope por vuelta y empieza por los que nunca se consultaron', async () => {
      const cs = [await enProceso(), await enProceso(), await enProceso()]
      for (const c of cs) await emitidaHaceDias(c.id, 1)
      const r = await actualizarEstadosPendientes(pool, tenantId, { maximo: 2 })
      expect(r.consultados).toBe(2)
      const consultadas = (await pool.query(`select count(*)::int as n from comprobantes where id = any($1) and consultado_en is not null`, [cs.map((c) => c.id)])).rows[0].n
      expect(consultadas).toBe(2)
      // La siguiente vuelta toma el que quedó sin consultar.
      expect((await actualizarEstadosPendientes(pool, tenantId, { maximo: 2 })).consultados).toBe(1)
    })

    it('un comprobante del demo no se consulta con la configuración de producción: se cuenta como fallo y no cambia', async () => {
      const c = await enProceso()
      await emitidaHaceDias(c.id, 1)
      process.env.MIFACT_BAKER_BROTHERS_URL = 'https://mifact.net.pe/mifactapi99/invoiceService.svc'
      process.env.MIFACT_BAKER_BROTHERS_RUC = '20612010880'
      const r = await actualizarEstadosPendientes(pool, tenantId)
      expect(r).toMatchObject({ consultados: 1, cambiaron: 0, fallaron: 1 })
      expect(falso.llamadasA('GetEstatusInvoice')).toHaveLength(0)
    })
  })
})

// «Nuevo pedido» del panel: con qué se paga.
//   · Sin marcar «Pagado»: el pedido nace «Confirmado» y se guarda como «contraentrega» (paga al recoger), aunque el
//     navegador mande otro medio (el servidor manda, no la pantalla).
//   · Con «Pagado»: hay que decir con qué (Yape, Plin, transferencia, tarjeta o EFECTIVO) y el pedido nace «paid».
//   · «Pagado» sin medio, o con «contraentrega», se rechaza: es justo lo contrario de haber pagado.
// Contra Postgres real (con la migración 0059) y las rutas reales; solo se mockea la verificación del JWT. Sin base se salta.
// Usa una fecha lejana (2032) y clientes «Prueba Pago», y limpia al terminar.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal = !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

vi.mock('../src/auth/verificarJwtOperador.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/auth/verificarJwtOperador.js')>()),
  verificarJwtOperador: async (
    req: { headers: Record<string, string | undefined>; operador?: unknown },
    reply: { code: (n: number) => { send: (b: unknown) => unknown } }
  ) => {
    const rol = req.headers['x-test-rol']
    if (!rol) return reply.code(401).send({ error: 'NO_AUTORIZADO' })
    req.operador = { id: req.headers['x-test-id'] ?? null, rol, sedeId: req.headers['x-test-sede'] ?? null, perfiles: ['administracion'] }
  },
}))

const { buildApp } = await import('../src/app.js')
const { etiquetaMetodoPago } = await import('../src/services/comprobantePdf.js')

const FECHA = '2032-03-08'
const PREFIJO = 'Prueba Pago'

describe.skipIf(!hayBaseDeDatosReal)('Nuevo pedido: con qué se paga', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let app: Awaited<ReturnType<typeof buildApp>>
  let cedros: string
  let contador = 0

  const limpiar = async () => {
    await pool.query(`delete from order_items where order_id in (select id from orders where fecha_entrega = $1)`, [FECHA])
    await pool.query(`delete from orders where fecha_entrega = $1`, [FECHA])
    await pool.query(`delete from avisos where tipo = 'orden_nueva' and cuerpo like $1`, [`${FECHA}%`])
    await pool.query(`delete from customers where nombre like $1`, [`${PREFIJO}%`])
  }

  beforeAll(async () => {
    app = await buildApp()
    cedros = (await pool.query(`select id from sedes where nombre = 'Cedros'`)).rows[0].id
    await limpiar()
  })
  afterEach(limpiar)
  afterAll(async () => {
    await limpiar()
    await app.close()
    await pool.end()
  })

  const pedir = (extra: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: '/api/dashboard/orders',
      headers: { 'x-test-rol': 'admin', 'x-test-id': '00000000-0000-0000-0000-00000000c1c1' },
      payload: {
        cliente: { nombre: `${PREFIJO} ${++contador}`, telefono: `9990${String(contador).padStart(5, '0')}` },
        tipoEntrega: 'tienda',
        fechaEntrega: FECHA,
        horario: '10am',
        items: [{ tipo: 'producto', productoId: 'cupcakes', cantidad: 1 }],
        sedeId: cedros,
        ...extra,
      },
    })
  const guardado = async (numero: string) => (await pool.query(`select estado, metodo_pago from orders where numero = $1`, [numero])).rows[0]

  it('sin marcar «Pagado» y sin medio: nace Confirmado y se guarda como «contraentrega»', async () => {
    const r = await pedir({ yaPago: false })
    expect(r.statusCode).toBe(201)
    expect(await guardado(r.json().numero)).toEqual({ estado: 'confirmed', metodo_pago: 'contraentrega' })
  })

  it('sin marcar «Pagado» pero con un medio que sobró en la pantalla: manda el servidor, queda «contraentrega»', async () => {
    const r = await pedir({ yaPago: false, metodoPago: 'yape' })
    expect(r.statusCode).toBe(201)
    expect(await guardado(r.json().numero)).toEqual({ estado: 'confirmed', metodo_pago: 'contraentrega' })
  })

  it.each(['yape', 'plin', 'transferencia', 'tarjeta', 'efectivo'])('Pagado con %s: nace «paid» y guarda ese medio', async (metodoPago) => {
    const r = await pedir({ yaPago: true, metodoPago })
    expect(r.statusCode).toBe(201)
    expect(await guardado(r.json().numero)).toEqual({ estado: 'paid', metodo_pago: metodoPago })
  })

  it('Pagado sin decir con qué: se rechaza y no se guarda nada', async () => {
    const r = await pedir({ yaPago: true })
    expect(r.statusCode).toBe(400)
    expect((await pool.query(`select count(*)::int as n from orders where fecha_entrega = $1`, [FECHA])).rows[0].n).toBe(0)
  })

  it('Pagado con «contraentrega» se rechaza: es lo contrario de haber pagado', async () => {
    const r = await pedir({ yaPago: true, metodoPago: 'contraentrega' })
    expect(r.statusCode).toBe(400)
    expect((await pool.query(`select count(*)::int as n from orders where fecha_entrega = $1`, [FECHA])).rows[0].n).toBe(0)
  })

  it('un medio que no existe se rechaza', async () => {
    const r = await pedir({ yaPago: true, metodoPago: 'bitcoin' })
    expect(r.statusCode).toBe(400)
  })

  it('el comprobante del pedido pagado en efectivo se genera, y el medio sale con su nombre (no el código interno)', async () => {
    expect(etiquetaMetodoPago('efectivo')).toBe('Efectivo')
    expect(etiquetaMetodoPago('contraentrega')).toBe('Paga al recoger')
    expect(etiquetaMetodoPago('algo-nuevo')).toBe('algo-nuevo')
    const r = await pedir({ yaPago: true, metodoPago: 'efectivo' })
    const pdf = await app.inject({
      method: 'GET',
      url: `/api/dashboard/orders/${r.json().numero}/comprobante.pdf`,
      headers: { 'x-test-rol': 'admin', 'x-test-id': '00000000-0000-0000-0000-00000000c1c1' },
    })
    expect(pdf.statusCode).toBe(200)
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe('%PDF')
  })
})

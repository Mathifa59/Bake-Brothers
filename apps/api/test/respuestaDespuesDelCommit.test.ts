// POST /api/orders tiene que responder DESPUÉS del commit, nunca desde adentro de la transacción. Si responde antes, el
// cliente recibe «listo» (201) sin que el pedido esté guardado — y si el commit fallara, le dijimos que sí a algo que
// no existe. Se reproduce de forma determinística tocando solo el `commit` de pg (el resto es la ruta real contra
// Postgres real):
//   - commit LENTO: al volver el 201, el pedido ya tiene que estar visible desde OTRA conexión.
//   - commit que FALLA: la respuesta no puede ser 201 y no puede quedar nada guardado.
// Con el código anterior (reply.send dentro de withTenantTx) los dos tests fallan. Necesita Postgres con el esquema
// (DATABASE_URL real); sin eso se salta.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

const { buildApp } = await import('../src/app.js')

const TEL = '999000777'
const FECHA = '2031-03-04' // lejos: no choca con la capacidad ni con otros tests
const CUERPO = {
  cliente: { nombre: 'Prueba Commit', telefono: TEL },
  tipoEntrega: 'tienda',
  fechaEntrega: FECHA,
  horario: '4pm',
  metodoPago: 'yape',
  items: [{ productoId: 'chocoalfajor', cantidad: 1 }],
}

describe.skipIf(!hayBaseDeDatosReal)('POST /api/orders responde después del commit', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let app: Awaited<ReturnType<typeof buildApp>>
  const queryOriginal = pg.Client.prototype.query

  const pedidosDelCliente = async () =>
    (await pool.query(`select count(*)::int n from orders o join customers c on c.id = o.customer_id where right(regexp_replace(coalesce(c.telefono, ''), '\\D', '', 'g'), 9) = right(regexp_replace($1, '\\D', '', 'g'), 9)`, [TEL])).rows[0]
      .n as number

  const limpiar = async () => {
    await pool.query(`delete from order_items where order_id in (select o.id from orders o join customers c on c.id = o.customer_id where right(regexp_replace(coalesce(c.telefono, ''), '\\D', '', 'g'), 9) = right(regexp_replace($1, '\\D', '', 'g'), 9))`, [TEL])
    await pool.query(`delete from orders where customer_id in (select id from customers where right(regexp_replace(coalesce(telefono, ''), '\\D', '', 'g'), 9) = right(regexp_replace($1, '\\D', '', 'g'), 9))`, [TEL])
    await pool.query(`delete from customers where right(regexp_replace(coalesce(telefono, ''), '\\D', '', 'g'), 9) = right(regexp_replace($1, '\\D', '', 'g'), 9)`, [TEL])
  }

  /** Cambia solo la sentencia `commit` de las conexiones de pg; todo lo demás pasa tal cual. */
  const tocarCommit = (alCommit: () => Promise<void>) => {
    vi.spyOn(pg.Client.prototype, 'query').mockImplementation(function (this: pg.Client, ...args: unknown[]) {
      if (args[0] === 'commit') {
        return alCommit().then(() => (queryOriginal as (...a: unknown[]) => unknown).apply(this, args))
      }
      return (queryOriginal as (...a: unknown[]) => unknown).apply(this, args)
    } as never)
  }

  beforeAll(async () => {
    app = await buildApp()
    await limpiar()
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await limpiar()
  })
  afterAll(async () => {
    await app.close()
    await pool.end()
  })

  it('con un commit lento: al llegar el 201 el pedido ya está guardado y visible desde otra conexión', async () => {
    tocarCommit(() => new Promise((r) => setTimeout(r, 400)))
    const r = await app.inject({ method: 'POST', url: '/api/orders', payload: CUERPO })
    expect(r.statusCode).toBe(201)
    const numero = r.json().numero as string
    // Justo después de recibir el 201, sin esperar nada: tiene que estar.
    expect(await pedidosDelCliente()).toBe(1)
    expect((await pool.query(`select 1 from orders where numero = $1`, [numero])).rowCount).toBe(1)
  })

  it('si el commit falla: no responde 201 y no queda nada guardado', async () => {
    tocarCommit(() => Promise.reject(new Error('commit fallido (simulado)')))
    const r = await app.inject({ method: 'POST', url: '/api/orders', payload: CUERPO })
    expect(r.statusCode).toBe(500)
    expect(await pedidosDelCliente()).toBe(0)
  })

  it('el camino feliz sigue igual: 201 con el mismo cuerpo', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/orders', payload: CUERPO })
    expect(r.statusCode).toBe(201)
    expect(r.json()).toMatchObject({ estado: 'confirmed', items: [{ nombre: 'Chocoalfajor', cantidad: 1 }] })
    expect(await pedidosDelCliente()).toBe(1)
  })

  it('una validación que falla sigue devolviendo su código (producto inexistente → 400 PRODUCTO_NO_ENCONTRADO) y no deja nada', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { ...CUERPO, items: [{ productoId: 'no-existe-este-producto', cantidad: 1 }] },
    })
    expect(r.statusCode).toBe(400)
    expect(r.json()).toMatchObject({ error: 'PRODUCTO_NO_ENCONTRADO' })
    expect(await pedidosDelCliente()).toBe(0)
  })
})

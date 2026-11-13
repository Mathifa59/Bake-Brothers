// RLS de los pedidos SIN sede (migración 0035): los delivery del bot nacen sin sede porque ambas sedes
// despachan. Todo el personal los ve (con su cliente y sus líneas) y cualquiera puede tomarlos ("Me lo
// quedo"), pero SOLO eso: no cambiar su estado sin tomarlos, no asignarlos a otra sede, no quitarle la
// sede a uno que ya la tiene, ni tomar uno que ya tomó otra sede. Se prueba con el rol real
// `authenticated` y claims de JWT, igual que PostgREST, dentro de una transacción que se deshace.
//
// Necesita un rol que pueda hacer `set role authenticated` y escribir en auth.users (en local, el
// superusuario `postgres`; no se corre contra Supabase real). Si no puede, el archivo se salta.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

describe.skipIf(!hayBaseDeDatosReal)('RLS de pedidos sin sede (delivery de las dos sedes)', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let puede = false
  let tenantId: string

  const ADMIN = '22222222-0000-0000-0000-000000000001'
  const OP_A = '22222222-0000-0000-0000-000000000002'
  const OP_B = '22222222-0000-0000-0000-000000000003'

  beforeAll(async () => {
    client = await pool.connect()
    try {
      await client.query('begin')
      await client.query('set local role authenticated')
      await client.query('reset role')
      await client.query('rollback')
      puede = true
    } catch {
      await client.query('rollback').catch(() => {})
    }
    tenantId = (await client.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
  })
  afterAll(async () => {
    client.release()
    await pool.end()
  })

  /** 2 sedes, 3 usuarios del panel y 3 pedidos (de A, de B y sin sede), cada uno con su cliente y una línea. */
  async function sembrar() {
    const sedeA = (await client.query(`insert into sedes (nombre) values ('RLS Pedidos A') returning id`)).rows[0].id
    const sedeB = (await client.query(`insert into sedes (nombre) values ('RLS Pedidos B') returning id`)).rows[0].id
    for (const id of [ADMIN, OP_A, OP_B]) await client.query(`insert into auth.users (id) values ($1)`, [id])
    await client.query(
      `insert into usuarios_dashboard (id, rol, sede_id) values ($1, 'admin', null), ($2, 'operador', $4), ($3, 'operador', $5)`,
      [ADMIN, OP_A, OP_B, sedeA, sedeB]
    )
    const pedido = async (clave: string, sede: string | null) => {
      const cliente = (
        await client.query(`insert into customers (tenant_id, nombre, telefono) values ($1, $2, $3) returning id`, [
          tenantId,
          `Cliente ${clave}`,
          `+90000${clave.length}${clave.charCodeAt(0)}`,
        ])
      ).rows[0].id
      const orden = (
        await client.query(
          `insert into orders (tenant_id, numero, customer_id, canal, estado, tipo_entrega, sede_id, fecha_entrega,
                               horario_entrega, metodo_pago, subtotal, total)
           values ($1, $2, $3, 'whatsapp', 'confirmed', 'delivery', $4, current_date + 3, '4pm', 'yape', 10, 10) returning id`,
          [tenantId, `RLS-${clave}`, cliente, sede]
        )
      ).rows[0].id as string
      // order_items exige exactamente un tipo de línea (producto, catering o combo): se usa un producto real.
      await client.query(
        `insert into order_items (tenant_id, order_id, product_id, nombre_producto, precio_unitario, cantidad)
         values ($1, $2, (select id from products where tenant_id = $1 limit 1), $3, 10, 1)`,
        [tenantId, orden, `Producto ${clave}`]
      )
      return orden
    }
    return { sedeA, sedeB, pA: await pedido('A', sedeA), pB: await pedido('B', sedeB), pSin: await pedido('SIN', null) }
  }

  async function como<T>(uid: string, fn: () => Promise<T>): Promise<T> {
    await client.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [
      JSON.stringify({ sub: uid, role: 'authenticated' }),
      uid,
    ])
    await client.query('set local role authenticated')
    try {
      return await fn()
    } finally {
      await client.query('reset role')
    }
  }

  /** Un intento de UPDATE: cuántas filas tocó, o el error que lanzó la RLS (en un savepoint para no abortar la transacción). */
  async function intentar(uid: string, sql: string, params: unknown[]): Promise<{ filas: number } | { error: string }> {
    return como(uid, async () => {
      await client.query('savepoint intento')
      try {
        const r = await client.query(sql, params)
        await client.query('release savepoint intento')
        return { filas: r.rowCount ?? 0 }
      } catch (e) {
        await client.query('rollback to savepoint intento')
        return { error: (e as { code?: string }).code ?? String(e) }
      }
    })
  }

  const numeros = async (tabla: 'orders' | 'customers' | 'order_items') => {
    const consulta =
      tabla === 'orders'
        ? `select numero as k from orders where numero like 'RLS-%' order by 1`
        : tabla === 'customers'
          ? `select nombre as k from customers where nombre like 'Cliente %' and telefono like '+90000%' order by 1`
          : `select nombre_producto as k from order_items where nombre_producto like 'Producto %' order by 1`
    return (await client.query(consulta)).rows.map((r) => r.k as string)
  }

  const enTransaccion = async (ctx: { skip: () => void }, fn: () => Promise<void>) => {
    if (!puede) return ctx.skip()
    await client.query('begin')
    try {
      await fn()
    } finally {
      await client.query('rollback')
    }
  }

  it('visibilidad: el administrador ve todo; cada operador ve lo de su sede Y los pedidos sin sede (con su cliente y sus líneas)', async (ctx) => {
    await enTransaccion(ctx, async () => {
      await sembrar()
      expect(await como(ADMIN, () => numeros('orders'))).toEqual(['RLS-A', 'RLS-B', 'RLS-SIN'])
      expect(await como(OP_A, () => numeros('orders'))).toEqual(['RLS-A', 'RLS-SIN'])
      expect(await como(OP_B, () => numeros('orders'))).toEqual(['RLS-B', 'RLS-SIN'])

      // El cliente del pedido sin sede se ve (si no, el pedido saldría sin nombre); el de la otra sede no.
      expect(await como(OP_A, () => numeros('customers'))).toEqual(['Cliente A', 'Cliente SIN'])
      expect(await como(OP_B, () => numeros('customers'))).toEqual(['Cliente B', 'Cliente SIN'])

      expect(await como(OP_A, () => numeros('order_items'))).toEqual(['Producto A', 'Producto SIN'])
      expect(await como(OP_B, () => numeros('order_items'))).toEqual(['Producto B', 'Producto SIN'])
    })
  })

  it('"Me lo quedo": un operador toma el pedido sin sede y queda en SU sede; desde entonces la otra sede ya no lo ve', async (ctx) => {
    await enTransaccion(ctx, async () => {
      const { sedeA, pSin } = await sembrar()
      const r = await intentar(OP_A, `update orders set sede_id = $2 where id = $1 and sede_id is null`, [pSin, sedeA])
      expect(r).toEqual({ filas: 1 })
      expect((await client.query(`select sede_id from orders where id = $1`, [pSin])).rows[0].sede_id).toBe(sedeA)
      expect(await como(OP_B, () => numeros('orders'))).toEqual(['RLS-B'])
      expect(await como(OP_A, () => numeros('orders'))).toEqual(['RLS-A', 'RLS-SIN'])
    })
  })

  it('dos personas lo toman a la vez: gana la primera; la segunda ya no lo encuentra sin sede y no pisa nada', async (ctx) => {
    await enTransaccion(ctx, async () => {
      const { sedeA, sedeB, pSin } = await sembrar()
      expect(await intentar(OP_A, `update orders set sede_id = $2 where id = $1 and sede_id is null`, [pSin, sedeA])).toEqual({ filas: 1 })
      expect(await intentar(OP_B, `update orders set sede_id = $2 where id = $1 and sede_id is null`, [pSin, sedeB])).toEqual({ filas: 0 })
      expect((await client.query(`select sede_id from orders where id = $1`, [pSin])).rows[0].sede_id).toBe(sedeA)
    })
  })

  it('un operador NO puede asignar el pedido a otra sede, ni cambiarle el estado sin tomarlo, ni tocar el de otra sede', async (ctx) => {
    await enTransaccion(ctx, async () => {
      const { sedeA, sedeB, pSin, pB } = await sembrar()

      // asignarlo a la sede de OTRO: lo frena el WITH CHECK
      const ajena = await intentar(OP_A, `update orders set sede_id = $2 where id = $1`, [pSin, sedeB])
      expect('error' in ajena || ajena.filas === 0).toBe(true)

      // cambiar el estado sin tomarlo: la fila seguiría sin sede → lo frena el WITH CHECK
      const sinTomar = await intentar(OP_A, `update orders set estado = 'in_production' where id = $1`, [pSin])
      expect('error' in sinTomar || sinTomar.filas === 0).toBe(true)

      // tomarlo Y cambiar el estado en el mismo movimiento sí vale (queda en su sede)
      expect(await intentar(OP_A, `update orders set sede_id = $2, estado = 'in_production' where id = $1 and sede_id is null`, [pSin, sedeA])).toEqual({ filas: 1 })

      // el pedido de la otra sede: ni siquiera lo ve, no lo puede tocar
      const delOtro = await intentar(OP_A, `update orders set estado = 'in_production' where id = $1`, [pB])
      expect(delOtro).toEqual({ filas: 0 })

      // y lo que quedó sin tomar sigue sin sede
      const { rows } = await client.query(`select sede_id from orders where id = $1`, [pB])
      expect(rows[0].sede_id).toBe(sedeB)
    })
  })

  it('un operador NO puede soltar un pedido que ya es de su sede (volverlo a sin sede) ni pasárselo a otra sede', async (ctx) => {
    await enTransaccion(ctx, async () => {
      const { sedeB, pA } = await sembrar()
      const soltar = await intentar(OP_A, `update orders set sede_id = null where id = $1`, [pA])
      expect('error' in soltar || soltar.filas === 0).toBe(true)
      const regalar = await intentar(OP_A, `update orders set sede_id = $2 where id = $1`, [pA, sedeB])
      expect('error' in regalar || regalar.filas === 0).toBe(true)
    })
  })

  it('métricas: un pedido sin sede NO se suma a ninguna sede (va aparte, como "sin asignar") y el total del administrador lo cuenta una sola vez', async (ctx) => {
    await enTransaccion(ctx, async () => {
      const hoy = (await client.query(`select (now() at time zone 'America/Lima')::date as d`)).rows[0].d
      const kpis = async (uid: string, sede: string | null) =>
        como(uid, async () => {
          const r = await client.query(`select pedidos, ingresos from metricas_kpis($1, $1, $2)`, [hoy, sede])
          return { pedidos: Number(r.rows[0].pedidos), ingresos: Number(r.rows[0].ingresos) }
        })
      const sinAsignar = async (uid: string) =>
        como(uid, async () => {
          const r = await client.query(`select pedidos, ingresos from metricas_sin_asignar($1, $1)`, [hoy])
          return { pedidos: Number(r.rows[0].pedidos), ingresos: Number(r.rows[0].ingresos) }
        })

      // Línea base ANTES de sembrar, con SQL directo (el admin de la prueba todavía no existe y las funciones de
      // métricas exigen un admin real): lo que ya hay hoy en la base local.
      const base = async (soloSinSede: boolean) => {
        const r = await client.query(
          `select count(*)::int as pedidos, coalesce(sum(total), 0)::numeric as ingresos from orders
            where creado_en >= ($1::date::timestamp at time zone 'America/Lima')
              and creado_en < (($1::date + 1)::timestamp at time zone 'America/Lima')
              and estado <> 'cancelled' and ($2::boolean is false or sede_id is null)`,
          [hoy, soloSinSede]
        )
        return { pedidos: Number(r.rows[0].pedidos), ingresos: Number(r.rows[0].ingresos) }
      }
      const antes = { total: await base(false), sin: await base(true) }
      const { sedeA, sedeB, pSin } = await sembrar()

      // Cada sede cuenta solo lo suyo: 1 pedido de 10, sin el pedido sin sede. (Las métricas son de dirección:
      // 0038 — las consulta el admin filtrando por sede; un empleado ya no las puede llamar.)
      expect(await kpis(ADMIN, sedeA)).toEqual({ pedidos: 1, ingresos: 10 })
      expect(await kpis(ADMIN, sedeB)).toEqual({ pedidos: 1, ingresos: 10 })

      // "Sin asignar" es aparte y es un solo pedido (no uno por sede).
      const sinA = await sinAsignar(ADMIN)
      expect(sinA).toEqual({ pedidos: antes.sin.pedidos + 1, ingresos: antes.sin.ingresos + 10 })

      // El total del negocio (admin, sin filtro) suma los 3 pedidos UNA vez: A + B + sin asignar.
      const total = await kpis(ADMIN, null)
      expect(total.pedidos - antes.total.pedidos).toBe(3)
      expect(total.ingresos - antes.total.ingresos).toBe(30)

      // Cuando una sede lo toma, sale de "sin asignar" y pasa a contar en esa sede (sigue siendo 1 vez en total).
      expect(await intentar(OP_A, `update orders set sede_id = $2 where id = $1 and sede_id is null`, [pSin, sedeA])).toEqual({ filas: 1 })
      expect(await kpis(ADMIN, sedeA)).toEqual({ pedidos: 2, ingresos: 20 })
      expect(await sinAsignar(ADMIN)).toEqual(antes.sin)
    })
  })

  it('el administrador puede asignar un pedido sin sede a cualquier sede', async (ctx) => {
    await enTransaccion(ctx, async () => {
      const { sedeB, pSin } = await sembrar()
      expect(await intentar(ADMIN, `update orders set sede_id = $2 where id = $1`, [pSin, sedeB])).toEqual({ filas: 1 })
      expect((await client.query(`select sede_id from orders where id = $1`, [pSin])).rows[0].sede_id).toBe(sedeB)
    })
  })
})

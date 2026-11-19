// Perfiles del equipo (migración 0054), probados con el rol REAL `authenticated` y los claims del JWT, igual que
// PostgREST, dentro de una transacción que se deshace (misma técnica que rlsRolEmpleado.test.ts). Una cuenta por perfil:
// cada una lee y escribe lo suyo y recibe un rechazo (o cero filas) en lo ajeno. Cubre:
//   - alcance por local: Venta digital y Órdenes ven TODOS los locales; Caja y Producción solo el suyo (y lo que aún no
//     tiene local); un perfil sin permiso no ve nada;
//   - clientes: Órdenes lee a todos los mayoristas; los contactos de la agenda sin pedidos solo los ve Administración;
//   - los avisos de la campana (y la regla que usa el push) llegan solo a quien corresponde;
//   - el trigger que deriva `rol` de los perfiles y las restricciones de la tabla.
// Necesita un rol que pueda hacer `set role authenticated` y escribir en auth.users (en local, `postgres`);
// si no puede, el archivo se salta.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal = !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

// Una cuenta por perfil. Todas las de «local» son de la sede A salvo que el nombre diga B.
const U = {
  admin: '55555555-0000-0000-0000-000000000001',
  cajaA: '55555555-0000-0000-0000-000000000002',
  cajaB: '55555555-0000-0000-0000-000000000003',
  venta: '55555555-0000-0000-0000-000000000004',
  ordenes: '55555555-0000-0000-0000-000000000005',
  produccionA: '55555555-0000-0000-0000-000000000006',
  ventaYOrdenes: '55555555-0000-0000-0000-000000000007',
  empleadoA: '55555555-0000-0000-0000-000000000008',
  sinFila: '55555555-0000-0000-0000-0000000000ff',
}

describe.skipIf(!hayBaseDeDatosReal)('perfiles del equipo: cada perfil lee lo suyo y recibe un rechazo en lo ajeno', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let puede = false
  let tenantId: string

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

  interface Mundo {
    sedeA: string
    sedeB: string
    pedido: { A: string; B: string; sin: string }
    conv: { A: string; B: string; sin: string }
    clientes: { delA: string; delB: string; delSin: string; mayorista: string; contacto: string }
    producto: string
  }

  async function sembrar(): Promise<Mundo> {
    const sedeA = (await client.query(`insert into sedes (nombre) values ('Perfiles Sede A') returning id`)).rows[0].id
    const sedeB = (await client.query(`insert into sedes (nombre) values ('Perfiles Sede B') returning id`)).rows[0].id
    for (const id of Object.values(U)) if (id !== U.sinFila) await client.query(`insert into auth.users (id) values ($1)`, [id])
    await client.query(`insert into auth.users (id) values ($1)`, [U.sinFila])
    const cuentas: [string, string[], string | null][] = [
      [U.admin, ['administracion'], null],
      [U.cajaA, ['caja'], sedeA],
      [U.cajaB, ['caja'], sedeB],
      [U.venta, ['venta_digital'], null],
      [U.ordenes, ['ordenes'], null],
      [U.produccionA, ['produccion'], sedeA],
      [U.ventaYOrdenes, ['venta_digital', 'ordenes'], null],
      [U.empleadoA, ['empleado_temporal'], sedeA],
    ]
    for (const [id, perfiles, sede] of cuentas) {
      await client.query(`insert into usuarios_dashboard (id, rol, sede_id, perfiles) values ($1, 'operador', $2, $3)`, [id, sede, perfiles])
    }
    const producto = (await client.query(`select id from products where tenant_id = $1 limit 1`, [tenantId])).rows[0].id

    const cliente = async (nombre: string, tel: string | null, extra = '') =>
      (
        await client.query(
          `insert into customers (tenant_id, nombre, telefono ${extra ? ', ' + extra.split('=')[0] : ''}) values ($1, $2, $3 ${extra ? ', ' + extra.split('=')[1] : ''}) returning id`,
          [tenantId, nombre, tel]
        )
      ).rows[0].id as string
    const clientes = {
      delA: await cliente('Cliente de A', '+51911000001'),
      delB: await cliente('Cliente de B', '+51911000002'),
      delSin: await cliente('Cliente delivery', '+51911000003'),
      mayorista: await cliente('Mayorista sin pedidos', null, 'es_mayorista=true'),
      contacto: await cliente('Contacto de la agenda', '+51911000005', `origen='contactos'`),
    }
    const pedido = async (clave: string, cliente: string, sede: string | null) => {
      const id = (
        await client.query(
          `insert into orders (tenant_id, numero, customer_id, canal, estado, tipo_entrega, sede_id, fecha_entrega, horario_entrega, metodo_pago, subtotal, total)
           values ($1, $2, $3, 'whatsapp', 'confirmed', 'tienda', $4, current_date + 3, '4pm', 'yape', 10, 10) returning id`,
          [tenantId, `PRF-${clave}`, cliente, sede]
        )
      ).rows[0].id as string
      await client.query(`insert into order_items (tenant_id, order_id, product_id, nombre_producto, cantidad, precio_unitario) values ($3, $1, $2, 'x', 1, 10)`, [id, producto, tenantId])
      return id
    }
    const conv = async (ext: string, sede: string | null) =>
      (
        await client.query(
          `insert into conversaciones (tenant_id, canal, external_id, estado, historial, sede_id) values ($1, 'whatsapp', $2, 'escalada', '[]'::jsonb, $3) returning id`,
          [tenantId, ext, sede]
        )
      ).rows[0].id as string
    return {
      sedeA,
      sedeB,
      producto,
      clientes,
      pedido: {
        A: await pedido('A', clientes.delA, sedeA),
        B: await pedido('B', clientes.delB, sedeB),
        sin: await pedido('SIN', clientes.delSin, null),
      },
      conv: { A: await conv('prf-a', sedeA), B: await conv('prf-b', sedeB), sin: await conv('prf-sin', null) },
    }
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

  async function probar(uid: string, sql: string, params: unknown[] = []): Promise<{ filas: Record<string, unknown>[]; n: number } | { error: string }> {
    return como(uid, async () => {
      await client.query('savepoint p')
      try {
        const r = await client.query(sql, params)
        await client.query('release savepoint p')
        return { filas: r.rows, n: r.rowCount ?? r.rows.length }
      } catch (e) {
        await client.query('rollback to savepoint p')
        return { error: (e as { code?: string }).code ?? String(e) }
      }
    })
  }

  /** Lista (ordenada) de una columna que la cuenta alcanza a leer. */
  async function ver(uid: string, sql: string, params: unknown[] = []): Promise<string[]> {
    const r = await probar(uid, sql, params)
    if ('error' in r) throw new Error(`consulta falló: ${r.error}`)
    return r.filas.map((f) => String(Object.values(f)[0])).sort()
  }

  const enTransaccion = async (ctx: { skip: () => void }, fn: (m: Mundo) => Promise<void>) => {
    if (!puede) return ctx.skip()
    await client.query('begin')
    try {
      await fn(await sembrar())
    } finally {
      await client.query('rollback')
    }
  }

  const PEDIDOS = `select numero from orders where numero like 'PRF-%'`
  const LINEAS = `select o.numero from order_items oi join orders o on o.id = oi.order_id where o.numero like 'PRF-%'`

  it('pedidos y sus líneas: Venta digital, Órdenes y Administración ven los dos locales y el delivery sin local; Caja y Producción, su local y lo que aún no tiene local', async (ctx) => {
    await enTransaccion(ctx, async () => {
      const todos = ['PRF-A', 'PRF-B', 'PRF-SIN']
      for (const consulta of [PEDIDOS, LINEAS]) {
        expect(await ver(U.admin, consulta)).toEqual(todos)
        expect(await ver(U.venta, consulta)).toEqual(todos)
        expect(await ver(U.ordenes, consulta)).toEqual(todos)
        expect(await ver(U.ventaYOrdenes, consulta)).toEqual(todos)
        expect(await ver(U.cajaA, consulta)).toEqual(['PRF-A', 'PRF-SIN'])
        expect(await ver(U.cajaB, consulta)).toEqual(['PRF-B', 'PRF-SIN'])
        expect(await ver(U.produccionA, consulta)).toEqual(['PRF-A', 'PRF-SIN'])
        expect(await ver(U.empleadoA, consulta)).toEqual(['PRF-A', 'PRF-SIN'])
        expect(await ver(U.sinFila, consulta)).toEqual([])
      }
    })
  })

  it('cambiar el estado de un pedido: Venta digital (cualquiera), Caja y Producción (solo los de su local); Órdenes no cambia nada', async (ctx) => {
    await enTransaccion(ctx, async (m) => {
      const cambiar = (id: string) => `update orders set estado = 'paid' where id = '${id}' returning numero`
      // Caja de A: el suyo sí; el del otro local y el que no tiene local, no (el sin local se «toma» antes)
      expect(await probar(U.cajaA, cambiar(m.pedido.A))).toMatchObject({ n: 1 })
      expect(await probar(U.cajaA, cambiar(m.pedido.B))).toMatchObject({ n: 0 })
      // (el sin local solo se puede «tomar»: cambiarle el estado sin asignarlo lo rechaza la base)
      expect(await probar(U.cajaA, cambiar(m.pedido.sin))).toEqual({ error: '42501' })
      expect(await probar(U.produccionA, `update orders set estado = 'in_production' where id = '${m.pedido.A}' returning numero`)).toMatchObject({ n: 1 })
      // Venta digital no tiene local: cambia los de los dos locales y el delivery sin local
      expect(await probar(U.venta, cambiar(m.pedido.B))).toMatchObject({ n: 1 })
      expect(await probar(U.venta, cambiar(m.pedido.sin))).toMatchObject({ n: 1 })
      // Órdenes registra y mira, pero no cambia estados
      expect(await probar(U.ordenes, cambiar(m.pedido.A))).toMatchObject({ n: 0 })
      expect(await probar(U.ordenes, cambiar(m.pedido.sin))).toEqual({ error: '42501' })
    })
  })

  it('clientes: cada perfil ve los de los pedidos que alcanza; Órdenes además ve a TODOS los mayoristas; los contactos de la agenda son solo de Administración', async (ctx) => {
    await enTransaccion(ctx, async () => {
      const CL = `select nombre from customers where nombre in ('Cliente de A','Cliente de B','Cliente delivery','Mayorista sin pedidos','Contacto de la agenda')`
      const conPedidos = ['Cliente de A', 'Cliente de B', 'Cliente delivery']
      expect(await ver(U.admin, CL)).toEqual([...conPedidos, 'Contacto de la agenda', 'Mayorista sin pedidos'].sort())
      expect(await ver(U.venta, CL)).toEqual(conPedidos.sort())
      expect(await ver(U.ordenes, CL)).toEqual([...conPedidos, 'Mayorista sin pedidos'].sort())
      expect(await ver(U.ventaYOrdenes, CL)).toEqual([...conPedidos, 'Mayorista sin pedidos'].sort())
      expect(await ver(U.cajaA, CL)).toEqual(['Cliente de A', 'Cliente delivery'])
      expect(await ver(U.produccionA, CL)).toEqual(['Cliente de A', 'Cliente delivery'])
      expect(await ver(U.sinFila, CL)).toEqual([])
    })
  })

  it('conversaciones: solo Administración y Venta digital (todos los locales); el transitorio, su local y las sin local; Caja, Órdenes y Producción no ven ninguna', async (ctx) => {
    await enTransaccion(ctx, async (m) => {
      const CV = `select external_id from conversaciones where external_id like 'prf-%'`
      expect(await ver(U.admin, CV)).toEqual(['prf-a', 'prf-b', 'prf-sin'])
      expect(await ver(U.venta, CV)).toEqual(['prf-a', 'prf-b', 'prf-sin'])
      expect(await ver(U.ventaYOrdenes, CV)).toEqual(['prf-a', 'prf-b', 'prf-sin'])
      expect(await ver(U.empleadoA, CV)).toEqual(['prf-a', 'prf-sin'])
      for (const sinAcceso of [U.cajaA, U.cajaB, U.ordenes, U.produccionA]) expect(await ver(sinAcceso, CV)).toEqual([])
      // escribir: Venta digital atiende la de cualquier local; Caja no puede ni tomarla
      const tomar = (id: string) => `update conversaciones set estado = 'atendida_por_operador' where id = '${id}' returning id`
      expect(await probar(U.venta, tomar(m.conv.B))).toMatchObject({ n: 1 })
      expect(await probar(U.cajaA, tomar(m.conv.A))).toMatchObject({ n: 0 })
      expect(await probar(U.produccionA, tomar(m.conv.sin))).toMatchObject({ n: 0 })
    })
  })

  it('respuestas rápidas: las leen Venta digital y Administración; Caja, Órdenes y Producción no', async (ctx) => {
    await enTransaccion(ctx, async () => {
      const RR = `select titulo from respuestas_rapidas`
      expect((await ver(U.venta, RR)).length).toBeGreaterThan(0)
      expect((await ver(U.admin, RR)).length).toBeGreaterThan(0)
      for (const sinAcceso of [U.cajaA, U.ordenes, U.produccionA]) expect(await ver(sinAcceso, RR)).toEqual([])
    })
  })

  it('stock: Caja lee y escribe el de su local; Venta digital, Órdenes y Producción no lo ven; Administración sí', async (ctx) => {
    await enTransaccion(ctx, async (m) => {
      await client.query(`insert into stock (sede_id, product_id, disponible) values ($1, $3, true), ($2, $3, true)`, [m.sedeA, m.sedeB, m.producto])
      const ST = `select sede_id from stock where product_id = '${m.producto}' and sede_id in ('${m.sedeA}','${m.sedeB}')`
      expect(await ver(U.cajaA, ST)).toEqual([m.sedeA])
      expect(await ver(U.cajaB, ST)).toEqual([m.sedeB])
      expect(await ver(U.admin, ST)).toEqual([m.sedeA, m.sedeB].sort())
      for (const sinAcceso of [U.venta, U.ordenes, U.produccionA]) expect(await ver(sinAcceso, ST)).toEqual([])
      expect(await probar(U.cajaA, `update stock set disponible = false where sede_id = '${m.sedeA}' and product_id = '${m.producto}' returning id`)).toMatchObject({ n: 1 })
      expect(await probar(U.cajaA, `update stock set disponible = false where sede_id = '${m.sedeB}' and product_id = '${m.producto}' returning id`)).toMatchObject({ n: 0 })
      expect(await probar(U.produccionA, `update stock set disponible = false where sede_id = '${m.sedeA}' returning id`)).toMatchObject({ n: 0 })
      // crear stock de otro local, o sin ser de Caja, se rechaza
      expect(await probar(U.cajaA, `insert into stock (sede_id, product_id, disponible) values ('${m.sedeB}', '${m.producto}', true)`)).toEqual({ error: '42501' })
    })
  })

  it('producción del día y plan de vitrina: Producción los ve en su local; Caja, Venta digital y Órdenes no', async (ctx) => {
    await enTransaccion(ctx, async (m) => {
      await client.query(`insert into plan_vitrina (sede_id, product_id, cantidad) values ($1, $3, 5), ($2, $3, 7)`, [m.sedeA, m.sedeB, m.producto])
      await client.query(`insert into produccion_dia (fecha, sede_id, product_id, cantidad_producida) values (current_date, $1, $3, 5), (current_date, $2, $3, 7)`, [m.sedeA, m.sedeB, m.producto])
      for (const [tabla] of [['plan_vitrina'], ['produccion_dia']]) {
        const Q = `select sede_id from ${tabla} where product_id = '${m.producto}' and sede_id in ('${m.sedeA}','${m.sedeB}')`
        expect(await ver(U.produccionA, Q)).toEqual([m.sedeA])
        expect(await ver(U.admin, Q)).toEqual([m.sedeA, m.sedeB].sort())
        for (const sinAcceso of [U.cajaA, U.venta, U.ordenes]) expect(await ver(sinAcceso, Q)).toEqual([])
      }
    })
  })

  it('lo de Administración sigue siendo solo de Administración: métricas, catálogo y códigos de Mifact', async (ctx) => {
    await enTransaccion(ctx, async (m) => {
      for (const uid of [U.cajaA, U.venta, U.ordenes, U.produccionA, U.ventaYOrdenes]) {
        expect(await probar(uid, `select * from metricas_kpis(current_date, current_date, null)`)).toEqual({ error: '42501' })
        expect(await probar(uid, `update products set nombre = nombre where id = '${m.producto}' returning id`)).toMatchObject({ n: 0 })
        expect(await probar(uid, `insert into respuestas_rapidas (titulo, texto) values ('x', 'y')`)).toMatchObject({ error: expect.any(String) })
      }
      expect('filas' in (await probar(U.admin, `select * from metricas_kpis(current_date, current_date, null)`))).toBe(true)
    })
  })

  it('nadie se da perfiles a sí mismo: la tabla de cuentas no se puede modificar desde el panel', async (ctx) => {
    await enTransaccion(ctx, async () => {
      for (const uid of [U.cajaA, U.venta, U.ordenes]) {
        expect(await probar(uid, `update usuarios_dashboard set perfiles = array['administracion'] where id = '${uid}'`)).toEqual({ error: '42501' })
        expect(await probar(uid, `update usuarios_dashboard set avisa_pagos = true where id = '${uid}'`)).toEqual({ error: '42501' })
      }
      // cada una lee SOLO su propia fila, con sus perfiles
      expect(await probar(U.venta, `select perfiles from usuarios_dashboard`)).toMatchObject({ n: 1 })
    })
  })

  // ——— avisos: la campana (RLS) y la regla del push (usuario_recibe_aviso) dan lo mismo ———
  it('avisos: cada tipo llega solo a quien corresponde (campana y push)', async (ctx) => {
    await enTransaccion(ctx, async (m) => {
      // Banderas de aviso: Caja A «sí órdenes», Producción A «sí órdenes», Caja B «no», Ventas+Órdenes «sí órdenes», Administración «sí órdenes y pagos»
      await client.query(`update usuarios_dashboard set avisa_ordenes = true where id in ($1, $2, $3, $4)`, [U.cajaA, U.produccionA, U.ventaYOrdenes, U.admin])
      await client.query(`update usuarios_dashboard set avisa_pagos = true where id = $1`, [U.admin])
      const nuevo = async (tipo: string, sede: string | null) =>
        (await client.query(`insert into avisos (tipo, titulo, cuerpo, sede_id) values ($1, 'PRF', 'x', $2) returning id`, [tipo, sede])).rows[0].id as string
      const mensajeA = await nuevo('mensaje_nuevo', m.sedeA)
      const mensajeB = await nuevo('esperando_persona', m.sedeB)
      const ordenA = await nuevo('orden_nueva', m.sedeA)
      const ordenSin = await nuevo('orden_nueva', null)
      const pedidoB = await nuevo('pedido_nuevo', m.sedeB)
      const pago = await nuevo('pago_reportado', m.sedeA)
      const verAvisos = (uid: string) => ver(uid, `select id from avisos where titulo = 'PRF'`)
      const set = (...ids: string[]) => ids.sort()

      // Administración con ambos avisos activos: todo
      expect(await verAvisos(U.admin)).toEqual(set(mensajeA, mensajeB, ordenA, ordenSin, pedidoB, pago))
      // Venta digital + Órdenes (sí órdenes, no pagos): mensajes de los dos locales y todas las órdenes; sin pagos
      expect(await verAvisos(U.ventaYOrdenes)).toEqual(set(mensajeA, mensajeB, ordenA, ordenSin, pedidoB))
      // Venta digital sola, sin bandera de órdenes: solo mensajes
      expect(await verAvisos(U.venta)).toEqual(set(mensajeA, mensajeB))
      // Caja A (sí órdenes, sin pagos): órdenes de su local y sin local; ningún mensaje
      expect(await verAvisos(U.cajaA)).toEqual(set(ordenA, ordenSin))
      // Caja B (sin bandera): nada
      expect(await verAvisos(U.cajaB)).toEqual([])
      // Producción A (sí órdenes): órdenes de su local y sin local
      expect(await verAvisos(U.produccionA)).toEqual(set(ordenA, ordenSin))
      // Órdenes sin bandera: nada
      expect(await verAvisos(U.ordenes)).toEqual([])
      // El transitorio ve los mensajes de su local y los sin local (como siempre)
      expect(await verAvisos(U.empleadoA)).toEqual(set(mensajeA))

      // La misma regla que usa el push (consultada como la API, con el id de cada cuenta)
      const recibe = async (uid: string, tipo: string, sede: string | null) =>
        (await client.query(`select usuario_recibe_aviso($1, $2, $3) as ok`, [uid, tipo, sede])).rows[0].ok as boolean
      expect(await recibe(U.admin, 'pago_reportado', m.sedeA)).toBe(true)
      expect(await recibe(U.cajaA, 'pago_reportado', m.sedeA)).toBe(false)
      await client.query(`update usuarios_dashboard set avisa_pagos = true where id = $1`, [U.cajaA])
      expect(await recibe(U.cajaA, 'pago_reportado', m.sedeA)).toBe(true)
      expect(await recibe(U.produccionA, 'pago_reportado', m.sedeA)).toBe(false)
      expect(await recibe(U.cajaB, 'orden_nueva', m.sedeA)).toBe(false)
      expect(await recibe(U.cajaA, 'orden_nueva', m.sedeB)).toBe(false)
      expect(await recibe(U.cajaA, 'orden_nueva', null)).toBe(true)
      expect(await recibe(U.cajaA, 'mensaje_nuevo', m.sedeA)).toBe(false)
      expect(await recibe(U.venta, 'esperando_persona', m.sedeB)).toBe(true)
      expect(await recibe(U.cajaA, 'tipo_inventado', null)).toBe(false)
    })
  })

  it('un panel no puede preguntar por los avisos de OTRA cuenta (la función con id solo la usa la API)', async (ctx) => {
    await enTransaccion(ctx, async () => {
      expect(await probar(U.venta, `select usuario_recibe_aviso('${U.admin}', 'pago_reportado', null)`)).toEqual({ error: '42501' })
      expect(await probar(U.venta, `select puedo_ver_aviso('mensaje_nuevo', null) as ok`)).toMatchObject({ filas: [{ ok: true }] })
    })
  })

  // ——— el trigger que deriva rol y perfiles, y las restricciones ———
  it('rol y perfiles siempre van de la mano', async (ctx) => {
    await enTransaccion(ctx, async () => {
      const leer = async (id: string) => (await client.query(`select rol, perfiles from usuarios_dashboard where id = $1`, [id])).rows[0]
      // código viejo: solo rol
      await client.query(`insert into auth.users (id) values ('55555555-0000-0000-0000-0000000000a1'), ('55555555-0000-0000-0000-0000000000a2'), ('55555555-0000-0000-0000-0000000000a3')`)
      await client.query(`insert into usuarios_dashboard (id, rol) values ('55555555-0000-0000-0000-0000000000a1', 'operador')`)
      expect(await leer('55555555-0000-0000-0000-0000000000a1')).toEqual({ rol: 'operador', perfiles: ['empleado_temporal'] })
      await client.query(`insert into usuarios_dashboard (id, rol) values ('55555555-0000-0000-0000-0000000000a2', 'admin')`)
      expect(await leer('55555555-0000-0000-0000-0000000000a2')).toEqual({ rol: 'admin', perfiles: ['administracion'] })
      // perfiles manda sobre el rol que se escriba
      await client.query(`insert into usuarios_dashboard (id, rol, perfiles) values ('55555555-0000-0000-0000-0000000000a3', 'admin', array['caja', 'ordenes', 'caja'])`)
      expect(await leer('55555555-0000-0000-0000-0000000000a3')).toEqual({ rol: 'operador', perfiles: ['caja', 'ordenes'] })
      await client.query(`update usuarios_dashboard set perfiles = array['administracion', 'caja'] where id = '55555555-0000-0000-0000-0000000000a3'`)
      expect(await leer('55555555-0000-0000-0000-0000000000a3')).toMatchObject({ rol: 'admin' })
      // un UPDATE de rol solo (código viejo) vuelve a derivar los perfiles
      await client.query(`update usuarios_dashboard set rol = 'operador' where id = '55555555-0000-0000-0000-0000000000a2'`)
      expect(await leer('55555555-0000-0000-0000-0000000000a2')).toEqual({ rol: 'operador', perfiles: ['empleado_temporal'] })
    })
  })

  it('un perfil inventado se rechaza', async (ctx) => {
    await enTransaccion(ctx, async () => {
      await client.query(`insert into auth.users (id) values ('55555555-0000-0000-0000-0000000000b1')`)
      await client.query('savepoint s')
      await expect(
        client.query(`insert into usuarios_dashboard (id, rol, perfiles) values ('55555555-0000-0000-0000-0000000000b1', 'operador', array['superusuario'])`)
      ).rejects.toMatchObject({ code: '23514' })
      await client.query('rollback to savepoint s')
    })
  })
})

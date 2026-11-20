// Equipo (migración 0056) en la base, con el rol REAL `authenticated` y los claims del JWT (igual que PostgREST), dentro
// de transacciones que se deshacen. Lo que se prueba:
//   - una cuenta DESACTIVADA pierde el acceso a los datos al instante, aunque su sesión (JWT) siga vigente: no lee
//     pedidos, stock, conversaciones ni su propia fila, no escribe el catálogo y las métricas le dicen que no;
//   - una cuenta activa del mismo perfil sigue viendo lo suyo (el control de que la prueba no es un falso negativo);
//   - las guardias: siempre un administrador activo, nadie se quita a sí mismo Administración, la fecha de desactivación;
//   - la auditoría escrita por la base (quién, qué, cuándo), que no se puede editar y que el panel no puede leer;
//   - el formato y la unicidad del usuario, y que el panel no puede escribir usuarios_dashboard.
// Necesita un rol que pueda hacer `set role authenticated` y escribir en auth.users (en local, `postgres`); si no
// puede, el archivo se salta.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal = !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

const U = {
  adminActivo: '66666666-0000-0000-0000-000000000001',
  adminInactivo: '66666666-0000-0000-0000-000000000002',
  cajaActiva: '66666666-0000-0000-0000-000000000003',
  cajaInactiva: '66666666-0000-0000-0000-000000000004',
  ventaInactiva: '66666666-0000-0000-0000-000000000005',
  ordenesInactiva: '66666666-0000-0000-0000-000000000006',
}

describe.skipIf(!hayBaseDeDatosReal)('Equipo en la base: cuentas desactivadas, guardias y auditoría', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL })
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

  async function sembrar() {
    const sede = (await client.query(`insert into sedes (nombre) values ('Equipo Sede') returning id`)).rows[0].id as string
    for (const id of Object.values(U)) await client.query(`insert into auth.users (id) values ($1)`, [id])
    const cuentas: [string, string[], string | null, boolean][] = [
      [U.adminActivo, ['administracion'], null, true],
      [U.adminInactivo, ['administracion'], null, false],
      [U.cajaActiva, ['caja'], sede, true],
      [U.cajaInactiva, ['caja'], sede, false],
      [U.ventaInactiva, ['venta_digital'], null, false],
      [U.ordenesInactiva, ['ordenes'], null, false],
    ]
    for (const [id, perfiles, sedeId, activo] of cuentas)
      await client.query(`insert into usuarios_dashboard (id, rol, sede_id, perfiles, activo) values ($1, $2, $3, $4, $5)`, [
        id,
        perfiles.includes('administracion') ? 'admin' : 'operador',
        sedeId,
        perfiles,
        activo,
      ])
    const producto = (await client.query(`select id from products where tenant_id = $1 limit 1`, [tenantId])).rows[0].id as string
    const cliente = (await client.query(`insert into customers (tenant_id, nombre, telefono) values ($1, 'Cliente Equipo', '+51922000001') returning id`, [tenantId])).rows[0].id
    const pedido = (
      await client.query(
        `insert into orders (tenant_id, numero, customer_id, canal, estado, tipo_entrega, sede_id, fecha_entrega, horario_entrega, metodo_pago, subtotal, total)
         values ($1, 'EQP-1', $2, 'whatsapp', 'confirmed', 'tienda', $3, current_date + 3, '4pm', 'yape', 10, 10) returning id`,
        [tenantId, cliente, sede]
      )
    ).rows[0].id
    await client.query(`insert into order_items (tenant_id, order_id, product_id, nombre_producto, cantidad, precio_unitario) values ($1, $2, $3, 'x', 1, 10)`, [tenantId, pedido, producto])
    await client.query(`insert into stock (sede_id, product_id, disponible, cantidad) values ($1, $2, true, 5) on conflict do nothing`, [sede, producto])
    await client.query(`insert into conversaciones (tenant_id, canal, external_id, estado, historial, sede_id) values ($1, 'whatsapp', 'eqp-1', 'escalada', '[]'::jsonb, null)`, [tenantId])
    await client.query(`insert into avisos (tipo, titulo, cuerpo, sede_id) values ('mensaje_nuevo', 'Aviso de prueba', 'x', null)`)
    return { sede, producto }
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

  async function probar(uid: string, sql: string, params: unknown[] = []): Promise<{ n: number } | { error: string }> {
    return como(uid, async () => {
      await client.query('savepoint p')
      try {
        const r = await client.query(sql, params)
        await client.query('release savepoint p')
        return { n: r.rowCount ?? r.rows.length }
      } catch (e) {
        await client.query('rollback to savepoint p')
        return { error: (e as { code?: string }).code ?? String(e) }
      }
    })
  }

  const enTransaccion = async (ctx: { skip: () => void }, fn: (m: Awaited<ReturnType<typeof sembrar>>) => Promise<void>) => {
    if (!puede) return ctx.skip()
    await client.query('begin')
    try {
      await fn(await sembrar())
    } finally {
      await client.query('rollback')
    }
  }

  const sinError = (r: { n: number } | { error: string }) => !('error' in r)

  it('una cuenta activa ve lo suyo y la desactivada no ve NADA (pedidos, líneas, stock, conversaciones, su propia fila)', async (ctx) => {
    await enTransaccion(ctx, async () => {
      const consultas = [
        `select numero from orders where numero = 'EQP-1'`,
        `select 1 from order_items oi join orders o on o.id = oi.order_id where o.numero = 'EQP-1'`,
        `select 1 from stock s join sedes x on x.id = s.sede_id where x.nombre = 'Equipo Sede'`,
        `select 1 from customers where nombre = 'Cliente Equipo'`,
      ]
      // Control: la caja activa SÍ ve su local.
      expect(await probar(U.cajaActiva, consultas[0])).toEqual({ n: 1 })
      expect(await probar(U.cajaActiva, consultas[1])).toEqual({ n: 1 })
      expect(await probar(U.cajaActiva, consultas[2])).toEqual({ n: 1 })
      expect(await probar(U.cajaActiva, `select 1 from usuarios_dashboard where id = '${U.cajaActiva}'`)).toEqual({ n: 1 })
      // La misma cuenta, desactivada, no ve nada.
      for (const sql of consultas) expect(await probar(U.cajaInactiva, sql), sql).toEqual({ n: 0 })
      expect(await probar(U.cajaInactiva, `select 1 from usuarios_dashboard where id = '${U.cajaInactiva}'`)).toEqual({ n: 0 })
      // Un administrador desactivado tampoco ve nada de lo que sí ve el activo.
      for (const sql of consultas) {
        expect(await probar(U.adminActivo, sql), sql).toEqual({ n: 1 })
        expect(await probar(U.adminInactivo, sql), sql).toEqual({ n: 0 })
      }
      // Ventas e Órdenes desactivadas: conversaciones, clientes y mayoristas cerrados.
      expect(await probar(U.ventaInactiva, `select 1 from conversaciones where external_id = 'eqp-1'`)).toEqual({ n: 0 })
      expect(await probar(U.adminActivo, `select 1 from conversaciones where external_id = 'eqp-1'`)).toEqual({ n: 1 })
      expect(await probar(U.ordenesInactiva, `select 1 from orders where numero = 'EQP-1'`)).toEqual({ n: 0 })
    })
  })

  it('un administrador desactivado no puede escribir el catálogo ni ver las métricas; el activo sí', async (ctx) => {
    await enTransaccion(ctx, async (m) => {
      const escribir = `update products set descripcion = descripcion where id = '${m.producto}'`
      expect(await probar(U.adminActivo, escribir)).toEqual({ n: 1 })
      expect(await probar(U.adminInactivo, escribir)).toEqual({ n: 0 })
      const metricas = `select * from metricas_kpis(current_date - 1, current_date)`
      expect(sinError(await probar(U.adminActivo, metricas))).toBe(true)
      expect(await probar(U.adminInactivo, metricas)).toEqual({ error: '42501' })
    })
  })

  it('los avisos (campana y push) no llegan a una cuenta desactivada', async (ctx) => {
    await enTransaccion(ctx, async () => {
      const recibe = async (uid: string, tipo = 'mensaje_nuevo') => (await client.query(`select usuario_recibe_aviso($1, $2, null) as r`, [uid, tipo])).rows[0].r as boolean
      expect(await recibe(U.adminActivo)).toBe(true)
      expect(await recibe(U.adminInactivo)).toBe(false)
      expect(await recibe(U.ventaInactiva)).toBe(false)
      // y la campana (puedo_ver_aviso) tampoco
      expect(await probar(U.adminInactivo, `select 1 from avisos`)).toEqual({ n: 0 })
    })
  })

  describe('guardias', () => {
    it('siempre queda un administrador activo (la base lo impide aunque se intente por SQL)', async (ctx) => {
      await enTransaccion(ctx, async () => {
        await client.query(`update usuarios_dashboard set activo = false where rol = 'admin' and id <> $1`, [U.adminActivo])
        await client.query('savepoint g')
        await expect(client.query(`update usuarios_dashboard set activo = false where id = $1`, [U.adminActivo])).rejects.toMatchObject({ hint: 'ULTIMO_ADMINISTRADOR' })
        await client.query('rollback to savepoint g')
        await expect(client.query(`update usuarios_dashboard set perfiles = array['caja'] where id = $1`, [U.adminActivo])).rejects.toMatchObject({ hint: 'ULTIMO_ADMINISTRADOR' })
        await client.query('rollback to savepoint g')
        await expect(client.query(`delete from usuarios_dashboard where id = $1`, [U.adminActivo])).rejects.toMatchObject({ hint: 'ULTIMO_ADMINISTRADOR' })
      })
    })

    it('quien hace el cambio no puede quitarse Administración ni desactivarse (aunque queden otros administradores)', async (ctx) => {
      await enTransaccion(ctx, async () => {
        await client.query(`select set_config('app.actor_id', $1, true)`, [U.adminActivo])
        await client.query(`update usuarios_dashboard set activo = true where id = $1`, [U.adminInactivo]) // ahora hay otro administrador activo
        await client.query('savepoint g')
        await expect(client.query(`update usuarios_dashboard set activo = false where id = $1`, [U.adminActivo])).rejects.toMatchObject({ hint: 'NO_PUEDES_QUITARTE_ADMINISTRACION' })
        await client.query('rollback to savepoint g')
        await expect(client.query(`update usuarios_dashboard set perfiles = array['caja'] where id = $1`, [U.adminActivo])).rejects.toMatchObject({ hint: 'NO_PUEDES_QUITARTE_ADMINISTRACION' })
        await client.query('rollback to savepoint g')
        // A otro administrador sí se le puede quitar.
        await client.query(`update usuarios_dashboard set activo = false where id = $1`, [U.adminInactivo])
      })
    })

    it('la fecha de desactivación la fija la base, y se limpia al reactivar', async (ctx) => {
      await enTransaccion(ctx, async () => {
        await client.query(`update usuarios_dashboard set activo = true where id = $1`, [U.cajaInactiva])
        expect((await client.query(`select desactivado_en from usuarios_dashboard where id = $1`, [U.cajaInactiva])).rows[0].desactivado_en).toBeNull()
        await client.query(`update usuarios_dashboard set activo = false where id = $1`, [U.cajaInactiva])
        expect((await client.query(`select desactivado_en from usuarios_dashboard where id = $1`, [U.cajaInactiva])).rows[0].desactivado_en).not.toBeNull()
      })
    })

    it('el formato y la unicidad del usuario los sostiene la base', async (ctx) => {
      await enTransaccion(ctx, async () => {
        await client.query(`update usuarios_dashboard set usuario = 'caja.cedros' where id = $1`, [U.cajaActiva])
        await client.query('savepoint g')
        await expect(client.query(`update usuarios_dashboard set usuario = 'caja.cedros' where id = $1`, [U.cajaInactiva])).rejects.toMatchObject({ code: '23505' })
        await client.query('rollback to savepoint g')
        for (const malo of ['Caja', 'ab', 'caja cedros', 'x@y.pe', 'cája']) {
          await expect(client.query(`update usuarios_dashboard set usuario = $2 where id = $1`, [U.cajaInactiva, malo]), malo).rejects.toMatchObject({ code: '23514' })
          await client.query('rollback to savepoint g')
        }
      })
    })
  })

  describe('auditoría', () => {
    it('la escribe la base: quién (el actor que fijó la API), qué cambió (antes y después) y cuándo', async (ctx) => {
      await enTransaccion(ctx, async () => {
        await client.query(`update usuarios_dashboard set nombre = 'Admin Activo' where id = $1`, [U.adminActivo])
        await client.query(`select set_config('app.actor_id', $1, true)`, [U.adminActivo])
        await client.query(`update usuarios_dashboard set avisa_ordenes = true, es_encargado = true where id = $1`, [U.cajaActiva])
        await client.query(`update usuarios_dashboard set activo = false where id = $1`, [U.cajaActiva])
        await client.query(`update usuarios_dashboard set activo = true where id = $1`, [U.cajaActiva])
        const { rows } = await client.query(`select accion, actor_id, actor_nombre, detalle, cuando from equipo_auditoria where objetivo_id = $1 order by id`, [U.cajaActiva])
        expect(rows.map((r) => r.accion)).toEqual(['crear', 'editar', 'desactivar', 'reactivar'])
        const editar = rows[1]
        expect(editar.actor_id).toBe(U.adminActivo)
        expect(editar.actor_nombre).toBe('Admin Activo')
        expect(editar.detalle).toEqual({ avisa_ordenes: { antes: false, despues: true }, es_encargado: { antes: false, despues: true } })
        expect(new Date(editar.cuando).getTime()).toBeGreaterThan(Date.now() - 60_000)
      })
    })

    it('un cambio hecho directo en la base (sin actor) también queda, con actor vacío', async (ctx) => {
      await enTransaccion(ctx, async () => {
        await client.query(`update usuarios_dashboard set avisa_pagos = true where id = $1`, [U.cajaActiva])
        const { rows } = await client.query(`select accion, actor_id from equipo_auditoria where objetivo_id = $1 and accion = 'editar'`, [U.cajaActiva])
        expect(rows).toEqual([{ accion: 'editar', actor_id: null }])
      })
    })

    it('no se puede editar ni borrar; y el panel (authenticated) no puede ni leerla', async (ctx) => {
      await enTransaccion(ctx, async () => {
        await client.query('savepoint g')
        await expect(client.query(`update equipo_auditoria set accion = 'crear' where objetivo_id = $1`, [U.cajaActiva])).rejects.toThrow(/auditor/i)
        await client.query('rollback to savepoint g')
        await expect(client.query(`delete from equipo_auditoria where objetivo_id = $1`, [U.cajaActiva])).rejects.toThrow(/auditor/i)
        await client.query('rollback to savepoint g')
        expect(await probar(U.adminActivo, `select 1 from equipo_auditoria`)).toEqual({ error: '42501' })
      })
    })
  })

  it('el panel no puede escribir usuarios_dashboard: ni su propio perfil, ni uno nuevo, ni borrar', async (ctx) => {
    await enTransaccion(ctx, async () => {
      for (const uid of [U.adminActivo, U.cajaActiva]) {
        expect(await probar(uid, `update usuarios_dashboard set perfiles = array['administracion'], rol = 'admin' where id = '${uid}'`)).toEqual({ error: '42501' })
        expect(await probar(uid, `update usuarios_dashboard set es_encargado = true where id = '${uid}'`)).toEqual({ error: '42501' })
        expect(await probar(uid, `delete from usuarios_dashboard where id = '${uid}'`)).toEqual({ error: '42501' })
      }
    })
  })
})

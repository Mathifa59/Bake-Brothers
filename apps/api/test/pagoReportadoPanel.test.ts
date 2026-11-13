// Confirmar o rechazar un pago reportado desde el panel (0036), con el rol real `authenticated` y claims de JWT
// como PostgREST, dentro de una transacción que se deshace. Lo que debe garantizar la BASE (no solo el
// navegador): quién revisó lo pone la sesión real, no se puede confirmar un pago que nadie reportó, una revisión
// no se pisa con otra, y un operador solo revisa los pedidos de su sede (o los que ya tomó si eran sin sede).
//
// Necesita un rol que pueda hacer `set role authenticated` y escribir en auth.users (en local, el superusuario
// `postgres`; no corre contra Supabase real). Si no puede, el archivo se salta.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

describe.skipIf(!hayBaseDeDatosReal)('pago reportado — confirmar/rechazar desde el panel (roles reales)', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let puede = false
  let tenantId: string

  const OP_A = '33333333-0000-0000-0000-000000000002'
  const OP_B = '33333333-0000-0000-0000-000000000003'
  const REPORTE = JSON.stringify({ monto: 25.9, moneda: 'PEN', fecha: '2026-10-30', numeroOperacion: '123456789', medio: 'yape', coincideTotal: true, requiereRevision: false, motivos: [] })

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
    const sedeA = (await client.query(`insert into sedes (nombre) values ('RLS Pago A') returning id`)).rows[0].id
    const sedeB = (await client.query(`insert into sedes (nombre) values ('RLS Pago B') returning id`)).rows[0].id
    for (const id of [OP_A, OP_B]) await client.query(`insert into auth.users (id) values ($1)`, [id])
    await client.query(`insert into usuarios_dashboard (id, rol, sede_id) values ($1, 'operador', $3), ($2, 'operador', $4)`, [OP_A, OP_B, sedeA, sedeB])
    const cliente = (await client.query(`insert into customers (tenant_id, nombre, telefono) values ($1, 'Cliente Pago', '+51900007770') returning id`, [tenantId])).rows[0].id
    const pedido = async (numero: string, sede: string | null, conReporte: boolean) =>
      (
        await client.query(
          `insert into orders (tenant_id, numero, customer_id, canal, estado, tipo_entrega, sede_id, fecha_entrega, horario_entrega,
                               metodo_pago, subtotal, total, pago_reportado, pago_reportado_en)
           values ($1, $2, $3, 'whatsapp', 'payment_pending', 'tienda', $4, current_date + 2, '4pm', 'yape', 25.9, 25.9, $5::jsonb, ${conReporte ? 'now()' : 'null'})
           returning id`,
          [tenantId, numero, cliente, sede, conReporte ? REPORTE : null]
        )
      ).rows[0].id as string
    return { sedeA, sedeB, conReporteA: await pedido('PAGO-A', sedeA, true), sinReporteA: await pedido('PAGO-NR', sedeA, false), deB: await pedido('PAGO-B', sedeB, true), sinSede: await pedido('PAGO-SIN', null, true) }
  }

  async function intentar(uid: string, sql: string, params: unknown[]): Promise<{ filas: number } | { error: string }> {
    await client.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' }), uid])
    await client.query('set local role authenticated')
    await client.query('savepoint intento')
    try {
      const r = await client.query(sql, params)
      await client.query('release savepoint intento')
      return { filas: r.rowCount ?? 0 }
    } catch (e) {
      await client.query('rollback to savepoint intento')
      return { error: (e as { code?: string }).code ?? String(e) }
    } finally {
      await client.query('reset role')
    }
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

  // El mismo UPDATE que manda el panel (apps/admin hooks/usePedidos.js → resolverPago).
  const CONFIRMAR = `update orders set estado = 'paid', pago_resultado = 'confirmado'
                     where id = $1 and estado = 'payment_pending' and pago_reportado is not null and pago_resultado is null`
  const RECHAZAR = `update orders set pago_resultado = 'rechazado'
                    where id = $1 and estado = 'payment_pending' and pago_reportado is not null and pago_resultado is null`
  const leer = async (id: string) =>
    (await client.query(`select estado, pago_resultado, pago_revisado_por, pago_revisado_en from orders where id = $1`, [id])).rows[0]

  it('confirmar: el pedido pasa a pagado y la base registra QUIÉN lo revisó con la sesión real', async (ctx) => {
    await enTransaccion(ctx, async () => {
      const { conReporteA } = await sembrar()
      expect(await intentar(OP_A, CONFIRMAR, [conReporteA])).toEqual({ filas: 1 })
      const p = await leer(conReporteA)
      expect(p.estado).toBe('paid')
      expect(p.pago_resultado).toBe('confirmado')
      expect(p.pago_revisado_por).toBe(OP_A)
      expect(p.pago_revisado_en).not.toBeNull()
    })
  })

  it('rechazar: el pedido sigue pendiente de pago, queda el resultado y quién lo rechazó', async (ctx) => {
    await enTransaccion(ctx, async () => {
      const { conReporteA } = await sembrar()
      expect(await intentar(OP_A, RECHAZAR, [conReporteA])).toEqual({ filas: 1 })
      const p = await leer(conReporteA)
      expect(p.estado).toBe('payment_pending')
      expect(p.pago_resultado).toBe('rechazado')
      expect(p.pago_revisado_por).toBe(OP_A)
    })
  })

  it('una revisión no se pisa con otra: si ya se revisó, el segundo toque no cambia nada', async (ctx) => {
    await enTransaccion(ctx, async () => {
      const { conReporteA } = await sembrar()
      expect(await intentar(OP_A, RECHAZAR, [conReporteA])).toEqual({ filas: 1 })
      expect(await intentar(OP_A, CONFIRMAR, [conReporteA])).toEqual({ filas: 0 })
      expect((await leer(conReporteA)).pago_resultado).toBe('rechazado')
    })
  })

  it('nadie puede confirmar ni rechazar un pago que no se reportó (lo frena la base, no solo el botón)', async (ctx) => {
    await enTransaccion(ctx, async () => {
      const { sinReporteA } = await sembrar()
      // Con las condiciones del panel no toca ninguna fila…
      expect(await intentar(OP_A, CONFIRMAR, [sinReporteA])).toEqual({ filas: 0 })
      // …y aunque alguien mande el UPDATE a mano sin esas condiciones, el CHECK lo rechaza.
      const forzado = await intentar(OP_A, `update orders set pago_resultado = 'confirmado' where id = $1`, [sinReporteA])
      expect('error' in forzado && forzado.error).toBe('23514')
      expect((await leer(sinReporteA)).pago_resultado).toBeNull()
    })
  })

  it('un resultado inventado no pasa el CHECK', async (ctx) => {
    await enTransaccion(ctx, async () => {
      const { conReporteA } = await sembrar()
      const r = await intentar(OP_A, `update orders set pago_resultado = 'quizas' where id = $1`, [conReporteA])
      expect('error' in r && r.error).toBe('23514')
    })
  })

  it('un operador no puede revisar el pago de un pedido de OTRA sede', async (ctx) => {
    await enTransaccion(ctx, async () => {
      const { deB } = await sembrar()
      expect(await intentar(OP_A, CONFIRMAR, [deB])).toEqual({ filas: 0 })
      expect((await leer(deB)).pago_resultado).toBeNull()
    })
  })

  it('un delivery sin sede: hay que tomarlo ("Me lo quedo") antes de poder confirmar su pago', async (ctx) => {
    await enTransaccion(ctx, async () => {
      const { sinSede, sedeA } = await sembrar()
      // sin tomarlo, la RLS (0035) no deja confirmar: la fila seguiría sin sede
      const antes = await intentar(OP_A, CONFIRMAR, [sinSede])
      expect('error' in antes || antes.filas === 0).toBe(true)
      expect((await leer(sinSede)).estado).toBe('payment_pending')
      // tomarlo y confirmar
      expect(await intentar(OP_A, `update orders set sede_id = $2 where id = $1 and sede_id is null`, [sinSede, sedeA])).toEqual({ filas: 1 })
      expect(await intentar(OP_A, CONFIRMAR, [sinSede])).toEqual({ filas: 1 })
      expect((await leer(sinSede)).pago_revisado_por).toBe(OP_A)
    })
  })
})

// Corre contra el catálogo real (Postgres) y un JWT real de un operador de
// prueba (Supabase Auth) — no simula la verificación, la ejerce de verdad
// contra el JWKS público. Se salta si falta DATABASE_URL o TEST_JWT_OPERADOR.
// Para correrlo de verdad:
//   DATABASE_URL=... TEST_JWT_OPERADOR=... pnpm --filter @bakebrothers/api test -- dashboardOrders
//
// El toggle de rol operador/admin de usuarios_dashboard NO lo hace este
// archivo: esa tabla solo tiene política RLS de SELECT para app_api (a
// propósito, ver 0021/0022 — app_api nunca debe escribir ahí), así que un
// UPDATE contra ella desde el mismo rol de test queda filtrado por RLS a 0
// filas, en silencio. El describe de "admin" (abajo) asume que el rol de
// usuarios_dashboard ya está en 'admin' ANTES de correr — se cambia a mano
// (rol de confianza, fuera de este archivo) entre las dos corridas:
//   1) rol='operador' en la base → vitest run (sin TEST_ROL_ADMIN)
//   2) rol='admin' en la base → TEST_ROL_ADMIN=1 vitest run
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { buildApp } from '../src/app.js'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER
const JWT_OPERADOR = process.env.TEST_JWT_OPERADOR
const ROL_ES_ADMIN = process.env.TEST_ROL_ADMIN === '1'

const TIMEOUT_MS = 15_000

// UUIDs reales del catálogo (ver CLAUDE.md / migraciones) — no inventados.
const SEDE_CEDROS = '2624c21c-0248-4a88-b234-7fc88005104c'
const SEDE_SANTA_MARINA = '0638b47f-854b-47d7-aed1-56b0115c5d31'

const fechaFuturaNoDomingo = (diasMinimos: number): string => {
  let d = new Date()
  d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diasMinimos)
  while (d.getDay() === 0) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe.skipIf(!hayBaseDeDatosReal || !JWT_OPERADOR || ROL_ES_ADMIN)('POST /api/dashboard/orders (real, JWT real, rol operador)', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let tenantId: string
  let comboTortipackId: string
  let comboWhatsappExclusivoId: string
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeAll(async () => {
    client = await pool.connect()
    const { rows } = await client.query(`select id from tenants where slug = 'bake-brothers'`)
    tenantId = rows[0].id

    const combo = await client.query(`select id from combos where nombre = 'Tortipack'`)
    comboTortipackId = combo.rows[0].id

    // Ningún combo real tiene canal_permitido='whatsapp' hoy (revisado antes
    // de escribir este test) — se crea uno temporal solo para probar el
    // rechazo, y se borra al terminar.
    const comboTemp = await client.query(
      `insert into combos (nombre, precio_normal, precio_promo, canal_permitido, permite_cambios, condicion_texto, activo)
       values ('Combo test whatsapp-exclusivo', 10, 8, 'whatsapp', false, 'solo para test', true)
       returning id`
    )
    comboWhatsappExclusivoId = comboTemp.rows[0].id

    app = await buildApp()
  })

  afterAll(async () => {
    await client.query(`delete from combos where id = $1`, [comboWhatsappExclusivoId])
    client.release()
    await pool.end()
  })

  const limpiarPorTelefono = async (telefono: string) => {
    await client.query(`delete from orders where customer_id in (select id from customers where telefono = $1)`, [
      telefono,
    ])
    await client.query(`delete from customers where telefono = $1`, [telefono])
  }

  it('sin Authorization → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/dashboard/orders', payload: {} })
    expect(res.statusCode).toBe(401)
  })

  it('con un JWT inválido → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/dashboard/orders',
      headers: { authorization: 'Bearer esto-no-es-un-jwt-real' },
      payload: {},
    })
    expect(res.statusCode).toBe(401)
  })

  it(
    'operador: pedido de tienda (producto + combo) — sede_id se fuerza a la del operador aunque mande otra, estado confirmed',
    async () => {
      const telefono = '999444001'
      await limpiarPorTelefono(telefono)
      const fecha = fechaFuturaNoDomingo(10)

      try {
        const res = await app.inject({
          method: 'POST',
          url: '/api/dashboard/orders',
          headers: { authorization: `Bearer ${JWT_OPERADOR}` },
          payload: {
            cliente: { nombre: 'Cliente Mostrador', telefono },
            tipoEntrega: 'tienda',
            fechaEntrega: fecha,
            horario: '4pm',
            items: [
              { tipo: 'producto', productoId: 'torta-carrot-cake', tamano: 'Individual', cantidad: 1 },
              { tipo: 'combo', comboId: comboTortipackId, cantidad: 1 },
            ],
            metodoPago: 'yape',
            yaPago: false,
            // Intento deliberado de mandar OTRA sede — el server la tiene
            // que ignorar porque el rol es operador.
            sedeId: SEDE_SANTA_MARINA,
          },
        })

        expect(res.statusCode).toBe(201)
        const body = res.json()
        expect(body.estado).toBe('confirmed')
        expect(body.total).toBe(9.9 + 16.0)

        const { rows } = await client.query(
          `select o.sede_id, o.canal, o.estado, c.telefono, count(oi.id)::int as n_items
           from orders o join customers c on c.id=o.customer_id join order_items oi on oi.order_id=o.id
           where o.numero = $1 group by o.id, c.id`,
          [body.numero]
        )
        expect(rows[0].sede_id).toBe(SEDE_CEDROS) // NO Santa Marina — forzado server-side
        expect(rows[0].canal).toBe('presencial')
        expect(rows[0].n_items).toBe(2)
      } finally {
        await limpiarPorTelefono(telefono)
      }
    },
    TIMEOUT_MS
  )

  it(
    'operador: pedido de catering verde, yaPago=true → estado paid',
    async () => {
      const telefono = '999444002'
      await limpiarPorTelefono(telefono)
      const fecha = fechaFuturaNoDomingo(20)

      try {
        const res = await app.inject({
          method: 'POST',
          url: '/api/dashboard/orders',
          headers: { authorization: `Bearer ${JWT_OPERADOR}` },
          payload: {
            cliente: { nombre: 'Cliente Catering', telefono },
            tipoEntrega: 'tienda',
            fechaEntrega: fecha,
            horario: '10am',
            items: [{ tipo: 'catering', busquedaItem: 'tequeños', cantidad: 30 }],
            metodoPago: 'transferencia',
            yaPago: true,
          },
        })

        expect(res.statusCode).toBe(201)
        const body = res.json()
        expect(body.estado).toBe('paid')

        const { rows } = await client.query(
          `select oi.catering_item_id, oi.precio_unitario, oi.cantidad
           from orders o join order_items oi on oi.order_id=o.id
           where o.numero = $1`,
          [body.numero]
        )
        expect(rows[0].catering_item_id).not.toBeNull()
        expect(Number(rows[0].precio_unitario)).toBe(0)
        expect(Number(rows[0].cantidad)).toBe(30)
      } finally {
        await limpiarPorTelefono(telefono)
      }
    },
    TIMEOUT_MS
  )

  it(
    'combo con canal_permitido=whatsapp exclusivo → rechazado, ningún pedido creado (mismo criterio que el bot en la dirección contraria)',
    async () => {
      const telefono = '999444003'
      await limpiarPorTelefono(telefono)
      const fecha = fechaFuturaNoDomingo(10)

      const res = await app.inject({
        method: 'POST',
        url: '/api/dashboard/orders',
        headers: { authorization: `Bearer ${JWT_OPERADOR}` },
        payload: {
          cliente: { nombre: 'Cliente Rechazado', telefono },
          tipoEntrega: 'tienda',
          fechaEntrega: fecha,
          horario: '4pm',
          items: [{ tipo: 'combo', comboId: comboWhatsappExclusivoId, cantidad: 1 }],
          metodoPago: 'yape',
          yaPago: false,
        },
      })

      expect(res.statusCode).toBe(409)
      // Renombrado de COMBO_NO_DISPONIBLE_PRESENCIAL a este código genérico
      // cuando pedidosCombos.ts se generalizó para las dos direcciones (ver
      // 0028) — mismo comportamiento real, solo el nombre del código.
      expect(res.json().error).toBe('COMBO_NO_DISPONIBLE_EN_ESTE_CANAL')

      const { rows } = await client.query(
        `select count(*)::int as n from orders where customer_id in (select id from customers where telefono = $1)`,
        [telefono]
      )
      expect(rows[0].n).toBe(0)
    },
    TIMEOUT_MS
  )

  it(
    'GET comprobante.pdf: sin Authorization → 401; con JWT real → PDF real (bytes %PDF)',
    async () => {
      const telefono = '999444005'
      await limpiarPorTelefono(telefono)
      const fecha = fechaFuturaNoDomingo(10)

      try {
        const creado = await app.inject({
          method: 'POST',
          url: '/api/dashboard/orders',
          headers: { authorization: `Bearer ${JWT_OPERADOR}` },
          payload: {
            cliente: { nombre: 'Cliente PDF', telefono },
            tipoEntrega: 'tienda',
            fechaEntrega: fecha,
            horario: '4pm',
            items: [{ tipo: 'producto', productoId: 'torta-carrot-cake', tamano: 'Individual', cantidad: 1 }],
            metodoPago: 'yape',
            yaPago: false,
          },
        })
        const numero = creado.json().numero

        const sinAuth = await app.inject({ method: 'GET', url: `/api/dashboard/orders/${numero}/comprobante.pdf` })
        expect(sinAuth.statusCode).toBe(401)

        const conAuth = await app.inject({
          method: 'GET',
          url: `/api/dashboard/orders/${numero}/comprobante.pdf`,
          headers: { authorization: `Bearer ${JWT_OPERADOR}` },
        })
        expect(conAuth.statusCode).toBe(200)
        expect(conAuth.headers['content-type']).toBe('application/pdf')
        const buffer = conAuth.rawPayload
        expect(buffer.length).toBeGreaterThan(500)
        expect(buffer.subarray(0, 4).toString('utf8')).toBe('%PDF')
      } finally {
        await limpiarPorTelefono(telefono)
      }
    },
    TIMEOUT_MS
  )
})

describe.skipIf(!hayBaseDeDatosReal || !JWT_OPERADOR || !ROL_ES_ADMIN)(
  'POST /api/dashboard/orders (real, JWT real, rol admin)',
  () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    let client: pg.PoolClient
    let app: Awaited<ReturnType<typeof buildApp>>

    beforeAll(async () => {
      client = await pool.connect()
      app = await buildApp()
    })

    afterAll(async () => {
      client.release()
      await pool.end()
    })

    it(
      'admin: puede elegir sede_id explícito, se respeta (no se fuerza a ninguna sede propia)',
      async () => {
        const telefono = '999444004'
        await client.query(
          `delete from orders where customer_id in (select id from customers where telefono = $1)`,
          [telefono]
        )
        await client.query(`delete from customers where telefono = $1`, [telefono])
        const fecha = fechaFuturaNoDomingo(10)

        try {
          const res = await app.inject({
            method: 'POST',
            url: '/api/dashboard/orders',
            headers: { authorization: `Bearer ${JWT_OPERADOR}` },
            payload: {
              cliente: { nombre: 'Cliente Admin', telefono },
              tipoEntrega: 'tienda',
              fechaEntrega: fecha,
              horario: '4pm',
              items: [{ tipo: 'producto', productoId: 'torta-carrot-cake', tamano: 'Individual', cantidad: 1 }],
              metodoPago: 'yape',
              yaPago: false,
              sedeId: SEDE_SANTA_MARINA,
            },
          })

          expect(res.statusCode).toBe(201)
          const { rows } = await client.query(`select sede_id from orders where numero = $1`, [res.json().numero])
          expect(rows[0].sede_id).toBe(SEDE_SANTA_MARINA)
        } finally {
          await client.query(
            `delete from orders where customer_id in (select id from customers where telefono = $1)`,
            [telefono]
          )
          await client.query(`delete from customers where telefono = $1`, [telefono])
        }
      },
      TIMEOUT_MS
    )
  }
)

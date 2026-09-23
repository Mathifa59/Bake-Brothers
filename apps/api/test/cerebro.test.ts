// Corre contra el catálogo real (Postgres) Y la API real de Anthropic — no
// hay mock del modelo, porque lo que hay que probar es que el modelo de
// verdad toma la decisión correcta (qué tool llama, si escala o no), no solo
// que el código "no truena". Se salta si falta DATABASE_URL o
// ANTHROPIC_API_KEY. Para correrlo de verdad:
//   DATABASE_URL=... ANTHROPIC_API_KEY=... pnpm --filter @bakebrothers/api test -- cerebro
//
// Costo real: cada caso pega contra Sonnet de verdad, alguno con más de una
// vuelta de tool-use — no es gratis como los tests de dominio.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { evaluarTurno, type TurnoHistorial, type ResultadoTurno } from '../src/bot/cerebro.js'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER
const hayAnthropicKey = !!process.env.ANTHROPIC_API_KEY

const TIMEOUT_MS = 30_000
const TIMEOUT_MS_PEDIDO = 60_000

/**
 * Un cliente real rara vez da TODOS los datos en un solo mensaje y el bot a
 * veces pide una confirmación extra antes de crearPedido (variación normal
 * del modelo, no un bug) — se simula la conversación insistiendo con una
 * confirmación genérica hasta que llegue a crearPedido o se agoten los
 * turnos, en vez de asumir que ocurre siempre en el primer mensaje.
 */
async function conversarHastaCrearPedido(
  client: pg.PoolClient,
  tenantId: string,
  mensajeInicial: string
): Promise<ResultadoTurno> {
  let historial: TurnoHistorial[] = []
  let mensaje = mensajeInicial
  let ultimoResultado: ResultadoTurno | null = null
  // herramientasUsadas es por turno, no acumulado — si el semáforo se
  // consultó en un turno anterior y crearPedido recién en uno posterior, hay
  // que juntar ambos para no perder esa evidencia.
  const herramientasAcumuladas: string[] = []
  for (let turno = 0; turno < 4; turno++) {
    ultimoResultado = await evaluarTurno(client, tenantId, historial, mensaje, 'activa', 'whatsapp')
    herramientasAcumuladas.push(...ultimoResultado.herramientasUsadas)
    if (ultimoResultado.herramientasUsadas.includes('crearPedido')) {
      return { ...ultimoResultado, herramientasUsadas: herramientasAcumuladas }
    }
    historial = [
      ...historial,
      { rol: 'cliente', texto: mensaje, en: new Date().toISOString() },
      { rol: 'bot', texto: ultimoResultado.textoRespuesta, en: new Date().toISOString() },
    ]
    mensaje = 'Sí, confirmo todo tal cual, es solo recojo en tienda (Cedros), no necesito delivery. Por favor regístralo así.'
  }
  return { ...ultimoResultado!, herramientasUsadas: herramientasAcumuladas }
}

// Fechas calculadas en tiempo de ejecución (no literales) — mismo criterio
// que botTools.test.ts, para que el archivo siga siendo válido sin importar
// cuándo se corra. Tequeños: mínimo real 25 unidades, admite el corte de la
// noche anterior. Se le da al modelo la fecha en ISO explícita en el propio
// mensaje para no depender de que el modelo infiera bien la fecha de hoy —
// lo que se está probando es la decisión (tool + escalada), no su calendario.
const fechaFuturaNoDomingo = (diasMinimos: number): string => {
  let d = new Date()
  d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diasMinimos)
  while (d.getDay() === 0) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const proximoDomingoDesde = (diasMinimos: number): string => {
  let d = new Date()
  d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diasMinimos)
  while (d.getDay() !== 0) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe.skipIf(!hayBaseDeDatosReal || !hayAnthropicKey)('evaluarTurno (cerebro del bot, real)', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let tenantId: string

  beforeAll(async () => {
    client = await pool.connect()
    const { rows } = await client.query(`select id from tenants where slug = 'bake-brothers'`)
    tenantId = rows[0].id
  })

  afterAll(async () => {
    client.release()
    await pool.end()
  })

  it(
    '1. Consulta de precio simple → llama a consultarPrecio, responde con el precio real, no escala',
    async () => {
      const r = await evaluarTurno(client, tenantId, [], '¿Cuánto cuesta el carrot cake?', 'activa', 'whatsapp')
      expect(r.herramientasUsadas).toContain('consultarPrecio')
      expect(r.herramientasUsadas).not.toContain('escalarAHumano')
      expect(r.nuevoEstado).toBe('activa')
      expect(r.textoRespuesta).toMatch(/9[.,]90/)
    },
    TIMEOUT_MS
  )

  it(
    '2. Consulta de disponibilidad → llama a consultarDisponibilidad, no escala',
    async () => {
      const r = await evaluarTurno(client, tenantId, [], '¿Tienen red velvet disponible ahora?', 'activa', 'whatsapp')
      expect(r.herramientasUsadas).toContain('consultarDisponibilidad')
      expect(r.herramientasUsadas).not.toContain('escalarAHumano')
      expect(r.nuevoEstado).toBe('activa')
    },
    TIMEOUT_MS
  )

  it(
    '3. Combo con sustitución (Tortipack, permite_cambios=true) → llama a consultarCombo, no escala',
    async () => {
      const r = await evaluarTurno(
        client,
        tenantId,
        [],
        'En el Tortipack, ¿puedo pedir las dos porciones de carrot cake en vez de una de cada sabor?',
        'activa',
        'whatsapp'
      )
      expect(r.herramientasUsadas).toContain('consultarCombo')
      expect(r.herramientasUsadas).not.toContain('escalarAHumano')
      expect(r.nuevoEstado).toBe('activa')
    },
    TIMEOUT_MS
  )

  it(
    '4. Catering verde (30 tequeños, día hábil lejano) → llama al semáforo, resultado verde, no escala',
    async () => {
      const fecha = fechaFuturaNoDomingo(30)
      const r = await evaluarTurno(
        client,
        tenantId,
        [],
        `Quiero pedir 30 tequeños para el ${fecha} (formato año-mes-día)`,
        'activa',
        'whatsapp'
      )
      expect(r.herramientasUsadas).toContain('evaluarSemaforoCateringPedido')
      expect(r.herramientasUsadas).not.toContain('escalarAHumano')
      expect(r.nuevoEstado).toBe('activa')
    },
    TIMEOUT_MS
  )

  it(
    '5. Catering amarillo (30 tequeños, domingo) → el domingo manda, escala aunque la cantidad sobre',
    async () => {
      const fecha = proximoDomingoDesde(7)
      const r = await evaluarTurno(
        client,
        tenantId,
        [],
        `Quiero pedir 30 tequeños para el domingo ${fecha} (formato año-mes-día)`,
        'activa',
        'whatsapp'
      )
      expect(r.herramientasUsadas).toContain('evaluarSemaforoCateringPedido')
      expect(r.nuevoEstado).toBe('escalada')
      expect(r.motivoEscalacion).toMatch(/amarillo/)
    },
    TIMEOUT_MS
  )

  it(
    '6. Mención de alergia → interceptado ANTES del modelo, respuesta fija, escala, sin tools',
    async () => {
      const r = await evaluarTurno(
        client,
        tenantId,
        [],
        'Hola, mi hija es alérgica a los frutos secos, ¿el carrot cake tiene?',
        'activa',
        'whatsapp'
      )
      expect(r.herramientasUsadas).toEqual([])
      expect(r.nuevoEstado).toBe('escalada')
      expect(r.textoRespuesta).toMatch(/alergias/i)
      expect(r.motivoEscalacion).toMatch(/alergia/i)
    },
    TIMEOUT_MS
  )

  it(
    '7. Reclamo (torta llegó rota, pide reembolso) → llama a escalarAHumano, escala',
    async () => {
      const r = await evaluarTurno(
        client,
        tenantId,
        [],
        'Pedí una torta ayer y llegó toda rota, quiero mi plata de vuelta',
        'activa',
        'whatsapp'
      )
      expect(r.herramientasUsadas).toContain('escalarAHumano')
      expect(r.nuevoEstado).toBe('escalada')
      expect(r.motivoEscalacion).toBeTruthy()
    },
    TIMEOUT_MS
  )

  it(
    '8. Mensaje ambiguo sin tool que calce → responde honestamente, NO fuerza escalada',
    async () => {
      const r = await evaluarTurno(
        client,
        tenantId,
        [],
        '¿Tienen algún programa de puntos o descuentos por ser cliente frecuente?',
        'activa',
        'whatsapp'
      )
      expect(r.herramientasUsadas).not.toContain('escalarAHumano')
      expect(r.nuevoEstado).toBe('activa')
      expect(r.textoRespuesta.length).toBeGreaterThan(0)
    },
    TIMEOUT_MS
  )

  it(
    '9. Pedido de tienda completo → crearPedido, pedido real creado y verificado contra la base',
    async () => {
      const telefono = '999000001'
      // Limpieza por si quedó basura de una corrida anterior interrumpida.
      await client.query(`delete from orders where customer_id in (select id from customers where telefono = $1)`, [telefono])
      await client.query(`delete from customers where telefono = $1`, [telefono])

      const fecha = fechaFuturaNoDomingo(10)
      const mensaje =
        `Quiero un carrot cake, tamaño individual, para recoger en tienda el ${fecha}, a las 4pm — solo recojo, no delivery. ` +
        `Mi nombre es Ana Test y mi teléfono es ${telefono}. Voy a pagar con yape cuando llegue, no por adelantado.`

      try {
        const r = await conversarHastaCrearPedido(client, tenantId, mensaje)
        expect(r.herramientasUsadas).toContain('crearPedido')
        expect(r.nuevoEstado).toBe('activa')

        const numeroMatch = r.textoRespuesta.match(/BB-\d+/)
        expect(numeroMatch).not.toBeNull()

        const { rows } = await client.query(
          `select o.numero, o.estado, o.canal, o.total, c.telefono, c.nombre,
                  oi.nombre_producto, oi.cantidad, oi.precio_unitario, oi.product_id, oi.catering_item_id
           from orders o
           join customers c on c.id = o.customer_id
           join order_items oi on oi.order_id = o.id
           where o.numero = $1`,
          [numeroMatch![0]]
        )
        expect(rows.length).toBe(1)
        expect(rows[0].estado).toBe('confirmed')
        expect(rows[0].canal).toBe('whatsapp')
        expect(rows[0].telefono).toBe(telefono)
        expect(Number(rows[0].total)).toBe(9.9)
        expect(rows[0].nombre_producto).toMatch(/carrot cake/i)
        expect(rows[0].product_id).not.toBeNull()
        expect(rows[0].catering_item_id).toBeNull()
      } finally {
        await client.query(`delete from orders where customer_id in (select id from customers where telefono = $1)`, [telefono])
        await client.query(`delete from customers where telefono = $1`, [telefono])
      }
    },
    TIMEOUT_MS_PEDIDO
  )

  it(
    '10. Pedido de catering verde con adelanto → crearPedido, pedido real creado en payment_pending',
    async () => {
      const telefono = '999000002'
      await client.query(`delete from orders where customer_id in (select id from customers where telefono = $1)`, [telefono])
      await client.query(`delete from customers where telefono = $1`, [telefono])

      const fecha = fechaFuturaNoDomingo(15)
      const mensaje =
        `Quiero pedir 30 tequeños para recoger en tienda el ${fecha} (formato año-mes-día), a las 10am — solo recojo, no delivery. ` +
        `Mi nombre es Carlos Test y mi teléfono es ${telefono}. Voy a pagar el adelanto por Yape.`

      try {
        const r = await conversarHastaCrearPedido(client, tenantId, mensaje)
        expect(r.herramientasUsadas).toContain('evaluarSemaforoCateringPedido')
        expect(r.herramientasUsadas).toContain('crearPedido')
        expect(r.nuevoEstado).toBe('activa')

        const numeroMatch = r.textoRespuesta.match(/BB-\d+/)
        expect(numeroMatch).not.toBeNull()

        const { rows } = await client.query(
          `select o.numero, o.estado, o.canal, o.total, c.telefono,
                  oi.nombre_producto, oi.cantidad, oi.precio_unitario, oi.product_id, oi.catering_item_id
           from orders o
           join customers c on c.id = o.customer_id
           join order_items oi on oi.order_id = o.id
           where o.numero = $1`,
          [numeroMatch![0]]
        )
        expect(rows.length).toBe(1)
        expect(rows[0].estado).toBe('payment_pending')
        expect(rows[0].telefono).toBe(telefono)
        expect(rows[0].nombre_producto).toMatch(/tequ/i)
        expect(Number(rows[0].cantidad)).toBe(30)
        expect(Number(rows[0].precio_unitario)).toBe(0)
        expect(rows[0].product_id).toBeNull()
        expect(rows[0].catering_item_id).not.toBeNull()
      } finally {
        await client.query(`delete from orders where customer_id in (select id from customers where telefono = $1)`, [telefono])
        await client.query(`delete from customers where telefono = $1`, [telefono])
      }
    },
    TIMEOUT_MS
  )
})

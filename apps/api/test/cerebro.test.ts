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
import { evaluarTurno } from '../src/bot/cerebro.js'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER
const hayAnthropicKey = !!process.env.ANTHROPIC_API_KEY

const TIMEOUT_MS = 30_000

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
      const r = await evaluarTurno(client, tenantId, [], '¿Cuánto cuesta el carrot cake?', 'activa')
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
      const r = await evaluarTurno(client, tenantId, [], '¿Tienen red velvet disponible ahora?', 'activa')
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
        'activa'
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
        'activa'
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
        'activa'
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
        'activa'
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
        'activa'
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
        'activa'
      )
      expect(r.herramientasUsadas).not.toContain('escalarAHumano')
      expect(r.nuevoEstado).toBe('activa')
      expect(r.textoRespuesta.length).toBeGreaterThan(0)
    },
    TIMEOUT_MS
  )
})

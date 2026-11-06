// El tamaño dentro de la frase, con el MODELO REAL (no mock): lo que hay que probar es que Claude, con la
// herramienta nueva y la regla 8 del prompt, entiende el producto aunque el cliente mencione el tamaño y que
// nunca dice que el producto "no existe". Corre contra el catálogo real (Postgres) y la API real de
// Anthropic; se salta si falta DATABASE_URL o ANTHROPIC_API_KEY. Para correrlo de verdad:
//   DATABASE_URL=... ANTHROPIC_API_KEY=... pnpm --filter @bakebrothers/api test -- cerebroTamano
//
// Costo real: cada frase pega contra Sonnet de verdad. La parte determinística (la herramienta y los pedidos
// con esas mismas frases) ya está cubierta sin modelo en busquedaTamano.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { evaluarTurno } from '../src/bot/cerebro.js'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER
const hayAnthropicKey = !!process.env.ANTHROPIC_API_KEY

const TIMEOUT_MS = 45_000

// Lo que NUNCA debe decir cuando el producto sí existe.
const DICE_QUE_NO_EXISTE = /no (me )?(aparece|encuentro|existe|tenemos|lo tenemos|figura)|no est[aá] en (el )?cat[aá]logo/i

describe.skipIf(!hayBaseDeDatosReal || !hayAnthropicKey)('el bot entiende el tamaño dentro de la frase (Claude real)', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let tenantId: string

  beforeAll(async () => {
    client = await pool.connect()
    tenantId = (await client.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
  })
  afterAll(async () => {
    client.release()
    await pool.end()
  })

  const preguntar = (mensaje: string) => evaluarTurno(client, tenantId, [], mensaje, 'activa', 'whatsapp')

  it.each([
    ['¿Cuánto cuesta el carrot cake individual?', /9[.,]90/],
    ['¿A cuánto está la porción de cheesecake de fresa?', /9[.,]90/],
    ['¿Cuánto sale la torta de chocolate familiar?', /79[.,]90/],
    ['¿Precio del mini red velvet?', /49[.,]90/],
  ])('"%s" → responde con el precio real de ESE tamaño, sin decir que no existe', async (mensaje, precio) => {
    const r = await preguntar(mensaje)
    expect(r.herramientasUsadas).toContain('consultarPrecio')
    expect(r.herramientasUsadas).not.toContain('escalarAHumano')
    expect(r.textoRespuesta).toMatch(precio)
    expect(r.textoRespuesta).not.toMatch(DICE_QUE_NO_EXISTE)
  }, TIMEOUT_MS)

  it.each(['¿Cuánto cuesta una caja de alfajores de 18?', '¿Cuánto cuestan los alfajores x10?'])(
    '"%s" → hay varios sabores: pregunta cuál, no elige por el cliente',
    async (mensaje) => {
      const r = await preguntar(mensaje)
      expect(r.herramientasUsadas.some((h) => h === 'consultarPrecio' || h === 'listarCatalogo')).toBe(true)
      expect(r.textoRespuesta).not.toMatch(DICE_QUE_NO_EXISTE)
      expect(r.textoRespuesta).toMatch(/cu[aá]l|qu[eé] sabor|sabores|prefieres|quieres/i)
    },
    TIMEOUT_MS
  )

  it(
    'un tamaño que el producto no tiene: dice que no viene en ese tamaño y ofrece los que sí hay',
    async () => {
      const r = await preguntar('¿Tienen la torta de alfajor en tamaño familiar?')
      expect(r.herramientasUsadas).toContain('consultarPrecio')
      expect(r.textoRespuesta).not.toMatch(DICE_QUE_NO_EXISTE)
      // El único tamaño real de la Torta de Alfajor es Mini 16cm (S/ 48.50).
      expect(r.textoRespuesta).toMatch(/mini|16 ?cm/i)
      expect(r.textoRespuesta).toMatch(/48[.,]50/)
    },
    TIMEOUT_MS
  )
})

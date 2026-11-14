// El horario de los locales tiene UNA sola fuente: la tabla por día (`sedes_horarios`). El texto del bot, los renglones de la web
// y el JSON-LD se generan de ahí. Contra Postgres real (esquema hasta la 0051); los casos que cambian horarios corren dentro de
// una transacción que se deshace.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal = !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER
process.env.ANTHROPIC_API_KEY ||= 'dummy-para-test-mockeado-nunca-sale-un-request-real'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({ messages: { create: mockCreate } })),
}))

const { evaluarTurno } = await import('../src/bot/cerebro.js')
const { generarHorariosWeb, serializarHorariosWeb } = await import('../src/horariosWeb.js')

const RUTA_WEB = fileURLToPath(new URL('../../web/src/config/horarios.generated.json', import.meta.url))
const AHORA = new Date('2026-11-13T12:00:00-05:00')
const sistema = () => String(mockCreate.mock.calls[0][0].system)

describe.skipIf(!hayBaseDeDatosReal)('horario de los locales: una sola fuente (sedes_horarios)', () => {
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
  beforeEach(() => mockCreate.mockReset())

  async function enTransaccion<T>(fn: () => Promise<T>): Promise<T> {
    await client.query('begin')
    try {
      return await fn()
    } finally {
      await client.query('rollback')
    }
  }
  const turno = () => evaluarTurno(client, tenantId, [], 'hola', 'activa', 'whatsapp', undefined, { ahora: AHORA })

  it('el bot lee el horario generado desde la tabla por día', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Hola' }], stop_reason: 'end_turn' })
    await enTransaccion(turno)
    const s = sistema()
    expect(s).toMatch(/Cedros \(.*horario: lunes a sábado 7:30 a\. m\. a 8:30 p\. m\.; domingo 10:30 a\. m\. a 8:30 p\. m\./)
    expect(s).toMatch(/Santa Marina \(.*horario: viernes a miércoles 12:00 p\. m\. a 10:00 p\. m\.; jueves 1:00 p\. m\. a 10:00 p\. m\./)
  })

  it('cambiar el horario en la tabla cambia lo que lee el bot (sin tocar ningún texto)', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Hola' }], stop_reason: 'end_turn' })
    await enTransaccion(async () => {
      // El sábado de Cedros pasa a 9:00–14:00 y el domingo cierra.
      await client.query(`update sedes_horarios set abre = '09:00', cierra = '14:00' where dia_semana = 6 and sede_id = (select id from sedes where nombre = 'Cedros')`)
      await client.query(`delete from sedes_horarios where dia_semana = 0 and sede_id = (select id from sedes where nombre = 'Cedros')`)
      await turno()
    })
    const s = sistema()
    expect(s).toMatch(/Cedros \(.*horario: lunes a viernes 7:30 a\. m\. a 8:30 p\. m\.; sábado 9:00 a\. m\. a 2:00 p\. m\./)
    expect(s).not.toMatch(/Cedros \(.*domingo/)
  })

  it('el texto viejo de sedes.horario ya NO se lee: aunque diga otra cosa, manda la tabla', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Hola' }], stop_reason: 'end_turn' })
    await enTransaccion(async () => {
      await client.query(`update sedes set horario = 'TEXTO VIEJO QUE NO DEBE LEERSE' where nombre = 'Cedros'`)
      await turno()
    })
    expect(sistema()).not.toContain('TEXTO VIEJO QUE NO DEBE LEERSE')
  })

  it('un local sin horario cargado aparece sin horario (el bot no inventa uno)', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Hola' }], stop_reason: 'end_turn' })
    await enTransaccion(async () => {
      await client.query(`delete from sedes_horarios where sede_id = (select id from sedes where nombre = 'Santa Marina')`)
      await turno()
    })
    const linea = sistema().split('\n').find((l) => l.startsWith('- Santa Marina'))!
    expect(linea).not.toContain('horario:')
  })

  it('la web (renglones y JSON-LD) está al día con la tabla: si cambió el horario hay que correr «pnpm horarios:web»', async () => {
    const generado = await enTransaccion(() => generarHorariosWeb(client))
    const enElRepo = fs.readFileSync(RUTA_WEB, 'utf8')
    expect(enElRepo, 'apps/web/src/config/horarios.generated.json está desactualizado respecto de sedes_horarios: corre `pnpm --filter @bakebrothers/api horarios:web`').toBe(
      serializarHorariosWeb(generado)
    )
  })
})

// Corre contra el Supabase real con contenido_rag ya poblado (no hay forma
// de reproducir embeddings reales en un Postgres local sin llamar a Voyage).
// Se salta si falta DATABASE_URL (contra una base con datos reales) o
// VOYAGE_API_KEY (nunca se hardcodea acá) — para correrlo de verdad:
//   DATABASE_URL=... VOYAGE_API_KEY=... pnpm --filter @bakebrothers/api test
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { buscarContenidoRelevante } from '../src/bot/rag.js'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER
const hayVoyageKey = !!process.env.VOYAGE_API_KEY

describe.skipIf(!hayBaseDeDatosReal || !hayVoyageKey)('buscarContenidoRelevante (RAG real)', () => {
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

  it('devuelve el Carrot Cake como resultado más relevante para una pregunta sobre frutos secos', async () => {
    const resultados = await buscarContenidoRelevante(
      client,
      tenantId,
      '¿el carrot cake tiene frutos secos?',
      3
    )
    expect(resultados.length).toBeGreaterThan(0)
    expect(resultados[0].titulo).toBe('Carrot Cake')
    expect(resultados[0].contenido.toLowerCase()).toContain('pecanas')
    // similitud coseno: 1 = idéntico, más alto = más parecido.
    expect(resultados[0].similitud).toBeGreaterThan(resultados[1]?.similitud ?? 0)
  })

  it('devuelve [] si contenido_rag no tiene nada para ese tenant — nunca inventa un resultado', async () => {
    const resultados = await buscarContenidoRelevante(
      client,
      '00000000-0000-0000-0000-000000000000',
      '¿el carrot cake tiene frutos secos?',
      3
    )
    expect(resultados).toEqual([])
  })
})

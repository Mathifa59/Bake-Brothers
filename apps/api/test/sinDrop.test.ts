import pg from 'pg'
import { describe, expect, it } from 'vitest'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'
import { esBorradoProhibido, MENSAJE_BORRADO_PROHIBIDO } from './sinDrop.js'

// El guardia de ejecución se instala solo (setupFiles en vitest.config.ts). Estas pruebas comprueban que de verdad
// rechaza los tres borrados y que deja pasar lo demás. Las consultas prohibidas se rechazan ANTES de tocar la red, así
// que no hace falta ninguna base para probarlo.
describe('guardia contra borrar bases, tablas o esquemas', () => {
  it('detecta los tres borrados, con cualquier mayúscula y espacios', () => {
    for (const sql of [
      'drop database x',
      'DROP   TABLE si_existe',
      'drop\n  schema public cascade',
      'select 1; Drop Table t',
      'drop table if exists t',
    ]) {
      expect(esBorradoProhibido(sql), sql).toBe(true)
    }
  })

  it('deja pasar lo que no destruye datos', () => {
    for (const sql of [
      'drop trigger if exists t on x',
      'drop function if exists f()',
      'drop policy p on x',
      'drop index if exists i',
      'alter table x add column y int',
      'select 1',
      'insert into t values (1)',
    ]) {
      expect(esBorradoProhibido(sql), sql).toBe(false)
    }
    expect(esBorradoProhibido(undefined)).toBe(false)
  })

  it('un Client de pg rechaza el borrado (con promesa y con callback) sin llegar a la base', async () => {
    const client = new pg.Client({ connectionString: 'postgres://nadie@127.0.0.1:1/nada' })
    await expect(client.query('drop table clientes')).rejects.toThrow(MENSAJE_BORRADO_PROHIBIDO)
    await expect(client.query({ text: 'DROP DATABASE bb_prueba' })).rejects.toThrow(/nunca se borra/)
    const error = await new Promise<Error | null>((resolve) => {
      client.query('drop schema public', (e: Error | null) => resolve(e))
    })
    expect(error?.message).toBe(MENSAJE_BORRADO_PROHIBIDO)
  })

  // Un Pool conecta antes de consultar, así que esta prueba necesita la base local de pruebas (no toca ningún dato:
  // la consulta prohibida se rechaza sin ejecutarse).
  it.skipIf(!process.env.DATABASE_URL || process.env.DATABASE_URL === DATABASE_URL_PLACEHOLDER)(
    'un Pool conectado a la base de pruebas también lo rechaza',
    async () => {
      const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
      try {
        await expect(pool.query('drop table clientes_que_no_existen')).rejects.toThrow(MENSAJE_BORRADO_PROHIBIDO)
        await expect(pool.query('select 1 as uno')).resolves.toBeTruthy()
      } finally {
        await pool.end()
      }
    },
  )
})

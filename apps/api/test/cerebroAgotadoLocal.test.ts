// Lo agotado se dice por LOCAL, con el MODELO REAL (no mock): el caso del Pie de Manzana agotado en Cedros y con
// stock en Santa Marina. Lo que hay que probar es que Claude, con el campo `disponibleEn` de consultarPrecio y la
// regla 9 del prompt, dice "se nos agotó en Cedros" (el local concreto, nunca "agotado" a secas), ofrece Santa Marina
// CON su dirección, ofrece otros productos y no inventa otro local cuando no lo hay. Corre contra Postgres y la API
// real de Anthropic; se salta si falta DATABASE_URL o ANTHROPIC_API_KEY. Para correrlo de verdad:
//   DATABASE_URL=... ANTHROPIC_API_KEY=... npx vitest run test/cerebroAgotadoLocal.test.ts
//
// Todo dentro de una transacción que se revierte: el stock de prueba no queda en la base. La parte determinística
// (los campos que devuelve la herramienta) ya está cubierta sin modelo en agotados.test.ts.
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest'
import pg from 'pg'
import { evaluarTurno } from '../src/bot/cerebro.js'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER
const hayAnthropicKey = !!process.env.ANTHROPIC_API_KEY

const TIMEOUT_MS = 60_000
const PIE = 'Pie de Manzana'

// «agotado» sin decir en qué local, o dicho como si fuera de todos lados.
const AGOTADO_GLOBAL = /agotad[oa]s? (hoy )?en todos|en todos (los )?(tamaños|locales|lados)|no (hay|tenemos|queda) (pie de manzana )?en (ning[uú]n|ninguno)/i

describe.skipIf(!hayBaseDeDatosReal || !hayAnthropicKey)('el bot dice en qué local se agotó (Claude real)', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let tenantId: string
  let cedros: string
  let santaMarina: string
  let direccionSm: string

  beforeAll(async () => {
    const c = await pool.connect()
    tenantId = (await c.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
    const { rows } = await c.query(`select id, nombre, direccion from sedes where activo`)
    cedros = rows.find((r) => r.nombre === 'Cedros').id
    const sm = rows.find((r) => r.nombre === 'Santa Marina')
    santaMarina = sm.id
    direccionSm = sm.direccion
    c.release()
  })
  beforeEach(async () => {
    client = await pool.connect()
    await client.query('begin')
  })
  afterEach(async () => {
    await client.query('rollback')
    client.release()
  })
  afterAll(async () => {
    await pool.end()
  })

  /** Deja el stock del Pie de Manzana exactamente como se pide (tamano undefined = producto entero). */
  const fijarStock = async (filas: { sede: string; tamano?: string }[]) => {
    await client.query(`delete from stock where product_id in (select id from products where nombre = $1)`, [PIE])
    for (const f of filas) {
      await client.query(
        `insert into stock (sede_id, product_id, product_size_id, disponible)
         select $1, p.id, ps.id, false from products p left join product_sizes ps on ps.product_id = p.id and ps.tamano = $3
         where p.nombre = $2 and ($3::text is null or ps.id is not null)`,
        [f.sede, PIE, f.tamano ?? null]
      )
    }
  }

  const pedir = async (mensaje: string, sedeId?: string) => {
    const r = await evaluarTurno(client, tenantId, [], mensaje, 'activa', 'whatsapp', sedeId)
    if (process.env.VER_RESPUESTAS) console.log(`
— ${mensaje}
${r.textoRespuesta}
`)
    return r
  }

  // Un pedazo de la dirección que no se confunde con otra cosa ("Av. Defensores del Morro 2270" → "Defensores del Morro").
  const fragmentoDireccionSm = () => direccionSm.replace(/^Av\.?\s*/i, '').replace(/\s*\d+.*$/, '')

  it.each([
    ['una fila del producto ENTERO agotada en Cedros (el caso real)', undefined],
    ['solo el tamaño Individual agotado en Cedros', 'Individual'],
  ])('%s → "se nos agotó en Cedros", ofrece Santa Marina con su dirección y otros productos', async (_caso, tamano) => {
    await fijarStock([{ sede: cedros, tamano }])
    const r = await pedir('Hola, quiero 1 pie de manzana individual para recoger hoy en Cedros', cedros)
    expect(r.herramientasUsadas).toContain('consultarPrecio')
    expect(r.textoRespuesta).toMatch(/Cedros/)
    expect(r.textoRespuesta).toMatch(/agot/i)
    expect(r.textoRespuesta).not.toMatch(AGOTADO_GLOBAL)
    expect(r.textoRespuesta).toMatch(/Santa Marina/)
    expect(r.textoRespuesta.toLowerCase()).toContain(fragmentoDireccionSm().toLowerCase())
    expect(r.textoRespuesta).toMatch(/otro|otra|alternativa|mostrar|opciones|postres|tortas|disponible/i)
    expect(r.pedidosCreados ?? []).toHaveLength(0)
  }, TIMEOUT_MS)

  it('con el número del bot (sin local elegido) también dice en cuál local se agotó y cuál tiene', async () => {
    await fijarStock([{ sede: cedros }])
    const r = await pedir('Hola, quiero 1 pie de manzana individual para recoger hoy')
    expect(r.textoRespuesta).toMatch(/Cedros/)
    expect(r.textoRespuesta).toMatch(/Santa Marina/)
    expect(r.textoRespuesta).not.toMatch(AGOTADO_GLOBAL)
    expect(r.pedidosCreados ?? []).toHaveLength(0)
  }, TIMEOUT_MS)

  it('agotado en los dos locales: lo dice por local y NO inventa un local con stock', async () => {
    await fijarStock([{ sede: cedros }, { sede: santaMarina }])
    const r = await pedir('Quiero 1 pie de manzana individual para recoger hoy en Cedros', cedros)
    expect(r.textoRespuesta).toMatch(/Cedros/)
    expect(r.textoRespuesta).toMatch(/agot/i)
    expect(r.textoRespuesta).not.toMatch(/en Santa Marina (s[ií] )?(hay|tenemos|est[aá] disponible|lo tienen)/i)
    expect(r.pedidosCreados ?? []).toHaveLength(0)
  }, TIMEOUT_MS)
})

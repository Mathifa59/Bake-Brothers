// POST /api/dashboard/mifact/codigos — guarda los códigos de Mifact de nuestro catálogo
// (importador de Mifact, solo admin) en mifact_codigos (0033). Reglas que se prueban:
//   - solo admin (401 sin sesión, 403 operador), validación de la entrada;
//   - un producto puede tener un código POR ALMACÉN (el export de Mifact trae uno por almacén);
//   - nunca se pisa: otro código en el mismo almacén, o un código ya usado por otra cosa;
//   - jamás toca un precio ni un nombre;
//   (la RLS de mifact_codigos se prueba con roles reales en rlsCatalogo.test.ts)
// La verificación del JWT se mockea (necesita el JWKS real de Supabase por red); todo lo demás
// corre real contra Postgres con 0033 aplicada, dentro de lo que se limpia al terminar.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

vi.mock('../src/auth/verificarJwtOperador.js', () => ({
  verificarJwtOperador: async (
    req: { headers: Record<string, string | undefined>; operador?: unknown },
    reply: { code: (n: number) => { send: (b: unknown) => unknown } }
  ) => {
    const rol = req.headers['x-test-rol']
    if (!rol) return reply.code(401).send({ error: 'NO_AUTORIZADO' })
    req.operador = { id: 'admin-de-prueba', rol, sedeId: null }
  },
}))

const { buildApp } = await import('../src/app.js')

const PREFIJO = 'TEST-MIFACT-'

describe.skipIf(!hayBaseDeDatosReal)('POST /api/dashboard/mifact/codigos', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let app: Awaited<ReturnType<typeof buildApp>>
  let productoSinTamanos: { id: string; precio: string; nombre: string }
  let tamano: { id: string; precio: string }

  const limpiar = () => pool.query(`delete from mifact_codigos where codigo like $1`, [`${PREFIJO}%`])
  const enviar = (asignaciones: unknown, rol: string | null = 'admin') =>
    app.inject({
      method: 'POST',
      url: '/api/dashboard/mifact/codigos',
      headers: rol ? { 'x-test-rol': rol } : {},
      payload: { asignaciones } as Record<string, unknown>,
    })
  const asig = (id: string, almacen: string, codigo: string, tipo: 'producto' | 'tamano' = 'producto') => ({ tipo, id, almacen, codigo: `${PREFIJO}${codigo}` })

  beforeAll(async () => {
    app = await buildApp()
    productoSinTamanos = (
      await pool.query(`select p.id, p.precio_base::text as precio, p.nombre from products p where not exists (select 1 from product_sizes s where s.product_id = p.id) order by p.nombre limit 1`)
    ).rows[0]
    tamano = (await pool.query(`select s.id, s.precio::text as precio from product_sizes s order by s.precio limit 1`)).rows[0]
  })
  beforeEach(limpiar)
  afterAll(async () => {
    await limpiar()
    await pool.end()
  })

  it('sin sesión → 401; un operador → 403 SOLO_ADMIN; y no guarda nada', async () => {
    expect((await enviar([asig(productoSinTamanos.id, 'CENTRAL', 'X1')], null)).statusCode).toBe(401)
    const r = await enviar([asig(productoSinTamanos.id, 'CENTRAL', 'X1')], 'operador')
    expect(r.statusCode).toBe(403)
    expect(r.json().error).toBe('SOLO_ADMIN')
    expect((await pool.query(`select count(*)::int n from mifact_codigos where codigo like $1`, [`${PREFIJO}%`])).rows[0].n).toBe(0)
  })

  it('valida la entrada: lista vacía, id que no es uuid, código vacío o con saltos de línea → 400', async () => {
    expect((await enviar([])).statusCode).toBe(400)
    expect((await enviar([{ tipo: 'producto', id: 'no-uuid', almacen: 'CENTRAL', codigo: 'A' }])).statusCode).toBe(400)
    expect((await enviar([asig(productoSinTamanos.id, 'CENTRAL', '')])).statusCode).toBe(200) // prefijo + '' no es vacío…
    await limpiar()
    expect((await enviar([{ tipo: 'producto', id: productoSinTamanos.id, almacen: 'CENTRAL', codigo: '   ' }])).statusCode).toBe(400)
    expect((await enviar([{ tipo: 'producto', id: productoSinTamanos.id, almacen: 'CENTRAL', codigo: 'A\nB' }])).statusCode).toBe(400)
  })

  it('guarda un código por almacén de un producto y de un tamaño, y el almacén se normaliza (minúsculas)', async () => {
    const r = await enviar([
      asig(productoSinTamanos.id, 'CENTRAL', 'P-C'),
      asig(productoSinTamanos.id, 'Santa  Marina', 'P-SM'),
      asig(productoSinTamanos.id, 'TODOS', 'P-T'),
      asig(tamano.id, 'CENTRAL', 'T-C', 'tamano'),
    ])
    expect(r.statusCode).toBe(200)
    expect(r.json().resumen).toEqual({ guardados: 4, iguales: 0, rechazados: 0 })
    const { rows } = await pool.query(`select almacen, codigo from mifact_codigos where codigo like $1 order by codigo`, [`${PREFIJO}%`])
    expect(rows.map((x) => [x.almacen, x.codigo.replace(PREFIJO, '')])).toEqual([
      ['central', 'P-C'], ['santa marina', 'P-SM'], ['todos', 'P-T'], ['central', 'T-C'],
    ])
  })

  it('es idempotente: volver a mandar el mismo código da "igual" y no duplica', async () => {
    await enviar([asig(productoSinTamanos.id, 'CENTRAL', 'P-C')])
    const r = await enviar([asig(productoSinTamanos.id, 'central', 'P-C')])
    expect(r.json().resumen).toEqual({ guardados: 0, iguales: 1, rechazados: 0 })
    expect((await pool.query(`select count(*)::int n from mifact_codigos where codigo like $1`, [`${PREFIJO}%`])).rows[0].n).toBe(1)
  })

  it('nunca pisa: otro código para la MISMA unidad y almacén queda rechazado con el motivo', async () => {
    await enviar([asig(productoSinTamanos.id, 'CENTRAL', 'P-C')])
    const r = await enviar([asig(productoSinTamanos.id, 'CENTRAL', 'P-OTRO')])
    expect(r.json().resultados[0]).toMatchObject({ resultado: 'item_con_otro_codigo' })
    expect(r.json().resultados[0].detalle).toContain('P-C')
    const { rows } = await pool.query(`select codigo from mifact_codigos where codigo like $1`, [`${PREFIJO}%`])
    expect(rows.map((x) => x.codigo)).toEqual([`${PREFIJO}P-C`])
  })

  it('un código ya usado por otra unidad (producto, tamaño o el mismo en otro almacén) se rechaza', async () => {
    await enviar([asig(productoSinTamanos.id, 'CENTRAL', 'P-C')])
    const r = await enviar([asig(tamano.id, 'CENTRAL', 'P-C', 'tamano'), asig(productoSinTamanos.id, 'todos', 'P-C')])
    expect(r.json().resultados.map((x: { resultado: string }) => x.resultado)).toEqual(['codigo_en_uso', 'codigo_en_uso'])
    expect(r.json().resumen).toEqual({ guardados: 0, iguales: 0, rechazados: 2 })
  })

  it('una unidad que no existe da "no_encontrado" sin romper el resto del lote', async () => {
    const r = await enviar([asig(randomUUID(), 'CENTRAL', 'FANTASMA'), asig(productoSinTamanos.id, 'CENTRAL', 'P-C')])
    expect(r.json().resultados.map((x: { resultado: string }) => x.resultado)).toEqual(['no_encontrado', 'guardado'])
  })

  it('jamás cambia un precio ni un nombre del catálogo', async () => {
    const antes = JSON.stringify((await pool.query(`select p.id, p.nombre, p.precio_base, (select json_agg(json_build_object('t', s.tamano, 'p', s.precio) order by s.id) from product_sizes s where s.product_id = p.id) t from products p order by p.id`)).rows)
    await enviar([asig(productoSinTamanos.id, 'CENTRAL', 'P-C'), asig(tamano.id, 'TODOS', 'T-T', 'tamano')])
    const despues = JSON.stringify((await pool.query(`select p.id, p.nombre, p.precio_base, (select json_agg(json_build_object('t', s.tamano, 'p', s.precio) order by s.id) from product_sizes s where s.product_id = p.id) t from products p order by p.id`)).rows)
    expect(despues).toBe(antes)
  })

  it('borrar un producto borra sus códigos (on delete cascade), sin dejar huérfanos', async () => {
    const c = await pool.connect()
    try {
      await c.query('begin')
      const { rows } = await c.query(
        `insert into products (tenant_id, slug, nombre, categoria_negocio, tipo, precio_base) select tenant_id, 'tmp-mifact', 'Tmp Mifact', 'dulces', 'x', 1 from products limit 1 returning id`
      )
      await c.query(`insert into mifact_codigos (product_id, almacen, codigo) values ($1, 'central', $2)`, [rows[0].id, `${PREFIJO}CASCADA`])
      await c.query(`delete from products where id = $1`, [rows[0].id])
      expect((await c.query(`select count(*)::int n from mifact_codigos where codigo = $1`, [`${PREFIJO}CASCADA`])).rows[0].n).toBe(0)
    } finally {
      await c.query('rollback')
      c.release()
    }
  })
})

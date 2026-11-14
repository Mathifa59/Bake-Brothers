// Conversaciones de prueba del bot (test/fixtures/conversaciones/*.json): cada una dice qué escribe el cliente y qué se
// espera que haga el bot. Dos partes:
//  1. VALIDACIÓN DE FORMATO (siempre corre, sin Claude ni base): que cada archivo tenga el formato y que las expectativas sean
//     válidas. Sirve para revisar las conversaciones reales que se peguen antes de gastar un solo token.
//  2. EJECUCIÓN CON CLAUDE REAL (solo con RUN_FIXTURES=1, una base con el esquema y ANTHROPIC_API_KEY con saldo): corre cada
//     conversación contra el cerebro real y la base, dentro de una transacción que se revierte (no queda ningún pedido).
//     VER_RESPUESTAS=1 imprime lo que contestó el bot. FILTRO=18 corre solo los archivos que empiezan con ese texto.
// Ver test/fixtures/conversaciones/LEEME.md.
import { readdirSync, readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const DIR = new URL('./fixtures/conversaciones/', import.meta.url)
interface Fixture {
  id: string
  titulo: string
  origen: 'sintetica' | 'real'
  contexto: { ahora: string; canal: 'whatsapp' | 'facebook' | 'instagram'; sede: string | null }
  preparacion: Preparacion[]
  turnos: { cliente: string }[]
  esperado: {
    estadoFinal?: 'activa' | 'escalada'
    pedidoCreado?: boolean
    herramientas?: { incluye?: string[]; noIncluye?: string[] }
    textoContiene?: string[]
    textoNoContiene?: string[]
    textoContieneRegex?: string[]
    textoNoContieneRegex?: string[]
  }
}
type Preparacion =
  | { tipo: 'stock_agotado'; slug: string; tamano?: string; sede: string }
  | { tipo: 'ocultar_producto'; slug: string }
  | { tipo: 'ocultar_tamano'; slug: string; tamano: string }
  | { tipo: 'precio_tamano'; slug: string; tamano: string; precio: number }

const archivos = readdirSync(DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort()
const fixtures = archivos.map((f) => ({ archivo: f, fx: JSON.parse(readFileSync(new URL(f, DIR), 'utf8')) as Fixture }))

const CLAVES_ESPERADO = ['estadoFinal', 'pedidoCreado', 'herramientas', 'textoContiene', 'textoNoContiene', 'textoContieneRegex', 'textoNoContieneRegex']
const TIPOS_PREP = ['stock_agotado', 'ocultar_producto', 'ocultar_tamano', 'precio_tamano']
const HERRAMIENTAS = ['consultarPrecio', 'consultarDisponibilidad', 'consultarCombo', 'consultarReglasCatering', 'evaluarSemaforoCateringPedido', 'listarCatalogo', 'crearPedido', 'escalarAHumano']

describe('conversaciones de prueba: formato', () => {
  it('hay conversaciones y la plantilla para pegar las reales', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(20)
    expect(readdirSync(DIR)).toContain('_plantilla.json')
    expect(readdirSync(DIR)).toContain('LEEME.md')
  })

  it.each(fixtures.map((x) => [x.archivo, x.fx] as const))('%s tiene un formato válido', (archivo, fx) => {
    expect(archivo).toBe(`${fx.id}.json`)
    expect(fx.titulo.length).toBeGreaterThan(5)
    expect(['sintetica', 'real']).toContain(fx.origen)
    expect(Number.isNaN(new Date(fx.contexto.ahora).getTime()), 'contexto.ahora debe ser una fecha ISO con zona (-05:00)').toBe(false)
    expect(fx.contexto.ahora).toMatch(/[+-]\d{2}:\d{2}$/)
    expect(['whatsapp', 'facebook', 'instagram']).toContain(fx.contexto.canal)
    expect(fx.turnos.length).toBeGreaterThan(0)
    for (const t of fx.turnos) expect(t.cliente.trim().length).toBeGreaterThan(0)
    for (const p of fx.preparacion) expect(TIPOS_PREP).toContain(p.tipo)
    expect(Object.keys(fx.esperado).length, 'esperado no puede estar vacío').toBeGreaterThan(0)
    for (const k of Object.keys(fx.esperado)) expect(CLAVES_ESPERADO).toContain(k)
    for (const h of [...(fx.esperado.herramientas?.incluye ?? []), ...(fx.esperado.herramientas?.noIncluye ?? [])]) expect(HERRAMIENTAS).toContain(h)
    for (const r of [...(fx.esperado.textoContieneRegex ?? []), ...(fx.esperado.textoNoContieneRegex ?? [])]) expect(() => new RegExp(r, 'i')).not.toThrow()
  })

  it('los ids no se repiten y cubren lo que decidió el negocio', () => {
    const ids = fixtures.map((x) => x.fx.id)
    expect(new Set(ids).size).toBe(ids.length)
    const todo = JSON.stringify(fixtures.map((x) => x.fx))
    for (const tema of ['catering', 'personalizada', 'alergia', 'reclamo', 'primera hora', 'corte', 'datos de cobro', 'delivery', 'oculto', 'agotado', 'hoy', 'mayorista', 'tarjeta', 'devoluci', 'descuento', 'reserva', 'stock', 'alergenos']) {
      expect(todo.toLowerCase(), `falta un caso sobre «${tema}»`).toContain(tema.toLowerCase())
    }
  })
})

// ——— Ejecución con Claude real (apagada por defecto)
const hayBaseDeDatosReal = !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER
const correr = process.env.RUN_FIXTURES === '1' && hayBaseDeDatosReal && !!process.env.ANTHROPIC_API_KEY

describe.skipIf(!correr)('conversaciones de prueba: ejecución con Claude real', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let tenantId: string
  let evaluarTurno: typeof import('../src/bot/cerebro.js').evaluarTurno

  beforeAll(async () => {
    ;({ evaluarTurno } = await import('../src/bot/cerebro.js'))
    client = await pool.connect()
    tenantId = (await client.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
  })
  afterAll(async () => {
    client.release()
    await pool.end()
  })

  async function preparar(p: Preparacion) {
    if (p.tipo === 'ocultar_producto') await client.query(`update products set disponible = false where slug = $1`, [p.slug])
    if (p.tipo === 'ocultar_tamano')
      await client.query(`update product_sizes set activo = false where tamano = $2 and product_id = (select id from products where slug = $1)`, [p.slug, p.tamano])
    if (p.tipo === 'precio_tamano')
      await client.query(`update product_sizes set precio = $3 where tamano = $2 and product_id = (select id from products where slug = $1)`, [p.slug, p.tamano, p.precio])
    if (p.tipo === 'stock_agotado') {
      const sede = (await client.query(`select id from sedes where nombre = $1`, [p.sede])).rows[0].id
      const prod = (await client.query(`select id from products where slug = $1`, [p.slug])).rows[0].id
      const tam = p.tamano ? (await client.query(`select id from product_sizes where product_id = $1 and tamano = $2`, [prod, p.tamano])).rows[0].id : null
      await client.query(`insert into stock (sede_id, product_id, product_size_id, disponible) values ($1, $2, $3, false)`, [sede, prod, tam])
    }
  }

  const filtro = process.env.FILTRO ?? ''
  it.each(fixtures.filter((x) => x.archivo.startsWith(filtro)).map((x) => [x.archivo, x.fx] as const))('%s', async (_archivo, fx) => {
    await client.query('begin')
    try {
      for (const p of fx.preparacion) await preparar(p)
      const sedeId = fx.contexto.sede ? (await client.query(`select id from sedes where nombre = $1`, [fx.contexto.sede])).rows[0].id : undefined
      const ahora = new Date(fx.contexto.ahora)
      const historial: { rol: 'cliente' | 'bot'; texto: string; en: string }[] = []
      let estado: 'activa' | 'escalada' = 'activa'
      const herramientas = new Set<string>()
      let pedidos = 0
      for (const t of fx.turnos) {
        const r = await evaluarTurno(client, tenantId, historial as never, t.cliente, estado, fx.contexto.canal, sedeId, { ahora, esPrueba: true })
        historial.push({ rol: 'cliente', texto: t.cliente, en: ahora.toISOString() }, { rol: 'bot', texto: r.textoRespuesta, en: ahora.toISOString() })
        r.herramientasUsadas.forEach((h) => herramientas.add(h))
        pedidos += r.pedidosCreados?.length ?? 0
        estado = r.nuevoEstado === 'escalada' ? 'escalada' : 'activa'
        if (estado === 'escalada') break // desde ahí lo atiende una persona
      }
      const textoBot = historial.filter((h) => h.rol === 'bot').map((h) => h.texto).join('\n')
      if (process.env.VER_RESPUESTAS) console.log(`\n=== ${fx.id}\n${historial.map((h) => `${h.rol === 'cliente' ? 'CLIENTE' : 'BOT'}: ${h.texto}`).join('\n')}\n[estado: ${estado}; herramientas: ${[...herramientas].join(', ') || '—'}; pedidos: ${pedidos}]`)

      const e = fx.esperado
      const fallos: string[] = []
      if (e.estadoFinal && estado !== e.estadoFinal) fallos.push(`estado final: esperaba ${e.estadoFinal}, quedó ${estado}`)
      if (e.pedidoCreado !== undefined && (pedidos > 0) !== e.pedidoCreado) fallos.push(`pedido creado: esperaba ${e.pedidoCreado}, hubo ${pedidos}`)
      for (const h of e.herramientas?.incluye ?? []) if (!herramientas.has(h)) fallos.push(`debió usar ${h}`)
      for (const h of e.herramientas?.noIncluye ?? []) if (herramientas.has(h)) fallos.push(`no debió usar ${h}`)
      for (const s of e.textoContiene ?? []) if (!textoBot.toLowerCase().includes(s.toLowerCase())) fallos.push(`el texto debía contener «${s}»`)
      for (const s of e.textoNoContiene ?? []) if (textoBot.toLowerCase().includes(s.toLowerCase())) fallos.push(`el texto NO debía contener «${s}»`)
      for (const r of e.textoContieneRegex ?? []) if (!new RegExp(r, 'i').test(textoBot)) fallos.push(`el texto debía calzar /${r}/`)
      for (const r of e.textoNoContieneRegex ?? []) if (new RegExp(r, 'i').test(textoBot)) fallos.push(`el texto NO debía calzar /${r}/`)
      expect(fallos, `${fx.titulo}\n${historial.map((h) => `${h.rol}: ${h.texto}`).join('\n')}`).toEqual([])
    } finally {
      await client.query('rollback')
    }
  }, 120_000)
})

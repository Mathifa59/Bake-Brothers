// El cliente mezcla producto y tamaño en la misma frase: "carrot cake individual", "porción de cheesecake de
// fresa", "torta de chocolate familiar", "mini red velvet", "caja de alfajores de 18", "alfajores x10".
// El nombre del producto NO trae el tamaño, así que antes el bot respondía que el producto no existía
// (simulador en producción, 2026-10-22: "carrot cake individual" → "no me aparece"). Ahora el tamaño se
// separa del producto y se resuelve contra los tamaños REALES de ese producto.
//
// Parte pura (sin base) + parte contra el catálogo real migrado (se salta sin DATABASE_URL real).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { fechaLimaISO, sumarDiasISO } from '@bakebrothers/domain'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'
import {
  extraerTamano,
  resolverTamano,
  resolverTamanoTexto,
  tienePalabrasDeProducto,
} from '../src/repositories/busquedaTexto.js'
import { consultarPrecio, consultarDisponibilidad, listarCatalogo } from '../src/bot/tools.js'
import { buscarProductosPorTexto } from '../src/repositories/productsRepo.js'
import { validarYValorizarItemsTienda } from '../src/services/pedidosTienda.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

// Etiquetas reales del catálogo (0006).
const TORTA = ['Individual', 'Mini 16cm', 'Familiar 24cm']
const CAJA = ['Caja x10', 'Caja x18']
const PESO = ['200g', '500g', '1kg']

describe('extraerTamano (pura)', () => {
  it.each([
    ['carrot cake individual', 'carrot cake', { clase: 'individual', numeros: [], gramos: null }],
    ['porción de cheesecake de fresa', 'de cheesecake de fresa', { clase: 'individual', numeros: [], gramos: null }],
    ['una porcion de cheesecake', 'una de cheesecake', { clase: 'individual', numeros: [], gramos: null }],
    ['torta de chocolate familiar', 'torta de chocolate', { clase: 'familiar', numeros: [], gramos: null }],
    ['mini red velvet', 'red velvet', { clase: 'mini', numeros: [], gramos: null }],
    ['caja de alfajores de 18', 'caja de alfajores', { clase: null, numeros: [18], gramos: null }],
    ['alfajores x10', 'alfajores', { clase: null, numeros: [10], gramos: null }],
    ['alfajores x 18', 'alfajores', { clase: null, numeros: [18], gramos: null }],
    ['torta de 24 cm', 'torta de', { clase: null, numeros: [24], gramos: null }],
    ['cheesecake de oreo mini 18cm', 'cheesecake de oreo', { clase: 'mini', numeros: [18], gramos: null }],
    ['mil hojas 500g', 'mil hojas', { clase: null, numeros: [], gramos: 500 }],
    ['mil hojas 500 gramos', 'mil hojas', { clase: null, numeros: [], gramos: 500 }],
    ['mil hojas de un kilo', 'mil hojas de', { clase: null, numeros: [], gramos: 1000 }],
    ['medio kilo de mil hojas', 'de mil hojas', { clase: null, numeros: [], gramos: 500 }],
    ['TORTA PERSONAL', 'torta', { clase: 'individual', numeros: [], gramos: null }],
  ])('"%s" → producto "%s" + tamaño', (frase, resto, esperado) => {
    const r = extraerTamano(frase)
    expect(r.texto).toBe(resto)
    expect(r.tamano).toMatchObject(esperado)
  })

  it('una cantidad suelta NO es un tamaño: "2 carrot cake", "12 empanadas", "kero 300ml"', () => {
    for (const frase of ['2 carrot cake', 'quiero 12 empanadas', 'kero 300ml', 'helado 2 bolas']) {
      const r = extraerTamano(frase)
      expect(r.tamano).toBeNull()
      expect(r.texto).toBe(frase) // intacta
    }
  })

  it('guarda lo que dijo el cliente para devolvérselo al modelo', () => {
    expect(extraerTamano('alfajores x10').tamano?.dicho).toBe('x10')
    expect(extraerTamano('mini red velvet').tamano?.dicho).toBe('mini')
  })

  it('tienePalabrasDeProducto: una frase que era solo el tamaño no deja producto', () => {
    expect(tienePalabrasDeProducto(extraerTamano('individual').texto)).toBe(false)
    expect(tienePalabrasDeProducto(extraerTamano('la familiar').texto)).toBe(false)
    expect(tienePalabrasDeProducto(extraerTamano('red velvet individual').texto)).toBe(true)
  })
})

describe('resolverTamano (pura)', () => {
  const resolver = (frase: string, etiquetas: string[]) => {
    const t = extraerTamano(frase).tamano
    return t ? resolverTamano(t, etiquetas) : null
  }

  it('clases y medidas contra las etiquetas reales', () => {
    expect(resolver('individual', TORTA)).toBe('Individual')
    expect(resolver('porcion', TORTA)).toBe('Individual')
    expect(resolver('mini', TORTA)).toBe('Mini 16cm')
    expect(resolver('familiar', TORTA)).toBe('Familiar 24cm')
    expect(resolver('de 24', TORTA)).toBe('Familiar 24cm')
    expect(resolver('mini 16cm', TORTA)).toBe('Mini 16cm')
  })

  it('cajas: x10, de 18, x 18', () => {
    expect(resolver('x10', CAJA)).toBe('Caja x10')
    expect(resolver('de 18', CAJA)).toBe('Caja x18')
    expect(resolver('x 18', CAJA)).toBe('Caja x18')
  })

  it('peso: 500g, 500 gramos, medio kilo, un kilo', () => {
    expect(resolver('500g', PESO)).toBe('500g')
    expect(resolver('500 gramos', PESO)).toBe('500g')
    expect(resolver('medio kilo', PESO)).toBe('500g')
    expect(resolver('un kilo', PESO)).toBe('1kg')
    expect(resolver('200 g', PESO)).toBe('200g')
  })

  it('si el producto no tiene ese tamaño, devuelve null (nunca adivina)', () => {
    expect(resolver('familiar', ['Mini 16cm'])).toBeNull()
    expect(resolver('individual', CAJA)).toBeNull()
    expect(resolver('x25', CAJA)).toBeNull()
    expect(resolver('de 30', TORTA)).toBeNull()
  })

  it('no elige entre dos que calzan por igual', () => {
    expect(resolver('mini', ['Mini 16cm', 'Mini 18cm'])).toBeNull()
    expect(resolver('mini 18cm', ['Mini 16cm', 'Mini 18cm'])).toBe('Mini 18cm')
  })

  it('resolverTamanoTexto: la etiqueta exacta (sin tildes ni mayúsculas) o lo que se entienda', () => {
    expect(resolverTamanoTexto('Familiar 24cm', TORTA)).toBe('Familiar 24cm')
    expect(resolverTamanoTexto('FAMILIAR 24CM', TORTA)).toBe('Familiar 24cm')
    expect(resolverTamanoTexto('Caja x10', CAJA)).toBe('Caja x10')
    expect(resolverTamanoTexto('familiar', TORTA)).toBe('Familiar 24cm')
    expect(resolverTamanoTexto('gigante', TORTA)).toBeNull()
  })
})

describe.skipIf(!hayBaseDeDatosReal)('consultarPrecio con el tamaño en la frase (catálogo real)', () => {
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

  const precio = (frase: string) => consultarPrecio(client, tenantId, frase)

  it('"carrot cake individual" (el caso que falló en producción)', async () => {
    const r = await precio('carrot cake individual')
    expect(r?.nombre).toBe('Carrot Cake')
    expect(r?.tamanoSolicitado).toMatchObject({ encontrado: true, tamano: { tamano: 'Individual', precio: 9.9 } })
    expect(r?.otrasCoincidencias).toBeUndefined()
  })

  it('"porción de cheesecake de fresa"', async () => {
    const r = await precio('porción de cheesecake de fresa')
    expect(r?.nombre).toBe('Cheesecake de Fresa')
    expect(r?.tamanoSolicitado).toMatchObject({ encontrado: true, tamano: { tamano: 'Individual', precio: 9.9 } })
    expect(r?.otrasCoincidencias).toBeUndefined()
  })

  it('"torta de chocolate familiar": gana la torta que SÍ viene en familiar', async () => {
    const r = await precio('torta de chocolate familiar')
    expect(r?.nombre).toBe('Torta de Chocolate con Manjar')
    expect(r?.tamanoSolicitado).toMatchObject({ encontrado: true, tamano: { tamano: 'Familiar 24cm', precio: 79.9 } })
  })

  it('"mini red velvet"', async () => {
    const r = await precio('mini red velvet')
    expect(r?.nombre).toBe('Red Velvet')
    expect(r?.tamanoSolicitado).toMatchObject({ encontrado: true, tamano: { tamano: 'Mini 16cm', precio: 49.9 } })
  })

  it('"caja de alfajores de 18": entiende la caja pero avisa que hay varios sabores', async () => {
    const r = await precio('caja de alfajores de 18')
    expect(r?.nombre).toMatch(/^Alfajor/)
    expect(r?.tamanoSolicitado).toMatchObject({ encontrado: true, tamano: { tamano: 'Caja x18' } })
    expect(r?.otrasCoincidencias?.length).toBe(4)
  })

  it('"alfajores x10": igual, y con un sabor concreto no hay ambigüedad', async () => {
    const r = await precio('alfajores x10')
    expect(r?.tamanoSolicitado).toMatchObject({ encontrado: true, tamano: { tamano: 'Caja x10' } })
    expect(r?.otrasCoincidencias?.length).toBe(4)

    const mix = await precio('alfajor mix x10')
    expect(mix?.nombre).toBe('Alfajor Mix')
    expect(mix?.tamanoSolicitado).toMatchObject({ encontrado: true, tamano: { tamano: 'Caja x10', precio: 12.9 } })
    expect(mix?.otrasCoincidencias).toBeUndefined()
  })

  it('si el tamaño NO existe para ese producto: el producto existe, lo dice y ofrece los que sí hay', async () => {
    const r = await precio('torta de alfajor familiar')
    expect(r).not.toBeNull()
    expect(r?.nombre).toBe('Torta de Alfajor')
    expect(r?.tamanoSolicitado).toEqual({
      pedido: 'familiar',
      encontrado: false,
      tamanosDisponibles: [{ tamano: 'Mini 16cm', precio: 48.5 }],
    })
  })

  it('un tamaño que ningún producto tiene ("carrot cake gigante" no es tamaño; "carrot cake de 30" sí lo es)', async () => {
    const r = await precio('carrot cake de 30')
    expect(r?.nombre).toBe('Carrot Cake')
    expect(r?.tamanoSolicitado?.encontrado).toBe(false)
    expect(r?.tamanoSolicitado?.tamanosDisponibles?.map((t) => t.tamano)).toEqual(TORTA)
  })

  it('peso: "mil hojas 500g", "mil hojas un kilo", "medio kilo de mil hojas"', async () => {
    expect((await precio('mil hojas 500g'))?.tamanoSolicitado).toMatchObject({ encontrado: true, tamano: { tamano: '500g' } })
    expect((await precio('mil hojas un kilo'))?.tamanoSolicitado).toMatchObject({ encontrado: true, tamano: { tamano: '1kg' } })
    expect((await precio('medio kilo de mil hojas'))?.tamanoSolicitado).toMatchObject({ encontrado: true, tamano: { tamano: '500g' } })
  })

  it('un producto cuyo nombre ya trae la palabra gana: "pionono familiar", "empanada de 3 quesos", "brownie caja x16"', async () => {
    expect((await precio('pionono familiar'))?.nombre).toBe('Pionono Familiar')
    expect((await precio('empanada de 3 quesos'))?.nombre).toBe('Empanada 3 Quesos')
    const brownie = await precio('brownie caja x16')
    expect(brownie?.nombre).toBe('Brownie (caja x16)')
    // Sin tamaños en la base: la mención ya es parte del nombre, no hay nada que "no encontrar".
    expect(brownie?.tamanoSolicitado).toBeUndefined()
  })

  it('lo de siempre no cambia: sin tamaño en la frase, slug exacto, cantidades y productos que no existen', async () => {
    const sin = await precio('carrot cake')
    expect(sin?.nombre).toBe('Carrot Cake')
    expect(sin?.tamanoSolicitado).toBeUndefined()
    expect((await precio('torta-carrot-cake'))?.nombre).toBe('Carrot Cake')
    expect((await precio('2 carrot cake'))?.tamanoSolicitado).toBeUndefined()
    expect(await precio('pizza hawaiana individual')).toBeNull()
    expect(await precio('pizza hawaiana')).toBeNull()
  })

  it('consultarDisponibilidad también encuentra el producto con el tamaño en la frase', async () => {
    expect((await consultarDisponibilidad(client, tenantId, 'carrot cake individual'))?.nombre).toBe('Carrot Cake')
    expect((await consultarDisponibilidad(client, tenantId, 'mini red velvet'))?.nombre).toBe('Red Velvet')
  })

  it('listarCatalogo ignora el tamaño al buscar ("cheesecakes individuales")', async () => {
    const r = await listarCatalogo(client, tenantId, 'cheesecakes individuales')
    const nombres = r.grupos.flatMap((g) => g.productos.map((p) => p.nombre))
    expect(nombres).toEqual(expect.arrayContaining(['Cheesecake de Fresa', 'Cheesecake de Oreo']))
  })

  it('buscarProductosPorTexto: el tamaño explícito desempata igual que el de la frase', async () => {
    const r = await buscarProductosPorTexto(client, tenantId, 'torta de chocolate', 'Familiar')
    expect(r.mejor?.nombre).toBe('Torta de Chocolate con Manjar')
  })
})

describe.skipIf(!hayBaseDeDatosReal)('pedidos: validarYValorizarItemsTienda con tamaño tolerante (catálogo real)', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let tenantId: string
  const fecha = sumarDiasISO(fechaLimaISO(), 10)

  beforeAll(async () => {
    client = await pool.connect()
    tenantId = (await client.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
    await client.query('begin')
  })
  afterAll(async () => {
    await client.query('rollback')
    client.release()
    await pool.end()
  })

  const valorizar = (productoId: string, tamano?: string) =>
    validarYValorizarItemsTienda(client, tenantId, [{ productoId, tamano, cantidad: 1 }], fecha)

  it('el tamaño dentro de la frase: se guarda la etiqueta REAL y el precio del tamaño', async () => {
    const r = await valorizar('carrot cake individual')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.items[0]).toMatchObject({ nombreProducto: 'Carrot Cake', tamano: 'Individual', precioUnitario: 9.9 })

    const f = await valorizar('torta de chocolate familiar')
    expect(f.ok).toBe(true)
    if (f.ok) expect(f.items[0]).toMatchObject({ nombreProducto: 'Torta de Chocolate con Manjar', tamano: 'Familiar 24cm', precioUnitario: 79.9 })
  })

  it('el tamaño en el campo aparte, escrito como lo diría un cliente: "familiar", "individual", "mini"', async () => {
    const f = await valorizar('carrot cake', 'familiar')
    expect(f.ok).toBe(true)
    if (f.ok) expect(f.items[0]).toMatchObject({ tamano: 'Familiar 24cm', precioUnitario: 89.9 })

    const m = await valorizar('red velvet', 'Mini')
    expect(m.ok).toBe(true)
    if (m.ok) expect(m.items[0]).toMatchObject({ tamano: 'Mini 16cm', precioUnitario: 49.9 })
  })

  it('la etiqueta exacta sigue funcionando (así lo manda apps/web y el dashboard)', async () => {
    const r = await valorizar('alfajor-mix', 'Caja x10')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.items[0]).toMatchObject({ tamano: 'Caja x10', precioUnitario: 12.9 })
  })

  it('caja de alfajores: "x18" y "de 18" en la frase', async () => {
    const r = await valorizar('alfajor mix x18')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.items[0]).toMatchObject({ nombreProducto: 'Alfajor Mix', tamano: 'Caja x18', precioUnitario: 22.9 })
  })

  it('tamaño que el producto no tiene (en la frase): TAMANO_NO_DISPONIBLE con los que sí hay, no "producto no encontrado"', async () => {
    const r = await valorizar('torta de alfajor familiar')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBe('TAMANO_NO_DISPONIBLE')
      expect(r.detalle).toMatchObject({
        producto: 'Torta de Alfajor',
        tamanoPedido: 'familiar',
        tamanosDisponibles: [{ tamano: 'Mini 16cm', precio: 48.5 }],
      })
    }
  })

  it('tamaño inválido en el campo aparte: TAMANO_INVALIDO, ahora con las opciones', async () => {
    const r = await valorizar('carrot cake', 'gigante')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBe('TAMANO_INVALIDO')
      expect(JSON.stringify(r.detalle)).toContain('Familiar 24cm')
    }
  })

  it('un producto sin tamaños sigue rechazando un tamaño explícito (TAMANO_NO_APLICA)', async () => {
    const r = await valorizar('empanada-de-carne', 'Familiar')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(['TAMANO_NO_APLICA', 'PRODUCTO_NO_ENCONTRADO']).toContain(r.error)
  })

  it('un producto que no existe sigue siendo PRODUCTO_NO_ENCONTRADO', async () => {
    const r = await valorizar('pizza hawaiana individual')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('PRODUCTO_NO_ENCONTRADO')
  })
})

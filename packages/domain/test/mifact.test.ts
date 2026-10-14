import { describe, expect, it } from 'vitest'
import { compararCatalogoMifact, filasDesdeMatriz, parsearPrecio, type FilaMifact, type ItemCatalogo } from '../src/mifact.js'

describe('parsearPrecio', () => {
  it.each([
    [12.9, 12.9],
    ['12.90', 12.9],
    ['12,90', 12.9],
    ['S/ 12.90', 12.9],
    ['S/. 1,234.50', 1234.5],
    ['S/. 12.90.', 12.9],
    ['12.90 soles', 12.9],
    ['1.234,50', 1234.5],
    ['1,234', 1234],
    ['  8 ', 8],
    ['0', 0],
  ])('%s → %s', (entrada, esperado) => {
    expect(parsearPrecio(entrada)).toBe(esperado)
  })

  it.each([[''], [null], [undefined], ['gratis'], [NaN]])('%s → null', (entrada) => {
    expect(parsearPrecio(entrada)).toBeNull()
  })
})

describe('filasDesdeMatriz', () => {
  const encabezado = ['CODIGO PRODUCTO', 'NOMBRE PRODUCTO', 'CATEGORIA', 'PRECIO VENTA', 'CONTROL STOCK', 'ALMACEN', 'UNIDAD MEDIDA']

  it('lee las columnas por nombre y devuelve las filas limpias', () => {
    const r = filasDesdeMatriz([
      encabezado,
      ['P001', 'Alfajor Mix Caja x10', 'Alfajores', 12.9, 'SI', 'Cedros', 'UND'],
      ['P002', '  Carrot   Cake Mini 16cm ', 'Tortas', 'S/ 49.90', 'NO', 'Cedros', 'UND'],
    ])
    expect(r.error).toBeUndefined()
    expect(r.filasLeidas).toBe(2)
    expect(r.filas).toEqual([
      { codigo: 'P001', nombre: 'Alfajor Mix Caja x10', categoria: 'Alfajores', precio: 12.9, controlStock: 'SI', almacenes: ['Cedros'], preciosDistintos: false },
      { codigo: 'P002', nombre: 'Carrot Cake Mini 16cm', categoria: 'Tortas', precio: 49.9, controlStock: 'NO', almacenes: ['Cedros'], preciosDistintos: false },
    ])
  })

  it('encuentra el encabezado aunque haya título y filas en blanco arriba, sin importar tildes ni mayúsculas', () => {
    const r = filasDesdeMatriz([
      ['Corporación Hermanos Loarte S.A.C.'],
      [],
      ['Código Producto', 'Nombre Producto', 'Categoría', 'Precio Venta'],
      ['A1', 'Brownie', 'Postres', 11.9],
    ])
    expect(r.error).toBeUndefined()
    expect(r.filas).toHaveLength(1)
    expect(r.columnas).toMatchObject({ codigo: 'Código Producto', nombre: 'Nombre Producto', precio: 'Precio Venta' })
  })

  it('Mifact repite cada producto por almacén: junta las filas por código y suma los almacenes', () => {
    const r = filasDesdeMatriz([
      encabezado,
      ['P001', 'Alfajor Mix Caja x10', 'Alfajores', 12.9, 'SI', 'Cedros'],
      ['P001', 'Alfajor Mix Caja x10', 'Alfajores', 12.9, 'SI', 'Santa Marina'],
      ['P001', 'Alfajor Mix Caja x10', 'Alfajores', 12.9, 'SI', 'Cedros'], // repetida
    ])
    expect(r.filasLeidas).toBe(3)
    expect(r.filas).toHaveLength(1)
    expect(r.filas[0].almacenes).toEqual(['Cedros', 'Santa Marina'])
    expect(r.filas[0].preciosDistintos).toBe(false)
  })

  it('avisa si el mismo código trae precios distintos en distintas filas', () => {
    const r = filasDesdeMatriz([
      encabezado,
      ['P001', 'Alfajor Mix Caja x10', 'Alfajores', 12.9, 'SI', 'Cedros'],
      ['P001', 'Alfajor Mix Caja x10', 'Alfajores', 13.9, 'SI', 'Santa Marina'],
    ])
    expect(r.filas[0].preciosDistintos).toBe(true)
    expect(r.filas[0].precio).toBe(12.9) // se queda con el primero, sin inventar un promedio
  })

  it('descarta filas sin código o sin nombre y las cuenta; ignora las totalmente vacías', () => {
    const r = filasDesdeMatriz([
      encabezado,
      ['P001', 'Brownie', 'Postres', 11.9],
      ['', 'Sin código', 'Postres', 5],
      ['P003', '', 'Postres', 5],
      [null, null, null, null],
    ])
    expect(r.filas.map((f) => f.codigo)).toEqual(['P001'])
    expect(r.filasLeidas).toBe(3)
    expect(r.filasIncompletas).toBe(2)
  })

  it('las columnas opcionales pueden faltar', () => {
    const r = filasDesdeMatriz([['CODIGO PRODUCTO', 'NOMBRE PRODUCTO'], ['P1', 'Torta']])
    expect(r.filas).toEqual([{ codigo: 'P1', nombre: 'Torta', categoria: null, precio: null, controlStock: null, almacenes: [], preciosDistintos: false }])
  })

  it('un archivo que no es el de Mifact da un error claro, no un resultado vacío en silencio', () => {
    const r = filasDesdeMatriz([['Fecha', 'Cliente', 'Total'], ['2026-10-01', 'Ana', 10]])
    expect(r.filas).toEqual([])
    expect(r.error).toMatch(/CODIGO PRODUCTO.*NOMBRE PRODUCTO/)
  })
})

describe('compararCatalogoMifact', () => {
  const fila = (codigo: string, nombre: string, precio: number | null = null, extra: Partial<FilaMifact> = {}): FilaMifact => ({
    codigo, nombre, categoria: null, precio, controlStock: null, almacenes: [], preciosDistintos: false, ...extra,
  })
  const item = (id: string, nombre: string, precio: number | null, codigoMifact: string | null = null): ItemCatalogo => ({
    tipo: 'producto', id, nombre, precio, codigoMifact,
  })

  const catalogo = [
    item('a', 'Alfajor Mix Caja x10', 12.9),
    item('b', 'Carrot Cake Mini 16cm', 49.9),
    item('c', 'Cheesecake de Oreo Mini 18cm', 59.9),
    item('d', 'Cuchareable', 15.9),
  ]

  it('cruza por nombre ignorando tildes, mayúsculas, "de" y palabras de empaque; marca el precio distinto', () => {
    const r = compararCatalogoMifact(
      [fila('M1', 'ALFAJOR MIX X10', 12.9), fila('M2', 'CHEESECAKE OREO MINI 18 CM', 62.9)],
      catalogo
    )
    const porCodigo = Object.fromEntries(r.coincidencias.map((c) => [c.fila.codigo, c]))
    expect(porCodigo.M1.item.id).toBe('a')
    expect(porCodigo.M1.confianza).toBe('exacta')
    expect(porCodigo.M1.precioDistinto).toBe(false)
    expect(porCodigo.M2.item.id).toBe('c')
    expect(porCodigo.M2.confianza).toBe('exacta')
    expect(porCodigo.M2.precioDistinto).toBe(true)
    expect(porCodigo.M2.diferenciaPrecio).toBe(3) // Mifact − nuestro
    expect(porCodigo.M2.nombreDistinto).toBe(true)
  })

  it('lo que está de un solo lado se lista aparte', () => {
    const r = compararCatalogoMifact([fila('M1', 'Alfajor Mix Caja x10', 12.9), fila('M9', 'Pizza Hawaiana', 30)], catalogo)
    expect(r.soloMifact.map((f) => f.codigo)).toEqual(['M9'])
    expect(r.soloNuestro.map((i) => i.id).sort()).toEqual(['b', 'c', 'd'])
  })

  it('una coincidencia parecida pero no igual es "probable" (para revisar), no exacta', () => {
    const r = compararCatalogoMifact([fila('M2', 'CARROT CAKE MINI', 49.9)], catalogo)
    expect(r.coincidencias).toHaveLength(1)
    expect(r.coincidencias[0]).toMatchObject({ confianza: 'probable', item: { id: 'b' } })
    expect(r.resumen).toMatchObject({ exactas: 0, probables: 1, codigosPorGuardar: 0 })
  })

  it('algo solo vagamente parecido no se cruza: queda en "solo Mifact" con una sugerencia', () => {
    const r = compararCatalogoMifact([fila('M3', 'Cheesecake Oreo')], catalogo)
    expect(r.coincidencias).toEqual([])
    expect(r.soloMifact[0].codigo).toBe('M3')
    expect(r.soloMifact[0].sugerencia?.nombre).toBe('Cheesecake de Oreo Mini 18cm')
    // y algo totalmente distinto no sugiere nada
    expect(compararCatalogoMifact([fila('M4', 'Pizza Hawaiana')], catalogo).soloMifact[0].sugerencia).toBeUndefined()
  })

  it('si el nombre calza con dos productos nuestros es ambiguo y no se asigna a ninguno', () => {
    const dup = [item('x', 'Torta Selva Negra', 50), item('y', 'Torta Selva Negra', 55)]
    const r = compararCatalogoMifact([fila('M5', 'TORTA SELVA NEGRA', 50)], dup)
    expect(r.coincidencias).toEqual([])
    expect(r.ambiguas).toHaveLength(1)
    expect(r.ambiguas[0].candidatos.map((c) => c.id).sort()).toEqual(['x', 'y'])
  })

  it('dos códigos de Mifact con el mismo nombre: solo el primero se asigna, el otro queda ambiguo (nunca se pisa)', () => {
    const r = compararCatalogoMifact([fila('M1', 'Cuchareable', 15.9), fila('M1B', 'CUCHAREABLE', 15.9)], catalogo)
    expect(r.coincidencias.map((c) => c.fila.codigo)).toEqual(['M1'])
    expect(r.ambiguas.map((a) => a.fila.codigo)).toEqual(['M1B'])
  })

  it('un producto que ya tiene código: igual al de Mifact no se vuelve a guardar; distinto no se pisa', () => {
    const conCodigo = [item('a', 'Alfajor Mix Caja x10', 12.9, 'M1'), item('d', 'Cuchareable', 15.9, 'VIEJO')]
    const r = compararCatalogoMifact([fila('M1', 'Alfajor Mix Caja x10', 12.9), fila('M4', 'Cuchareable', 15.9)], conCodigo)
    const por = Object.fromEntries(r.coincidencias.map((c) => [c.fila.codigo, c]))
    expect(por.M1.codigoActual).toBe('igual')
    expect(por.M4.codigoActual).toBe('distinto')
    expect(r.resumen.codigosPorGuardar).toBe(0)
  })

  it('un exacto tiene prioridad sobre uno probable: no le quita el producto', () => {
    const r = compararCatalogoMifact([fila('PROB', 'Carrot Cake Mini'), fila('EXACTO', 'Carrot Cake Mini 16cm')], catalogo)
    const por = Object.fromEntries(r.coincidencias.map((c) => [c.fila.codigo, c]))
    expect(por.EXACTO.confianza).toBe('exacta')
    expect(por.PROB).toBeUndefined()
    expect(r.soloMifact.map((f) => f.codigo)).toContain('PROB')
  })

  it('resumen consistente y sin tocar los datos de entrada (nunca cambia precios)', () => {
    const filas = [fila('M1', 'Alfajor Mix Caja x10', 99), fila('M9', 'Pizza Hawaiana', 30)]
    const antes = JSON.stringify({ filas, catalogo })
    const r = compararCatalogoMifact(filas, catalogo)
    expect(JSON.stringify({ filas, catalogo })).toBe(antes)
    expect(r.resumen).toMatchObject({
      filasMifact: 2, itemsNuestros: 4, exactas: 1, probables: 0, conPrecioDistinto: 1, soloMifact: 1, soloNuestro: 3, ambiguas: 0, codigosPorGuardar: 1,
    })
  })

  it('productos sin precio en alguno de los lados no se marcan como diferencia de precio', () => {
    const r = compararCatalogoMifact([fila('M1', 'Alfajor Mix Caja x10', null)], catalogo)
    expect(r.coincidencias[0]).toMatchObject({ precioDistinto: false, diferenciaPrecio: null })
  })
})

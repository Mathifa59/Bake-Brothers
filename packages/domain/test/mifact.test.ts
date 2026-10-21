import { describe, expect, it } from 'vitest'
import {
  agruparPorProducto,
  compararCatalogoMifact,
  filasDesdeMatriz,
  parsearPrecio,
  type FilaMifact,
  type ItemCatalogo,
} from '../src/mifact.js'

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

describe('filasDesdeMatriz — formato real del export de Mifact', () => {
  // Encabezado REAL (PRODUCTOS_MIFACT_<RUC>.xlsx, 22 columnas).
  const encabezado = [
    'CODIGO', 'CODIGO BARRAS', 'NOMBRE PRODUCTO', 'RUC', 'RAZON SOCIAL', 'CODIGO UNIDAD', 'DESCRIPCION UNIDAD',
    'VALOR UNITARIO', 'PRECIO UNITARIO', 'PRECIO COMPRA', 'MONEDA', 'COD AFECTACION', 'TIPO AFECTACION', 'CATEGORIA',
    'STOCK', 'USUARIO REGISTRADO', 'USUARIO ACTUALIZADO', 'TASA IGV', 'CARACTERISTICA', 'CONTROL STOCK', 'ALMACEN', 'PESO',
  ]
  const fila = (codigo: string, nombre: string, valor: number, precio: number, categoria: string, almacen: string, controlStock = 'NO') => [
    codigo, codigo, nombre, '20612010880', 'BAKER BROTHERS E.I.R.L.', 'EA', 'UNIDAD', valor, precio, 0, 'PEN', '10',
    'Afecto Al IGV Gravado', categoria, 0, 'u@x', 'u@x', 18, '', controlStock, almacen, '0.000',
  ]

  it('lee CODIGO, NOMBRE PRODUCTO, PRECIO UNITARIO (con IGV), CATEGORIA y ALMACEN; ignora VALOR UNITARIO (sin IGV)', () => {
    const r = filasDesdeMatriz([
      encabezado,
      fila('9810070000104', 'Caja de Trufas x 4 ud.', 6.69491525, 7.9, 'CAJAS DULCES', 'CENTRAL'),
    ])
    expect(r.error).toBeUndefined()
    expect(r.columnas).toMatchObject({ codigo: 'CODIGO', nombre: 'NOMBRE PRODUCTO', precio: 'PRECIO UNITARIO', almacen: 'ALMACEN', categoria: 'CATEGORIA' })
    expect(r.filas).toEqual([
      {
        codigo: '9810070000104', codigoBarras: '9810070000104', nombre: 'Caja de Trufas x 4 ud.', categoria: 'CAJAS DULCES',
        precio: 7.9, controlStock: 'NO', almacen: 'CENTRAL',
      },
    ])
  })

  it('Mifact tiene una fila por producto POR ALMACÉN, cada una con su código: no se juntan', () => {
    const r = filasDesdeMatriz([
      encabezado,
      fila('A1', 'Mini Carrot cake', 42, 49.9, 'TORTAS MINIS', 'CENTRAL'),
      fila('A2', 'Mini Carrot cake', 41, 48.5, 'TORTAS MINIS', 'santa marina'),
      fila('A3', 'Mini Carrot cake', 42, 49.9, 'TORTAS MINIS', 'TODOS'),
    ])
    expect(r.filas.map((f) => [f.codigo, f.almacen, f.precio])).toEqual([
      ['A1', 'CENTRAL', 49.9],
      ['A2', 'santa marina', 48.5],
      ['A3', 'TODOS', 49.9],
    ])
    expect(r.filasLeidas).toBe(3)
  })

  it('solo junta una fila totalmente repetida (mismo código) y la cuenta', () => {
    const f = fila('A1', 'Brownie', 9, 11.9, 'PORCIONES', 'CENTRAL')
    const r = filasDesdeMatriz([encabezado, f, f])
    expect(r.filas).toHaveLength(1)
    expect(r.filasRepetidas).toBe(1)
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
    expect(r.filas[0]).toMatchObject({ codigo: 'A1', precio: 11.9, almacen: null })
  })

  it('descarta filas sin código o sin nombre y las cuenta; ignora las totalmente vacías', () => {
    const r = filasDesdeMatriz([
      encabezado,
      fila('P001', 'Brownie', 9, 11.9, 'PORCIONES', 'CENTRAL'),
      fila('', 'Sin código', 1, 5, 'X', 'CENTRAL'),
      fila('P003', '', 1, 5, 'X', 'CENTRAL'),
      [null, null, null],
    ])
    expect(r.filas.map((f) => f.codigo)).toEqual(['P001'])
    expect(r.filasLeidas).toBe(3)
    expect(r.filasIncompletas).toBe(2)
  })

  it('las columnas opcionales pueden faltar', () => {
    const r = filasDesdeMatriz([['CODIGO', 'NOMBRE PRODUCTO'], ['P1', 'Torta']])
    expect(r.filas).toEqual([{ codigo: 'P1', codigoBarras: null, nombre: 'Torta', categoria: null, precio: null, controlStock: null, almacen: null }])
  })

  it('un archivo que no es el de Mifact da un error claro, no un resultado vacío en silencio', () => {
    const r = filasDesdeMatriz([['Fecha', 'Cliente', 'Total'], ['2026-10-01', 'Ana', 10]])
    expect(r.filas).toEqual([])
    expect(r.error).toMatch(/CODIGO.*NOMBRE PRODUCTO/)
  })
})

describe('compararCatalogoMifact', () => {
  const fila = (codigo: string, nombre: string, precio: number | null = null, almacen: string | null = null, categoria: string | null = null): FilaMifact => ({
    codigo, codigoBarras: null, nombre, categoria, precio, controlStock: null, almacen,
  })
  const item = (id: string, nombre: string, precio: number | null, codigos: ItemCatalogo['codigos'] = []): ItemCatalogo => ({
    tipo: 'producto', id, nombre, precio, codigos,
  })

  const catalogo = [
    item('a', 'Alfajor Mix Caja x10', 12.9),
    item('b', 'Carrot Cake Mini 16cm', 49.9),
    item('c', 'Cheesecake de Oreo Mini 18cm', 59.9),
    item('d', 'Cuchareable', 15.9),
    item('e', 'Carrot Cake Individual', 9.9),
  ]

  it('agrupa las filas de Mifact con el mismo nombre (una por almacén) en un solo producto', () => {
    const grupos = agruparPorProducto([
      fila('A1', 'Mini Carrot cake', 49.9, 'CENTRAL'),
      fila('A2', 'MINI CARROT CAKE', 48.5, 'santa marina'),
      fila('B1', 'Cuchareable', 15.9, 'TODOS'),
    ])
    expect(grupos).toHaveLength(2)
    expect(grupos[0].variantes.map((v) => v.codigo)).toEqual(['A1', 'A2'])
  })

  it('cruza por nombre ignorando tildes, mayúsculas, "de", empaque ("caja", "ud.") y orden; marca el precio distinto', () => {
    const r = compararCatalogoMifact(
      [fila('M1', 'ALFAJOR MIX X 10 UD.', 12.9, 'CENTRAL'), fila('M2', 'CHEESECAKE OREO MINI 18 CM', 62.9, 'CENTRAL')],
      catalogo
    )
    const por = Object.fromEntries(r.coincidencias.map((c) => [c.producto.variantes[0].codigo, c]))
    expect(por.M1.item.id).toBe('a')
    expect(por.M1.confianza).toBe('exacta')
    expect(por.M1.precioDistinto).toBe(false)
    expect(por.M2.item.id).toBe('c')
    expect(por.M2.confianza).toBe('exacta')
    expect(por.M2.precioDistinto).toBe(true)
    expect(por.M2.variantes[0].diferenciaPrecio).toBe(3) // Mifact − nuestro
    expect(por.M2.nombreDistinto).toBe(true)
  })

  it('"(porcion)" de Mifact es nuestro tamaño "Individual"', () => {
    const r = compararCatalogoMifact([fila('P1', 'Carrot cake (porcion)', 9.9, 'CENTRAL')], catalogo)
    expect(r.coincidencias[0]).toMatchObject({ confianza: 'exacta', item: { id: 'e' } })
  })

  it('un producto con varios almacenes cruza UNA vez y guarda un código por almacén', () => {
    const r = compararCatalogoMifact(
      [fila('C1', 'Cuchareable', 15.9, 'CENTRAL'), fila('C2', 'Cuchareable', 15.9, 'santa marina'), fila('C3', 'Cuchareable', 16.9, 'TODOS')],
      catalogo
    )
    expect(r.ambiguas).toEqual([])
    expect(r.coincidencias).toHaveLength(1)
    const c = r.coincidencias[0]
    expect(c.variantes.map((v) => [v.fila.almacen, v.fila.codigo, v.codigo, v.precioDistinto])).toEqual([
      ['CENTRAL', 'C1', 'nuevo', false],
      ['santa marina', 'C2', 'nuevo', false],
      ['TODOS', 'C3', 'nuevo', true],
    ])
    expect(c.preciosDistintosEntreAlmacenes).toBe(true)
    expect(r.resumen).toMatchObject({ filasMifact: 3, productosMifact: 1, exactas: 1, codigosPorGuardar: 3 })
  })

  it('lo que está de un solo lado se lista aparte', () => {
    const r = compararCatalogoMifact([fila('M1', 'Alfajor Mix Caja x10', 12.9), fila('M9', 'Pizza Hawaiana', 30, null, 'COMIDA')], catalogo)
    expect(r.soloMifact.map((p) => p.variantes[0].codigo)).toEqual(['M9'])
    expect(r.soloMifact[0].categoria).toBe('COMIDA')
    expect(r.soloNuestro.map((i) => i.id).sort()).toEqual(['b', 'c', 'd', 'e'])
  })

  it('una coincidencia parecida pero no igual es "probable" (para revisar), no exacta: no se guardan sus códigos', () => {
    const r = compararCatalogoMifact([fila('M2', 'MINI CARROT CAKE', 49.9, 'CENTRAL')], catalogo)
    expect(r.coincidencias).toHaveLength(1)
    expect(r.coincidencias[0]).toMatchObject({ confianza: 'probable', item: { id: 'b' } })
    expect(r.resumen).toMatchObject({ exactas: 0, probables: 1, codigosPorGuardar: 0 })
  })

  it('algo solo vagamente parecido no se cruza: queda en "solo Mifact" con una sugerencia', () => {
    const r = compararCatalogoMifact([fila('M3', 'Cheesecake Oreo')], catalogo)
    expect(r.coincidencias).toEqual([])
    expect(r.soloMifact[0].variantes[0].codigo).toBe('M3')
    expect(r.soloMifact[0].sugerencia?.nombre).toBe('Cheesecake de Oreo Mini 18cm')
    expect(compararCatalogoMifact([fila('M4', 'Pizza Hawaiana')], catalogo).soloMifact[0].sugerencia).toBeUndefined()
  })

  it('un ítem "(catering)" de Mifact no se sugiere ni se cruza con el producto de tienda parecido', () => {
    const r = compararCatalogoMifact([fila('K1', 'Alfajor Mix (catering)', 1.42, 'TODOS')], catalogo)
    expect(r.coincidencias).toEqual([])
    expect(r.soloMifact[0].sugerencia).toBeUndefined()
  })

  it('si el nombre calza con dos productos nuestros es ambiguo y no se asigna a ninguno', () => {
    const dup = [item('x', 'Torta Selva Negra', 50), item('y', 'Torta Selva Negra', 55)]
    const r = compararCatalogoMifact([fila('M5', 'TORTA SELVA NEGRA', 50)], dup)
    expect(r.coincidencias).toEqual([])
    expect(r.ambiguas).toHaveLength(1)
    expect(r.ambiguas[0].candidatos.map((c) => c.id).sort()).toEqual(['x', 'y'])
  })

  it('dos productos de Mifact distintos que caen sobre el mismo producto nuestro: solo el primero se asigna (nunca se pisa)', () => {
    const r = compararCatalogoMifact([fila('M1', 'Cuchareable', 15.9), fila('M1B', 'Cuchareable x 1 ud.', 15.9), fila('M7', 'Cuchareable pack', 1)], catalogo)
    expect(r.coincidencias).toHaveLength(1)
    expect(r.coincidencias[0].item.id).toBe('d')
  })

  it('códigos ya guardados: el mismo no se vuelve a guardar; uno distinto en ese almacén no se pisa', () => {
    const conCodigos = [
      item('a', 'Alfajor Mix Caja x10', 12.9, [{ almacen: 'CENTRAL', codigo: 'M1' }]),
      item('d', 'Cuchareable', 15.9, [{ almacen: 'central', codigo: 'VIEJO' }]),
    ]
    const r = compararCatalogoMifact(
      [fila('M1', 'Alfajor Mix Caja x10', 12.9, 'CENTRAL'), fila('M4', 'Cuchareable', 15.9, 'CENTRAL'), fila('M5', 'Cuchareable', 15.9, 'santa marina')],
      conCodigos
    )
    const por = Object.fromEntries(r.coincidencias.map((c) => [c.item.id, c]))
    expect(por.a.variantes[0].codigo).toBe('igual')
    expect(por.d.variantes.map((v) => [v.fila.almacen, v.codigo, v.codigoActual])).toEqual([
      ['CENTRAL', 'distinto', 'VIEJO'],
      ['santa marina', 'nuevo', undefined],
    ])
    expect(r.resumen.codigosPorGuardar).toBe(1)
  })

  it('un exacto tiene prioridad sobre uno probable: no le quita el producto', () => {
    const r = compararCatalogoMifact([fila('PROB', 'Carrot Cake Mini'), fila('EXACTO', 'Carrot Cake Mini 16cm')], catalogo)
    const por = Object.fromEntries(r.coincidencias.map((c) => [c.producto.variantes[0].codigo, c]))
    expect(por.EXACTO.confianza).toBe('exacta')
    expect(por.PROB).toBeUndefined()
    expect(r.soloMifact.map((p) => p.variantes[0].codigo)).toContain('PROB')
  })

  it('resumen consistente y sin tocar los datos de entrada (nunca cambia precios)', () => {
    const filas = [fila('M1', 'Alfajor Mix Caja x10', 99), fila('M9', 'Pizza Hawaiana', 30)]
    const antes = JSON.stringify({ filas, catalogo })
    const r = compararCatalogoMifact(filas, catalogo)
    expect(JSON.stringify({ filas, catalogo })).toBe(antes)
    expect(r.resumen).toMatchObject({
      filasMifact: 2, productosMifact: 2, itemsNuestros: 5, exactas: 1, probables: 0, conPrecioDistinto: 1, soloMifact: 1, soloNuestro: 4, ambiguas: 0, codigosPorGuardar: 1,
    })
  })

  it('productos sin precio en alguno de los lados no se marcan como diferencia de precio', () => {
    const r = compararCatalogoMifact([fila('M1', 'Alfajor Mix Caja x10', null)], catalogo)
    expect(r.coincidencias[0].variantes[0]).toMatchObject({ precioDistinto: false, diferenciaPrecio: null })
  })
})

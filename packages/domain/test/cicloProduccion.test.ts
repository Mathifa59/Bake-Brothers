import { describe, expect, it } from 'vitest'
import {
  armarEmpaqueMayorista,
  armarHojaProduccion,
  armarPlanDelDia,
  esDomingoISO,
  estadoEquipo,
  evaluarCorteOrden,
  minutosDelDia,
  posicionSabor,
  saborDeEmpanada,
  saleAntesDeLas8,
  type LineaDemanda,
  type LineaVitrina,
} from '../src/index.js'

describe('hora de un pedido', () => {
  it.each([
    ['7:30', 450],
    ['07:30', 450],
    ['7:30 am', 450],
    ['7:30 a. m.', 450],
    ['4pm', 960],
    ['4:30 p. m.', 990],
    ['12pm', 720],
    ['12am', 0],
    ['16:00', 960],
    ['10am', 600],
    ['7:30–8:00', 450],
    ['7:30 a 8:00', 450],
    ['  8 ', 480],
  ])('%s → %i min', (txt, esperado) => expect(minutosDelDia(txt)).toBe(esperado))

  it.each(['', null, undefined, 'mañana', 'por la tarde', '25:00', '7:75', '13pm', '0pm'])(
    'no se entiende (%s) → null, nunca se adivina',
    (txt) => expect(minutosDelDia(txt as string)).toBeNull()
  )

  it('antes de las 8:00 a. m.: 7:59 sí, 8:00 no, y sin hora clara no cuenta', () => {
    expect(saleAntesDeLas8('7:59')).toBe(true)
    expect(saleAntesDeLas8('7:30–8:00')).toBe(true)
    expect(saleAntesDeLas8('8:00')).toBe(false)
    expect(saleAntesDeLas8('4pm')).toBe(false)
    expect(saleAntesDeLas8('temprano')).toBe(false)
    expect(saleAntesDeLas8(null)).toBe(false)
  })
})

describe('corte de las 10:30 p. m. (hora de Lima)', () => {
  // Lima = UTC-5: 22:29 Lima = 03:29Z del día siguiente.
  const lima = (fecha: string, hhmm: string) => new Date(`${fecha}T${hhmm}:00-05:00`)

  it('para mañana, a las 10:29 p. m. de hoy → a tiempo', () => {
    expect(evaluarCorteOrden(lima('2026-11-06', '22:29'), '2026-11-07')).toEqual({ fueraDeCorte: false, motivo: null })
  })
  it('para mañana, a las 10:30 p. m. en punto → fuera de corte (avisa, no bloquea)', () => {
    expect(evaluarCorteOrden(lima('2026-11-06', '22:30'), '2026-11-07')).toEqual({ fueraDeCorte: true, motivo: 'pasado_el_corte' })
    expect(evaluarCorteOrden(lima('2026-11-06', '23:59'), '2026-11-07').fueraDeCorte).toBe(true)
  })
  it('usa la hora de Lima aunque el servidor esté en UTC: 10:45 p. m. Lima ya es el día siguiente en UTC', () => {
    // 03:45Z del 07/11 = 22:45 del 06/11 en Lima: «mañana» es el 07, y ya pasó el corte (leído en UTC, el 07 sería «hoy»).
    expect(evaluarCorteOrden(new Date('2026-11-07T03:45:00Z'), '2026-11-07').motivo).toBe('pasado_el_corte')
    expect(evaluarCorteOrden(new Date('2026-11-07T03:45:00Z'), '2026-11-08').fueraDeCorte).toBe(false)
  })
  it('para hoy o una fecha pasada → fuera de corte', () => {
    expect(evaluarCorteOrden(lima('2026-11-06', '09:00'), '2026-11-06')).toEqual({ fueraDeCorte: true, motivo: 'para_hoy_o_antes' })
    expect(evaluarCorteOrden(lima('2026-11-06', '09:00'), '2026-11-04').fueraDeCorte).toBe(true)
  })
  it('para pasado mañana o más: todavía no llega su corte', () => {
    expect(evaluarCorteOrden(lima('2026-11-06', '23:30'), '2026-11-08').fueraDeCorte).toBe(false)
  })
})

describe('vocabulario del equipo', () => {
  it('Confirmado, En preparación, Listo, Despachado, Anulado', () => {
    expect(estadoEquipo('confirmed')).toBe('Confirmado')
    expect(estadoEquipo('paid')).toBe('Confirmado')
    expect(estadoEquipo('in_production')).toBe('En preparación')
    expect(estadoEquipo('out_for_delivery')).toBe('Listo')
    expect(estadoEquipo('delivered')).toBe('Despachado')
    expect(estadoEquipo('cancelled')).toBe('Anulado')
    expect(estadoEquipo('payment_pending')).toBe('Por pagar')
  })
})

describe('plan del día: lo que se produce por pedido + lo que se produce para vitrina', () => {
  const dem = (o: Partial<LineaDemanda> & { nombre: string }): LineaDemanda => ({
    origen: 'producto',
    productId: `id-${o.nombre}`,
    tamano: null,
    cantidad: 1,
    hora: '10:00',
    pedido: 'BB-1',
    area: 'pasteleria',
    ...o,
  })
  const vit = (o: Partial<LineaVitrina> & { nombre: string }): LineaVitrina => ({
    productId: `id-${o.nombre}`,
    tamano: null,
    cantidad: 10,
    cantidadDomingo: null,
    area: 'pasteleria',
    ...o,
  })
  const LUNES = '2026-11-09'
  const DOMINGO = '2026-11-08'

  it('suma varios pedidos del mismo producto y tamaño, y no mezcla tamaños', () => {
    const plan = armarPlanDelDia(LUNES, [
      dem({ nombre: 'Carrot Cake', tamano: 'Individual', cantidad: 2, pedido: 'BB-1' }),
      dem({ nombre: 'Carrot Cake', tamano: 'Individual', cantidad: 3, pedido: 'BB-2' }),
      dem({ nombre: 'Carrot Cake', tamano: 'Familiar 24cm', cantidad: 1, pedido: 'BB-3' }),
    ], [])
    expect(plan).toHaveLength(2)
    const ind = plan.find((l) => l.tamano === 'Individual')!
    expect(ind).toMatchObject({ porPedido: 5, vitrina: 0, total: 5, pedidos: ['BB-1', 'BB-2'] })
    expect(plan.find((l) => l.tamano === 'Familiar 24cm')!.total).toBe(1)
  })

  it('pedido + vitrina del mismo producto van en la misma fila, con las dos partes', () => {
    const plan = armarPlanDelDia(LUNES, [dem({ nombre: 'Empanada de Pollo', cantidad: 30 })], [vit({ nombre: 'Empanada de Pollo', cantidad: 20 })])
    expect(plan).toHaveLength(1)
    expect(plan[0]).toMatchObject({ porPedido: 30, vitrina: 20, total: 50 })
  })

  it('el domingo usa la cantidad del domingo; null = la de siempre; 0 = no se produce', () => {
    const v = [
      vit({ nombre: 'A', cantidad: 10, cantidadDomingo: 4 }),
      vit({ nombre: 'B', cantidad: 10, cantidadDomingo: null }),
      vit({ nombre: 'C', cantidad: 10, cantidadDomingo: 0 }),
    ]
    expect(esDomingoISO(DOMINGO)).toBe(true)
    expect(esDomingoISO(LUNES)).toBe(false)
    const domingo = armarPlanDelDia(DOMINGO, [], v)
    expect(domingo.map((l) => [l.nombre, l.vitrina])).toEqual([['A', 4], ['B', 10]])
    const lunes = armarPlanDelDia(LUNES, [], v)
    expect(lunes.map((l) => [l.nombre, l.vitrina])).toEqual([['A', 10], ['B', 10], ['C', 10]])
  })

  it('lo que sale antes de las 8:00 a. m. se cuenta aparte, solo de la parte por pedido', () => {
    const plan = armarPlanDelDia(LUNES, [
      dem({ nombre: 'Empanada de Carne', cantidad: 12, hora: '7:30' }),
      dem({ nombre: 'Empanada de Carne', cantidad: 8, hora: '10:00', pedido: 'BB-2' }),
    ], [vit({ nombre: 'Empanada de Carne', cantidad: 15 })])
    expect(plan[0]).toMatchObject({ porPedido: 20, antesDe8: 12, vitrina: 15, total: 35 })
  })

  it('lo producido se asocia por producto y tamaño; sin marcar es null', () => {
    const plan = armarPlanDelDia(LUNES, [dem({ nombre: 'X', tamano: 'Individual' }), dem({ nombre: 'Y' })], [], [
      { productId: 'id-X', tamano: 'Individual', cantidadProducida: 1 },
    ])
    expect(plan.find((l) => l.nombre === 'X')!.producida).toBe(1)
    expect(plan.find((l) => l.nombre === 'Y')!.producida).toBeNull()
  })

  it('lo que no se produce (bebidas) y las cantidades en cero no entran', () => {
    const plan = armarPlanDelDia(LUNES, [dem({ nombre: 'Inka Kola', modo: 'no_produce', area: null }), dem({ nombre: 'Z', cantidad: 0 })], [])
    expect(plan).toEqual([])
  })

  it('el catering va por su ítem (y por sabor la mini), no se mezcla con productos', () => {
    const plan = armarPlanDelDia(LUNES, [
      dem({ origen: 'catering', productId: null, cateringItemId: 'mini', nombre: 'Mini empanadas (todos los sabores)', sabor: 'Pollo', cantidad: 50, area: 'empanaderia' }),
      dem({ origen: 'catering', productId: null, cateringItemId: 'mini', nombre: 'Mini empanadas (todos los sabores)', sabor: 'Carne', cantidad: 30, area: 'empanaderia' }),
    ], [])
    expect(plan.map((l) => [l.sabor, l.total])).toEqual([['Carne', 30], ['Pollo', 50]])
  })

  it('orden: por área (pastelería, empanadería, cocina…) y luego por nombre', () => {
    const plan = armarPlanDelDia(LUNES, [
      dem({ nombre: 'Sándwich', area: 'cocina' }),
      dem({ nombre: 'Empanada de Lomo', area: 'empanaderia' }),
      dem({ nombre: 'Torta', area: 'pasteleria' }),
      dem({ nombre: 'Sin área', area: null }),
    ], [])
    expect(plan.map((l) => l.nombre)).toEqual(['Torta', 'Empanada de Lomo', 'Sándwich', 'Sin área'])
  })
})

describe('hoja de producción', () => {
  const emp = (nombre: string, tamano: string | null, cantidad: number, hora = '10:00', pedido = 'BB-1'): LineaDemanda => ({
    origen: 'producto', productId: `id-${nombre}`, nombre, tamano, cantidad, hora, pedido, area: 'empanaderia', esEmpanada: true,
  })
  const mini = (sabor: string | null, cantidad: number): LineaDemanda => ({
    origen: 'catering', cateringItemId: 'mini', nombre: 'Mini empanadas (todos los sabores)', tamano: null, sabor, cantidad,
    hora: '12:00', pedido: 'BB-9', area: 'empanaderia',
  })

  const plan = armarPlanDelDia(
    '2026-11-09',
    [
      emp('Empanada de Carne', 'Mediana', 40, '7:30', 'BB-1'),
      emp('Empanada de Pollo', 'Mediana', 60, '7:30', 'BB-1'),
      emp('Empanada de Pollo', null, 24, '10:00', 'BB-2'),
      emp('Empanada 3 Quesos', 'Mediana', 12, '7:45', 'BB-3'),
      emp('Empanada Cabanozzi', null, 6, '10:00', 'BB-2'),
      mini('Pollo', 50),
      mini(null, 20),
      { origen: 'producto', productId: 'id-brownie', nombre: 'Brownie (caja x16)', tamano: null, cantidad: 3, hora: '7:30', pedido: 'BB-1', area: 'pasteleria' },
      { origen: 'catering', cateringItemId: 'teq', nombre: 'Tequeños (mixtos/queso)', tamano: null, cantidad: 100, hora: '12:00', pedido: 'BB-8', area: 'cocina' },
    ],
    [{ productId: 'id-Empanada de Pollo', nombre: 'Empanada de Pollo', tamano: null, cantidad: 30, cantidadDomingo: null, area: 'empanaderia', esEmpanada: true }]
  )
  const hoja = armarHojaProduccion(plan)

  it('primero lo que sale antes de las 8:00 a. m., solo por pedido', () => {
    expect(hoja.antesDe8.map((l) => [l.nombre, l.tamano, l.cantidad])).toEqual([
      ['Brownie (caja x16)', null, 3],
      ['Empanada 3 Quesos', 'Mediana', 12],
      ['Empanada de Carne', 'Mediana', 40],
      ['Empanada de Pollo', 'Mediana', 60],
    ])
  })

  it('empanadas por sabor: medianas, grandes, mini y total; la vitrina suma a las grandes', () => {
    const f = Object.fromEntries(hoja.empanadas.filas.map((x) => [x.sabor, x]))
    expect(f['Pollo']).toEqual({ sabor: 'Pollo', mediana: 60, grande: 24 + 30, mini: 50, total: 60 + 54 + 50 })
    expect(f['Carne']).toMatchObject({ mediana: 40, grande: 0, mini: 0, total: 40 })
    expect(f['Cabanozzi']).toMatchObject({ grande: 6, total: 6 })
    expect(f['3 Quesos']).toMatchObject({ mediana: 12, total: 12 })
    expect(f['Sin sabor indicado']).toMatchObject({ mini: 20, total: 20 })
  })

  it('los sabores salen en el orden del equipo, y los totales cuadran con las filas', () => {
    const sabores = hoja.empanadas.filas.map((x) => x.sabor)
    expect(sabores.indexOf('Pollo')).toBeLessThan(sabores.indexOf('Carne'))
    expect(sabores.indexOf('Carne')).toBeLessThan(sabores.indexOf('Cabanozzi'))
    expect(sabores.indexOf('Cabanozzi')).toBeLessThan(sabores.indexOf('3 Quesos'))
    expect(sabores.at(-1)).toBe('Sin sabor indicado') // lo que no está en la lista, al final
    const t = hoja.empanadas.totales
    expect(t.total).toBe(hoja.empanadas.filas.reduce((n, x) => n + x.total, 0))
    expect(t.mediana + t.grande + t.mini).toBe(t.total)
  })

  it('catering y otros por área, sin repetir las empanadas', () => {
    expect(hoja.porArea.map((a) => a.nombre)).toEqual(['Pastelería', 'Cocina'])
    expect(hoja.porArea[0].lineas.map((l) => l.nombre)).toEqual(['Brownie (caja x16)'])
    expect(hoja.porArea[1].lineas.map((l) => l.nombre)).toEqual(['Tequeños (mixtos/queso)'])
  })

  it('sabores: «Cabanossi» y «Tres Quesos» son los mismos de la lista', () => {
    expect(posicionSabor('Cabanossi')).toBe(posicionSabor('Cabanozzi'))
    expect(posicionSabor('Tres quesos')).toBe(posicionSabor('3 Quesos'))
    expect(posicionSabor('Sabor raro')).toBeGreaterThan(posicionSabor('Carnívora'))
    expect(saborDeEmpanada('Empanada de Pollo con Champiñón')).toBe('Pollo con Champiñón')
    expect(saborDeEmpanada('Empanada 3 Quesos')).toBe('3 Quesos')
  })
})

describe('hoja de empaque mayorista', () => {
  const linea = (nombre: string, tamano: string | null, cantidad: number, esEmpanada = true) => ({ nombre, tamano, cantidad, esEmpanada })
  const ordenes = [
    { pedido: 'BB-2', cliente: 'Panadería Sol', hora: '7:45', lineas: [linea('Empanada de Carne', 'Mediana', 10), linea('Empanada de Pollo', 'Mediana', 20), linea('Brownie (caja x16)', null, 2, false)] },
    { pedido: 'BB-1', cliente: 'Bodega Luz', hora: '7:30', fueraDeCorte: true, lineas: [linea('Empanada de Pollo', null, 24), linea('Empanada de Pollo', 'Mediana', 6)] },
    { pedido: 'BB-3', cliente: 'Café Ana', hora: null, lineas: [linea('Empanada Hawaiana', null, 12)] },
    { pedido: 'BB-4', cliente: 'Solo Postres', hora: '7:00', lineas: [linea('Cheesecake de Fresa', 'Individual', 6, false)] },
  ]
  const bloques = armarEmpaqueMayorista(ordenes, minutosDelDia)

  it('un bloque por cliente, por hora de despacho (sin hora, al final)', () => {
    expect(bloques.map((b) => b.cliente)).toEqual(['Solo Postres', 'Bodega Luz', 'Panadería Sol', 'Café Ana'])
  })
  it('tamaño, cantidades por sabor en el orden del equipo, total y postres', () => {
    const sol = bloques.find((b) => b.cliente === 'Panadería Sol')!
    expect(sol).toMatchObject({ hora: '7:45', tamano: 'Mediana', totalEmpanadas: 30 })
    expect(sol.sabores).toEqual([
      { sabor: 'Pollo', cantidad: 20, mediana: 20, grande: 0 },
      { sabor: 'Carne', cantidad: 10, mediana: 10, grande: 0 },
    ])
    expect(sol.postres).toEqual([{ nombre: 'Brownie (caja x16)', tamano: null, cantidad: 2 }])
  })
  it('si pide de los dos tamaños el bloque dice Mixto, y avisa si llegó fuera de corte', () => {
    const luz = bloques.find((b) => b.cliente === 'Bodega Luz')!
    expect(luz.tamano).toBe('Mixto')
    // Para empacar a un cliente Mixto hay que saber cuántas son medianas y cuántas grandes de cada sabor.
    expect(luz.sabores).toEqual([{ sabor: 'Pollo', cantidad: 30, mediana: 6, grande: 24 }])
    expect(luz.fueraDeCorte).toBe(true)
  })
  it('un cliente que solo pidió postres no tiene tamaño ni empanadas', () => {
    const solo = bloques.find((b) => b.cliente === 'Solo Postres')!
    expect(solo).toMatchObject({ tamano: null, totalEmpanadas: 0, sabores: [] })
    expect(solo.postres).toHaveLength(1)
  })
})

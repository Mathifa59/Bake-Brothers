import { describe, expect, it } from 'vitest'
import {
  SABORES_MAYORISTA,
  abreviaturaDeSabor,
  armarAgendados,
  armarFilasMayoristas,
  armarHorasCriticas,
  horaDeHoja,
  medioPagoDeHoja,
  prioridadDeProduccion,
  produccionMadrugada,
  type BloqueMayorista,
  type LineaDemanda,
  type PedidoAgendado,
} from '../src/index.js'

describe('prioridad de producción — las 3 reglas de su Excel', () => {
  it('con producción de madrugada: ALTA hasta las 8:00 INCLUSIVE, MEDIA hasta las 12:00 inclusive, NORMAL después', () => {
    expect(prioridadDeProduccion('7:30 a. m.', true)).toBe('ALTA')
    expect(prioridadDeProduccion('8:00', true)).toBe('ALTA') // el límite entra
    expect(prioridadDeProduccion('8:01', true)).toBe('MEDIA')
    expect(prioridadDeProduccion('10:00', true)).toBe('MEDIA')
    expect(prioridadDeProduccion('12:00', true)).toBe('MEDIA') // el límite entra
    expect(prioridadDeProduccion('12:01', true)).toBe('NORMAL')
    expect(prioridadDeProduccion('3:30 p. m.', true)).toBe('NORMAL')
  })

  it('SIN producción de madrugada es NORMAL aunque salga a las 7:30 (sus pedidos de cocina de las 7:30 salen NORMAL)', () => {
    expect(prioridadDeProduccion('7:30', false)).toBe('NORMAL')
    expect(prioridadDeProduccion('8:00', false)).toBe('NORMAL')
  })

  it('sin hora o con una hora que no se entiende: NORMAL (nunca se adivina)', () => {
    expect(prioridadDeProduccion(null, true)).toBe('NORMAL')
    expect(prioridadDeProduccion('por la tarde', true)).toBe('NORMAL')
  })

  it('producción de madrugada = empanada o mini empanada; croissants, petipanes y pastelería no', () => {
    expect(produccionMadrugada({ esEmpanada: true, nombre: 'Empanada de Pollo' })).toBe(true)
    expect(produccionMadrugada({ nombre: 'Mini Empanada variada (catering)' })).toBe(true)
    expect(produccionMadrugada({ nombre: 'Mini croissant mixto (catering)' })).toBe(false)
    expect(produccionMadrugada({ nombre: 'Petipan con pollo (catering)' })).toBe(false)
    expect(produccionMadrugada({ esEmpanada: false, nombre: 'Caja de Alfajores con manjar x 18 ud.' })).toBe(false)
  })
})

describe('formato de la hoja', () => {
  it('la hora sale como «7:30 a.m.» / «2:30 p.m.»', () => {
    expect(horaDeHoja('07:30')).toBe('7:30 a.m.')
    expect(horaDeHoja('14:30')).toBe('2:30 p.m.')
    expect(horaDeHoja('12:00')).toBe('12:00 p.m.')
    expect(horaDeHoja('00:30')).toBe('12:30 a.m.')
    expect(horaDeHoja(null)).toBe('')
    expect(horaDeHoja('')).toBe('')
    expect(horaDeHoja('a la tarde')).toBe('a la tarde')
  })

  it('medio de pago con el vocabulario del equipo', () => {
    expect(medioPagoDeHoja('yape')).toBe('YAPE')
    expect(medioPagoDeHoja('tarjeta')).toBe('LINK IZIPAY')
    expect(medioPagoDeHoja('contraentrega')).toBe('CANCELÓ EN TIENDA')
    expect(medioPagoDeHoja(null)).toBe('')
  })

  it('las 10 abreviaturas de sabor', () => {
    expect(SABORES_MAYORISTA).toEqual(['POLLO', 'CARNE', 'JQ', 'AJI', 'LOMO', 'CHAMP', 'HAW', 'CABAN', '3Q', 'CARNIV'])
    expect(abreviaturaDeSabor('Empanada de Pollo')).toBe('POLLO')
    expect(abreviaturaDeSabor('Empanada de Jamón y Queso')).toBe('JQ')
    expect(abreviaturaDeSabor('Empanada de Tres Quesos')).toBe('3Q')
    expect(abreviaturaDeSabor('Empanada Cabanossi')).toBe('CABAN')
    expect(abreviaturaDeSabor('Empanada Rara')).toBe('EMPANADA RARA')
  })
})

describe('pedidos mayoristas: una fila por cliente y tamaño', () => {
  const bloque = (extra: Partial<BloqueMayorista>): BloqueMayorista => ({
    pedido: 'BB-1',
    cliente: 'JAVIER',
    hora: '07:30',
    tamano: 'Grande',
    sabores: [],
    totalEmpanadas: 0,
    postres: [],
    fueraDeCorte: false,
    ...extra,
  })

  it('cantidades en las columnas de su sabor, total por fila y hora de la hoja', () => {
    const [f, ...resto] = armarFilasMayoristas([
      bloque({
        sabores: [
          { sabor: 'Carne', cantidad: 9, mediana: 0, grande: 9 },
          { sabor: 'Jamón y Queso', cantidad: 9, mediana: 0, grande: 9 },
        ],
        totalEmpanadas: 18,
      }),
    ])
    expect(resto).toHaveLength(0)
    expect(f).toMatchObject({ cliente: 'JAVIER', hora: '7:30 a.m.', tamano: 'GR', total: 18, observacion: '' })
    expect(f.cantidades).toEqual([0, 9, 9, 0, 0, 0, 0, 0, 0, 0]) // POLLO, CARNE, JQ, AJI, LOMO, CHAMP, HAW, CABAN, 3Q, CARNIV
  })

  it('un cliente que pide GR y MED ocupa dos filas (GR primero)', () => {
    const filas = armarFilasMayoristas([
      bloque({
        tamano: 'Mixto',
        sabores: [{ sabor: 'Pollo', cantidad: 30, mediana: 10, grande: 20 }],
        totalEmpanadas: 30,
      }),
    ])
    expect(filas.map((f) => [f.tamano, f.total])).toEqual([['GR', 20], ['MED', 10]])
    expect(filas[0].cantidades[0]).toBe(20)
    expect(filas[1].cantidades[0]).toBe(10)
  })

  it('los postres van como texto en la observación y NO suman al total de empanadas', () => {
    const [f] = armarFilasMayoristas([
      bloque({
        sabores: [{ sabor: 'Carne', cantidad: 15, mediana: 0, grande: 15 }],
        totalEmpanadas: 15,
        postres: [{ nombre: 'Crema volteada', tamano: null, cantidad: 1 }],
      }),
    ])
    expect(f.total).toBe(15)
    expect(f.observacion).toBe('1 Crema volteada')
  })

  it('un cliente solo de postres (JACKIE): una fila sin tamaño, total 0 y los postres en la observación', () => {
    const [f] = armarFilasMayoristas([
      bloque({
        cliente: 'JACKIE',
        tamano: null,
        postres: [
          { nombre: 'Fresa', tamano: null, cantidad: 1 },
          { nombre: 'Cremas', tamano: null, cantidad: 2 },
        ],
      }),
    ])
    expect(f).toMatchObject({ tamano: '', total: 0, observacion: '1 Fresa, 2 Cremas' })
    expect(f.cantidades.every((n) => n === 0)).toBe(true)
  })

  it('un sabor que no es de las 10 columnas cuenta en el total y se anota en la observación', () => {
    const [f] = armarFilasMayoristas([
      bloque({ sabores: [{ sabor: 'Espinaca', cantidad: 6, mediana: 0, grande: 6 }], totalEmpanadas: 6 }),
    ])
    expect(f.total).toBe(6)
    expect(f.cantidades.every((n) => n === 0)).toBe(true)
    expect(f.observacion).toBe('6 Espinaca')
  })

  it('una orden fuera de corte lo dice en la observación', () => {
    const [f] = armarFilasMayoristas([bloque({ sabores: [{ sabor: 'Pollo', cantidad: 4, mediana: 0, grande: 4 }], totalEmpanadas: 4, fueraDeCorte: true })])
    expect(f.observacion).toBe('FUERA DE CORTE')
  })
})

describe('pedidos agendados (venta digital)', () => {
  const pedido = (extra: Partial<PedidoAgendado>): PedidoAgendado => ({
    pedido: 'BB-10',
    cliente: 'Mirtha Caro',
    tipoEntrega: 'delivery',
    hora: '15:30',
    estado: 'out_for_delivery',
    metodoPago: null,
    direccion: 'Esteves 12 - Chorrillos',
    observacion: null,
    lineas: [{ cantidad: 48, producto: 'Mini Empanada variada (catering)', area: 'empanaderia' }],
    ...extra,
  })

  it('una mini empanada a las 3:30 p. m. lleva producción de madrugada pero su prioridad es NORMAL (como en su hoja)', () => {
    const [g] = armarAgendados([pedido({})])
    expect(g.lineas[0]).toMatchObject({ hora: '3:30 p.m.', cantidad: 48, area: 'empanadería', prioridad: 'NORMAL', madrugada: true })
    expect(g).toMatchObject({ modalidad: 'DELIVERY', estado: 'LISTO', direccion: 'Esteves 12 - Chorrillos' })
  })

  it('un pedido de cocina a las 7:30 a. m. es NORMAL y NO lleva madrugada', () => {
    const [g] = armarAgendados([
      pedido({ cliente: 'victor mayta', hora: '07:30', estado: 'delivered', lineas: [{ cantidad: 25, producto: 'Petipan huevo con tocino (catering)', area: 'cocina' }] }),
    ])
    expect(g.lineas[0]).toMatchObject({ prioridad: 'NORMAL', madrugada: false, area: 'cocina' })
    expect(g.estado).toBe('DESPACHADO')
  })

  it('una empanada de las 7:30 a. m. es ALTA; a las 10:00, MEDIA', () => {
    const [a, b] = armarAgendados([
      pedido({ pedido: 'BB-11', cliente: 'Ana', hora: '07:30', lineas: [{ cantidad: 12, producto: 'Empanada de Carne', area: 'empanaderia', esEmpanada: true }] }),
      pedido({ pedido: 'BB-12', cliente: 'Beto', hora: '10:00', lineas: [{ cantidad: 12, producto: 'Empanada de Carne', area: 'empanaderia', esEmpanada: true }] }),
    ])
    expect(a.lineas[0].prioridad).toBe('ALTA')
    expect(b.lineas[0].prioridad).toBe('MEDIA')
  })

  it('un cliente con varios productos: una fila por producto, agrupadas bajo el mismo pedido', () => {
    const [g] = armarAgendados([
      pedido({
        lineas: [
          { cantidad: 4, producto: 'Caja de Alfajores con manjar x 18 ud.', area: 'pasteleria' },
          { cantidad: 2, producto: 'Caja de Piononos x 16 ud.', area: 'pasteleria' },
        ],
        metodoPago: 'contraentrega',
        tipoEntrega: 'tienda',
      }),
    ])
    expect(g.lineas).toHaveLength(2)
    expect(g.modalidad).toBe('RECOJO TIENDA')
    expect(g.medioPago).toBe('CANCELÓ EN TIENDA')
  })

  it('se ordenan por la primera hora y los sin hora van al final', () => {
    const grupos = armarAgendados([
      pedido({ pedido: 'BB-3', cliente: 'Zoe', hora: null }),
      pedido({ pedido: 'BB-2', cliente: 'Luis', hora: '16:00' }),
      pedido({ pedido: 'BB-1', cliente: 'Ana', hora: '09:00' }),
    ])
    expect(grupos.map((g) => g.cliente)).toEqual(['Ana', 'Luis', 'Zoe'])
  })
})

describe('resumen: pedidos con hora crítica', () => {
  const demanda = (extra: Partial<LineaDemanda> & { canal?: string }): LineaDemanda & { canal?: string } => ({
    origen: 'producto',
    productId: 'p1',
    nombre: 'Empanada de Carne',
    tamano: null,
    cantidad: 12,
    hora: '07:30',
    pedido: 'BB-1',
    cliente: 'Ana',
    area: 'empanaderia',
    esEmpanada: true,
    canal: 'whatsapp',
    ...extra,
  })

  it('solo las líneas ALTA (empanadas hasta las 8:00 inclusive); MEDIA y NORMAL no entran', () => {
    const r = armarHorasCriticas([
      demanda({ pedido: 'BB-1', hora: '07:30' }),
      demanda({ pedido: 'BB-2', hora: '08:00', cliente: 'Beto' }),
      demanda({ pedido: 'BB-3', hora: '09:00' }), // MEDIA
      demanda({ pedido: 'BB-4', hora: '15:00' }), // NORMAL
      demanda({ pedido: 'BB-5', hora: '07:30', nombre: 'Petipan con pollo (catering)', esEmpanada: false, area: 'cocina' }), // sin madrugada
    ])
    expect(r.map((x) => x.cliente)).toEqual(['Ana', 'Beto'])
    expect(r[0]).toMatchObject({ hora: '7:30 a.m.', cantidad: 12, area: 'empanadería', tipo: 'EMPANADA', prioridad: 'ALTA' })
  })

  it('los mayoristas NO se repiten aquí (salen por su hoja de empaque); Rappi sí', () => {
    const r = armarHorasCriticas([demanda({ canal: 'mayorista', cliente: 'CYBER' }), demanda({ canal: 'rappi', cliente: 'Rappi' })])
    expect(r.map((x) => x.cliente)).toEqual(['Rappi'])
  })

  it('una mini empanada de catering a las 7:30 es MINI EMPANADA', () => {
    const r = armarHorasCriticas([demanda({ origen: 'catering', nombre: 'Mini Empanada variada (catering)', esEmpanada: false })])
    expect(r[0].tipo).toBe('MINI EMPANADA')
  })
})

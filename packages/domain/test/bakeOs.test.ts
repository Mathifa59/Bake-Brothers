import { describe, expect, it } from 'vitest'
import {
  partesLima,
  inicioDiaLima,
  sumarDiasISO,
  diaSemanaLegible,
  sumarIngresos,
  ventasPorHora,
  ventanasComparacion,
  variacionPorcentual,
  tiemposDeRespuesta,
  resumirAtencion,
  segmentarClientes,
  columnaDeProduccion,
  accionDeProduccion,
  armarTablero,
  construirAlertas,
  antiguedadLegible,
  puedeTransicionar,
  ESTADOS_PEDIDO,
} from '../src/index.js'

// Lima = UTC-5 fijo. 2026-10-05 es lunes.
const lima = (iso: string) => new Date(`${iso}-05:00`)

describe('zona Lima', () => {
  it('partesLima respeta Lima, no el UTC: 23:30 en Lima ya es el día siguiente en UTC', () => {
    expect(partesLima(lima('2026-10-05T23:30:00'))).toEqual({ fecha: '2026-10-05', hora: 23, minuto: 30 })
    expect(partesLima(new Date('2026-10-06T04:30:00Z'))).toEqual({ fecha: '2026-10-05', hora: 23, minuto: 30 })
  })
  it('inicioDiaLima y sumarDiasISO', () => {
    expect(inicioDiaLima('2026-10-05').toISOString()).toBe('2026-10-05T05:00:00.000Z')
    expect(sumarDiasISO('2026-10-05', -7)).toBe('2026-09-28')
    expect(sumarDiasISO('2026-03-02', -7)).toBe('2026-02-23')
  })
  it('diaSemanaLegible', () => {
    expect(diaSemanaLegible('2026-10-05')).toBe('lunes')
  })
})

describe('ventas: comparación hasta la MISMA hora de Lima', () => {
  const ahora = lima('2026-10-05T12:16:00')

  it('las ventanas cortan a la misma hora y minuto de Lima una semana antes', () => {
    const v = ventanasComparacion(ahora)
    expect(v.fechaSemanaAnterior).toBe('2026-09-28')
    expect(v.hoy.desde.toISOString()).toBe('2026-10-05T05:00:00.000Z')
    expect(v.hoy.hasta).toEqual(ahora)
    expect(v.semanaAnterior.desde.toISOString()).toBe('2026-09-28T05:00:00.000Z')
    expect(partesLima(v.semanaAnterior.hasta)).toEqual({ fecha: '2026-09-28', hora: 12, minuto: 16 })
  })

  it('cerca de medianoche no se corre de día (23:50 Lima)', () => {
    const v = ventanasComparacion(lima('2026-10-05T23:50:00'))
    expect(partesLima(v.semanaAnterior.hasta)).toEqual({ fecha: '2026-09-28', hora: 23, minuto: 50 })
  })

  it('sumarIngresos excluye cancelados (misma definición que metricas_kpis)', () => {
    const t = new Date().toISOString()
    expect(
      sumarIngresos([
        { total: '100.00', estado: 'paid', creado_en: t },
        { total: 50, estado: 'confirmed', creado_en: t },
        { total: 999, estado: 'cancelled', creado_en: t },
      ])
    ).toBe(150)
  })

  it('variación porcentual, y null cuando no hay base comparable', () => {
    expect(variacionPorcentual(112.8, 100)).toBeCloseTo(12.8)
    expect(variacionPorcentual(50, 100)).toBe(-50)
    expect(variacionPorcentual(80, 0)).toBeNull()
  })

  it('ventas por hora usan la hora de Lima y no cuentan cancelados', () => {
    const r = ventasPorHora([
      { total: 30, estado: 'paid', creado_en: lima('2026-10-05T10:05:00').toISOString() },
      { total: 20, estado: 'confirmed', creado_en: lima('2026-10-05T10:55:00').toISOString() },
      { total: 15, estado: 'paid', creado_en: lima('2026-10-05T18:00:00').toISOString() },
      { total: 99, estado: 'cancelled', creado_en: lima('2026-10-05T18:10:00').toISOString() },
    ])
    expect(r).toEqual([
      { hora: 10, ventas: 50, pedidos: 2 },
      { hora: 18, ventas: 15, pedidos: 1 },
    ])
  })
})

describe('atención: tiempos de primera respuesta', () => {
  const t = (rol: 'cliente' | 'bot' | 'operador', min: number, extra = {}) => ({
    rol,
    en: new Date(Date.UTC(2026, 9, 5, 15, min)).toISOString(),
    ...extra,
  })

  it('bot: primer mensaje del cliente → primera respuesta del bot', () => {
    expect(tiemposDeRespuesta([t('cliente', 0), t('bot', 1)])).toEqual({ botSegundos: 60, humanaSegundos: null })
  })

  it('humana: desde que el bot derivó (último mensaje del bot) hasta la primera respuesta del operador', () => {
    const r = tiemposDeRespuesta([t('cliente', 0), t('bot', 1), t('cliente', 3), t('bot', 4), t('cliente', 6), t('operador', 14)])
    // el último bot antes del operador fue el minuto 4 → esperó 10 min
    expect(r.humanaSegundos).toBe(10 * 60)
    expect(r.botSegundos).toBe(60)
  })

  it('solo cuenta la PRIMERA respuesta humana', () => {
    const r = tiemposDeRespuesta([t('cliente', 0), t('bot', 1), t('operador', 6), t('cliente', 7), t('operador', 60)])
    expect(r.humanaSegundos).toBe(5 * 60)
  })

  it('sin bot: desde el primer mensaje del cliente', () => {
    expect(tiemposDeRespuesta([t('cliente', 0), t('cliente', 2), t('operador', 5)]).humanaSegundos).toBe(5 * 60)
  })

  it('si el operador escribió primero no hay espera que medir', () => {
    expect(tiemposDeRespuesta([t('operador', 0), t('cliente', 5)])).toEqual({ botSegundos: null, humanaSegundos: null })
  })

  it('ignora los mensajes importados (anteriores a conectar)', () => {
    const r = tiemposDeRespuesta([t('cliente', 0, { importado: true }), t('operador', 1, { importado: true }), t('cliente', 30), t('bot', 31)])
    expect(r).toEqual({ botSegundos: 60, humanaSegundos: null })
  })

  it('resumirAtencion promedia por conversación y cuenta muestras', () => {
    const r = resumirAtencion([
      [t('cliente', 0), t('bot', 1), t('operador', 11)], // bot 60s, humana 600s
      [t('cliente', 0), t('bot', 3)], // bot 180s
      [],
    ])
    expect(r.conversaciones).toBe(3)
    expect(r.bot).toEqual({ promedioSegundos: 120, muestras: 2 })
    expect(r.humana).toEqual({ promedioSegundos: 600, muestras: 1 })
  })

  it('sin muestras el promedio es null, no 0', () => {
    expect(resumirAtencion([]).humana.promedioSegundos).toBeNull()
  })
})

describe('segmentos de clientes', () => {
  const ahora = lima('2026-10-15T12:00:00')
  const dias = (n: number) => new Date(ahora.getTime() - n * 86_400_000).toISOString()

  it('frecuentes (2+ compras no canceladas), sin comprar 30 días y nuevos del mes', () => {
    const s = segmentarClientes(
      [
        { id: 'a', creado_en: dias(200) }, // 2 compras recientes
        { id: 'b', creado_en: dias(300) }, // última compra hace 45 d
        { id: 'c', creado_en: dias(3) }, // nuevo del mes, 1 compra
        { id: 'd', creado_en: dias(100) }, // solo pedidos cancelados
        { id: 'e', creado_en: dias(60) }, // sin pedidos
      ],
      [
        { customer_id: 'a', creado_en: dias(5), estado: 'delivered' },
        { customer_id: 'a', creado_en: dias(10), estado: 'paid' },
        { customer_id: 'b', creado_en: dias(45), estado: 'delivered' },
        { customer_id: 'b', creado_en: dias(90), estado: 'delivered' },
        { customer_id: 'c', creado_en: dias(2), estado: 'confirmed' },
        { customer_id: 'd', creado_en: dias(50), estado: 'cancelled' },
        { customer_id: 'd', creado_en: dias(60), estado: 'cancelled' },
      ],
      ahora
    )
    expect([...s.frecuentes].sort()).toEqual(['a', 'b'])
    expect([...s.sinComprar30]).toEqual(['b'])
    expect([...s.nuevosDelMes]).toEqual(['c'])
  })

  it('exactamente 30 días NO cuenta como "sin comprar" (es más de 30)', () => {
    const s = segmentarClientes(
      [{ id: 'x', creado_en: dias(100) }],
      [{ customer_id: 'x', creado_en: dias(30), estado: 'paid' }],
      ahora
    )
    expect(s.sinComprar30.size).toBe(0)
  })

  it('el mes se mide en Lima: 31/oct 23:00 Lima ya es noviembre en UTC pero sigue siendo octubre', () => {
    const s = segmentarClientes(
      [{ id: 'z', creado_en: lima('2026-10-31T23:00:00').toISOString() }],
      [],
      lima('2026-10-31T23:30:00')
    )
    expect(s.nuevosDelMes.has('z')).toBe(true)
  })
})

describe('tablero de producción', () => {
  it('columnas por estado; payment_pending, draft, delivered y cancelled no son columna', () => {
    expect(columnaDeProduccion('confirmed')).toBe('por_iniciar')
    expect(columnaDeProduccion('paid')).toBe('por_iniciar')
    expect(columnaDeProduccion('in_production')).toBe('en_produccion')
    expect(columnaDeProduccion('out_for_delivery')).toBe('listo')
    for (const e of ['payment_pending', 'draft', 'delivered', 'cancelled']) expect(columnaDeProduccion(e)).toBeNull()
  })

  it('cada acción es una transición VÁLIDA de la máquina de estados, y todo estado de columna tiene una', () => {
    for (const e of ESTADOS_PEDIDO) {
      const a = accionDeProduccion(e)
      if (a) expect(puedeTransicionar(e, a.hacia)).toBe(true)
    }
    expect(accionDeProduccion('paid')?.hacia).toBe('in_production')
    expect(accionDeProduccion('confirmed')?.hacia).toBe('in_production')
    expect(accionDeProduccion('in_production')?.hacia).toBe('out_for_delivery')
    expect(accionDeProduccion('out_for_delivery')?.hacia).toBe('delivered')
    expect(accionDeProduccion('payment_pending')).toBeNull()
    expect(accionDeProduccion('delivered')).toBeNull()
  })

  it('armarTablero reparte y cuenta payment_pending aparte', () => {
    const t = armarTablero([
      { estado: 'paid' },
      { estado: 'confirmed' },
      { estado: 'in_production' },
      { estado: 'out_for_delivery' },
      { estado: 'payment_pending' },
      { estado: 'payment_pending' },
      { estado: 'delivered' },
    ])
    expect([t.porIniciar.length, t.enProduccion.length, t.listo.length, t.pagoPendiente]).toEqual([2, 1, 1, 2])
  })
})

describe('Control Tower', () => {
  const ahora = lima('2026-10-05T12:00:00')
  const pedido = (n: string, extra = {}) => ({
    numero: n,
    estado: 'paid',
    requiere_confirmar_combo: false,
    actualizado_en: lima('2026-10-05T09:00:00').toISOString(),
    fecha_entrega: '2026-10-05',
    horario_entrega: '15:00',
    cliente: 'Ana',
    sede: 'Cedros',
    ...extra,
  })

  it('agrupa las cuatro excepciones reales y suma el total sin duplicar', () => {
    const a = construirAlertas({
      hoy: '2026-10-05',
      stockAgotado: [{ id: 's1', producto: 'Alfajor Mix', tamano: null, sede: 'Cedros' }],
      escaladas: [
        { id: 'c2', canal: 'whatsapp', ultimo_mensaje_en: lima('2026-10-05T11:50:00').toISOString(), sede: 'Cedros' },
        { id: 'c1', canal: 'whatsapp', ultimo_mensaje_en: lima('2026-10-05T10:00:00').toISOString(), sede: 'Cedros' },
      ],
      pedidosPreProduccion: [
        pedido('BB-1', { estado: 'paid' }),
        pedido('BB-2', { estado: 'paid', fecha_entrega: '2026-10-07', requiere_confirmar_combo: true }),
        pedido('BB-3', { estado: 'payment_pending', requiere_confirmar_combo: true }),
        pedido('BB-4', { estado: 'confirmed' }),
      ],
    })
    expect(a.agotados).toHaveLength(1)
    expect(a.combosPorRevisar.map((p) => p.numero)).toEqual(['BB-2', 'BB-3'])
    expect(a.pagadosSinEmpezar.map((p) => p.numero)).toEqual(['BB-1', 'BB-2'])
    expect(a.escaladasSinAtender.map((c) => c.id)).toEqual(['c1', 'c2']) // la más antigua primero
    expect(a.paraHoySinEmpezar.map((p) => p.numero)).toEqual(['BB-1', 'BB-4'])
    expect(a.total).toBe(1 + 2 + 2 + 2) // agotados + combos + escaladas + pagados; paraHoy es subconjunto
  })

  it('sin nada que reportar el total es 0', () => {
    expect(construirAlertas({ hoy: '2026-10-05', stockAgotado: [], escaladas: [], pedidosPreProduccion: [] }).total).toBe(0)
  })

  it('antigüedad legible', () => {
    const d = (min: number) => new Date(ahora.getTime() - min * 60000).toISOString()
    expect(antiguedadLegible(d(0), ahora)).toBe('hace instantes')
    expect(antiguedadLegible(d(5), ahora)).toBe('hace 5 min')
    expect(antiguedadLegible(d(125), ahora)).toBe('hace 2 h')
    expect(antiguedadLegible(d(60 * 49), ahora)).toBe('hace 2 d')
  })
})

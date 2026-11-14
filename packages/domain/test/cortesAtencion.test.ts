import { describe, expect, it } from 'vitest'
import {
  conAvisoPrimeraHora,
  fechaMinimaPorEncargo,
  hayPersonasAtendiendo,
  proximaAtencionLegible,
  pasoElCorteDeManana,
  textoContextoCortes,
  validarFechaDePedido,
} from '../src/index.js'

// Lima es UTC-5 sin horario de verano: 20:00 en Lima = 01:00 UTC del día siguiente.
const lima = (iso: string, hhmm: string) => new Date(`${iso}T${hhmm}:00-05:00`)

describe('fechas de los pedidos: mañana hasta las 11:00 p. m.; hoy con validaciones', () => {
  it('para MAÑANA se acepta hasta las 10:59 p. m.; desde las 11:00 p. m. la fecha más cercana es pasado mañana', () => {
    expect(validarFechaDePedido('2026-11-14', lima('2026-11-13', '10:00'))).toEqual({ ok: true, paraHoy: false })
    expect(validarFechaDePedido('2026-11-14', lima('2026-11-13', '22:59'))).toEqual({ ok: true, paraHoy: false })
    expect(validarFechaDePedido('2026-11-14', lima('2026-11-13', '23:00'))).toEqual({ ok: false, error: 'CORTE_DEL_DIA', fechaMinima: '2026-11-15', corte: '11:00 p. m.' })
    expect(validarFechaDePedido('2026-11-14', lima('2026-11-13', '23:59'))).toMatchObject({ ok: false, fechaMinima: '2026-11-15' })
    // Pasado mañana o después: sin corte.
    expect(validarFechaDePedido('2026-11-15', lima('2026-11-13', '23:30'))).toEqual({ ok: true, paraHoy: false })
  })

  it('el mismo corte para todos (ya no hay uno de 8:00 p. m. para minoristas)', () => {
    // A las 8:15 p. m. mañana sigue siendo válido (antes el bot lo rechazaba «para hoy» desde las 8:00).
    expect(validarFechaDePedido('2026-11-14', lima('2026-11-13', '20:15'))).toEqual({ ok: true, paraHoy: false })
  })

  it('«para hoy» se acepta como tal (el servidor aplica las validaciones de pedido para hoy)', () => {
    expect(validarFechaDePedido('2026-11-13', lima('2026-11-13', '09:00'))).toEqual({ ok: true, paraHoy: true })
    expect(validarFechaDePedido('2026-11-13', lima('2026-11-13', '23:30'))).toEqual({ ok: true, paraHoy: true })
  })

  it('después de medianoche «mañana» es el día siguiente: se vuelve a aceptar hasta las 11:00 p. m. de ese día', () => {
    expect(validarFechaDePedido('2026-11-15', lima('2026-11-14', '00:10'))).toEqual({ ok: true, paraHoy: false })
  })

  it('cambio de mes: a las 11:30 p. m. del 30 la fecha más cercana es el 2', () => {
    expect(validarFechaDePedido('2026-12-01', lima('2026-11-30', '23:30'))).toMatchObject({ ok: false, fechaMinima: '2026-12-02' })
  })

  it('una fecha mal formada no la rechaza el corte (la rechaza otra validación)', () => {
    expect(validarFechaDePedido('mañana', lima('2026-11-13', '23:30'))).toEqual({ ok: true, paraHoy: false })
  })

  it('usa la hora de Lima, no la del servidor (a las 04:30 UTC del 14 todavía son las 23:30 del 13 en Lima)', () => {
    const t = new Date('2026-11-14T04:30:00Z') // 23:30 del 13 en Lima
    expect(pasoElCorteDeManana(t)).toBe(true)
    expect(validarFechaDePedido('2026-11-14', t)).toMatchObject({ ok: false, fechaMinima: '2026-11-15' })
  })

  it('fechaMinimaPorEncargo: mañana antes de las 11:00 p. m., pasado mañana después', () => {
    expect(fechaMinimaPorEncargo(lima('2026-11-13', '15:00'))).toBe('2026-11-14')
    expect(fechaMinimaPorEncargo(lima('2026-11-13', '22:59'))).toBe('2026-11-14')
    expect(fechaMinimaPorEncargo(lima('2026-11-13', '23:00'))).toBe('2026-11-15')
  })
})

describe('atención de personas y «te escribimos a primera hora»', () => {
  it('de lunes a sábado hay personas de 8:00 a. m. a 8:30 p. m. (viernes 13)', () => {
    expect(hayPersonasAtendiendo(lima('2026-11-13', '07:59'))).toBe(false)
    expect(hayPersonasAtendiendo(lima('2026-11-13', '08:00'))).toBe(true)
    expect(hayPersonasAtendiendo(lima('2026-11-13', '20:29'))).toBe(true)
    expect(hayPersonasAtendiendo(lima('2026-11-13', '20:30'))).toBe(false)
    expect(hayPersonasAtendiendo(lima('2026-11-13', '03:00'))).toBe(false)
    // sábado 14: mismo horario que entre semana
    expect(hayPersonasAtendiendo(lima('2026-11-14', '08:00'))).toBe(true)
  })

  it('el domingo (15) las personas atienden de 10:00 a. m. a 8:30 p. m.', () => {
    expect(hayPersonasAtendiendo(lima('2026-11-15', '08:30'))).toBe(false)
    expect(hayPersonasAtendiendo(lima('2026-11-15', '09:59'))).toBe(false)
    expect(hayPersonasAtendiendo(lima('2026-11-15', '10:00'))).toBe(true)
    expect(hayPersonasAtendiendo(lima('2026-11-15', '20:29'))).toBe(true)
    expect(hayPersonasAtendiendo(lima('2026-11-15', '20:30'))).toBe(false)
  })

  it('«te escribimos a primera hora» dice a qué hora vuelven: hoy si aún no abren, mañana si ya cerraron', () => {
    expect(proximaAtencionLegible(lima('2026-11-13', '06:00'))).toBe('desde las 8:00 a. m.')
    expect(proximaAtencionLegible(lima('2026-11-13', '21:00'))).toBe('mañana desde las 8:00 a. m.') // sábado 14
    expect(proximaAtencionLegible(lima('2026-11-14', '21:00'))).toBe('mañana desde las 10:00 a. m.') // mañana es domingo
    expect(proximaAtencionLegible(lima('2026-11-15', '07:00'))).toBe('desde las 10:00 a. m.') // domingo antes de abrir
  })

  it('fuera de horario se agrega el aviso una sola vez; en horario no se toca el texto', () => {
    const base = 'Lo va a revisar el equipo y te confirma.'
    expect(conAvisoPrimeraHora(base, lima('2026-11-13', '12:00'))).toBe(base)
    const noche = conAvisoPrimeraHora(base, lima('2026-11-13', '23:10'))
    expect(noche).toContain(base)
    expect(noche).toContain('te escribimos a primera hora')
    expect(noche).toContain('mañana desde las 8:00 a. m.')
    expect(conAvisoPrimeraHora(noche, lima('2026-11-13', '23:10'))).toBe(noche) // no se duplica
    expect(conAvisoPrimeraHora('Te escribimos a primera hora.', lima('2026-11-13', '23:10'))).toBe('Te escribimos a primera hora.')
  })

  it('el contexto del modelo dice el corte, que hoy SÍ se toma con validaciones, y si hay personas', () => {
    const tarde = textoContextoCortes(lima('2026-11-13', '23:30'))
    expect(tarde).toContain('ya pasaron las 11:00 p. m.')
    expect(tarde).toContain('2026-11-15')
    expect(tarde).toContain('PEDIDOS PARA HOY: SÍ los puedes tomar')
    const dia = textoContextoCortes(lima('2026-11-13', '10:00'), 'HORARIO DE HOY (viernes) PARA RECOJO: Cedros 7:30 a. m.–8:30 p. m.')
    expect(dia).toContain('los pedidos para mañana se toman hasta las 11:00 p. m. de hoy')
    expect(dia).not.toContain('ya pasaron las')
    expect(dia).toContain('HORARIO DE HOY (viernes)')
    expect(dia).toContain('ahora hay equipo atendiendo')
    expect(textoContextoCortes(lima('2026-11-13', '23:00'))).toContain('ahora NO hay equipo atendiendo')
  })
})

import { describe, expect, it } from 'vitest'
import {
  conAvisoPrimeraHora,
  fechaMinimaDeEntrega,
  hayPersonasAtendiendo,
  proximaAtencionLegible,
  pasoElCorte,
  textoContextoCortes,
  validarFechaPorCorte,
} from '../src/index.js'

// Lima es UTC-5 sin horario de verano: 20:00 en Lima = 01:00 UTC del día siguiente.
const lima = (iso: string, hhmm: string) => new Date(`${iso}T${hhmm}:00-05:00`)

describe('corte del día (8:00 p. m. clientes, 11:00 p. m. mayoristas)', () => {
  it('antes de las 8:00 p. m. se puede pedir para hoy; desde las 8:00, solo para mañana', () => {
    expect(pasoElCorte(lima('2026-11-13', '19:59'))).toBe(false)
    expect(pasoElCorte(lima('2026-11-13', '20:00'))).toBe(true)
    expect(fechaMinimaDeEntrega(lima('2026-11-13', '19:59'))).toBe('2026-11-13')
    expect(fechaMinimaDeEntrega(lima('2026-11-13', '20:00'))).toBe('2026-11-14')
    expect(fechaMinimaDeEntrega(lima('2026-11-30', '21:30'))).toBe('2026-12-01') // cambio de mes
  })

  it('el mayorista tiene hasta las 11:00 p. m.', () => {
    expect(pasoElCorte(lima('2026-11-13', '22:59'), 'mayorista')).toBe(false)
    expect(fechaMinimaDeEntrega(lima('2026-11-13', '21:00'), 'mayorista')).toBe('2026-11-13')
    expect(fechaMinimaDeEntrega(lima('2026-11-13', '23:00'), 'mayorista')).toBe('2026-11-14')
  })

  it('usa la hora de Lima, no la del servidor (a las 01:30 UTC todavía es el día anterior en Lima)', () => {
    const t = new Date('2026-11-14T01:30:00Z') // 20:30 del 13 en Lima
    expect(pasoElCorte(t)).toBe(true)
    expect(fechaMinimaDeEntrega(t)).toBe('2026-11-14')
  })

  it('validarFechaPorCorte: «para hoy» después del corte se rechaza con la fecha mínima; mañana pasa', () => {
    const ahora = lima('2026-11-13', '20:15')
    expect(validarFechaPorCorte('2026-11-13', ahora)).toEqual({ ok: false, fechaMinima: '2026-11-14', corte: '8:00 p. m.' })
    expect(validarFechaPorCorte('2026-11-14', ahora)).toEqual({ ok: true })
    expect(validarFechaPorCorte('2026-11-20', ahora)).toEqual({ ok: true })
    expect(validarFechaPorCorte('2026-11-13', lima('2026-11-13', '15:00'))).toEqual({ ok: true })
    expect(validarFechaPorCorte('2026-11-13', ahora, 'mayorista')).toEqual({ ok: true })
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

  it('el contexto del modelo dice el corte y si hay personas', () => {
    const tarde = textoContextoCortes(lima('2026-11-13', '20:30'))
    expect(tarde).toContain('NO ofrezcas entrega ni recojo para HOY')
    expect(tarde).toContain('2026-11-14')
    expect(textoContextoCortes(lima('2026-11-13', '10:00'))).not.toContain('NO ofrezcas')
    expect(textoContextoCortes(lima('2026-11-13', '23:00'))).toContain('ahora NO hay equipo atendiendo')
    expect(textoContextoCortes(lima('2026-11-13', '10:00'))).toContain('ahora hay equipo atendiendo')
  })
})

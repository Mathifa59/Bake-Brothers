import { describe, expect, it } from 'vitest'
import { horaLegible, horarioDelDia, minutosDeTime, nombreDeDia, textoHorarioDeHoy, validarHoraDeRecojo, type HorarioDia } from '../src/index.js'

const lima = (iso: string, hhmm: string) => new Date(`${iso}T${hhmm}:00-05:00`)
const m = (hhmm: string) => minutosDeTime(`${hhmm}:00`)

// Los horarios reales: Cedros lun–sáb 7:30–20:30, domingo 10:30–20:30; Santa Marina vie–mié 12:00–22:00, jueves 13:00–22:00.
const cedros: HorarioDia[] = [1, 2, 3, 4, 5, 6]
  .map((dia) => ({ dia, abre: m('07:30'), cierra: m('20:30') }))
  .concat([{ dia: 0, abre: m('10:30'), cierra: m('20:30') }])
const santaMarina: HorarioDia[] = [5, 6, 0, 1, 2, 3]
  .map((dia) => ({ dia, abre: m('12:00'), cierra: m('22:00') }))
  .concat([{ dia: 4, abre: m('13:00'), cierra: m('22:00') }])

// 2026-11-13 = viernes · 11-14 = sábado · 11-15 = domingo · 11-19 = jueves
const AHORA = lima('2026-11-13', '09:00')

describe('validarHoraDeRecojo', () => {
  it('dentro del horario: de la apertura hasta ANTES del cierre', () => {
    expect(validarHoraDeRecojo({ horarios: cedros, fechaISO: '2026-11-14', hora: '7:30 a. m.', ahora: AHORA })).toEqual({ ok: true })
    expect(validarHoraDeRecojo({ horarios: cedros, fechaISO: '2026-11-14', hora: '20:29', ahora: AHORA })).toEqual({ ok: true })
    expect(validarHoraDeRecojo({ horarios: cedros, fechaISO: '2026-11-14', hora: '4pm', ahora: AHORA })).toEqual({ ok: true })
  })

  it('antes de abrir o desde la hora de cierre: fuera de horario, con el horario de ese día', () => {
    const antes = validarHoraDeRecojo({ horarios: cedros, fechaISO: '2026-11-14', hora: '7:00', ahora: AHORA })
    expect(antes).toEqual({ ok: false, motivo: 'FUERA_DE_HORARIO', abre: '7:30 a. m.', cierra: '8:30 p. m.' })
    expect(validarHoraDeRecojo({ horarios: cedros, fechaISO: '2026-11-14', hora: '8:30 pm', ahora: AHORA })).toMatchObject({ ok: false, motivo: 'FUERA_DE_HORARIO' })
    expect(validarHoraDeRecojo({ horarios: cedros, fechaISO: '2026-11-14', hora: '9pm', ahora: AHORA })).toMatchObject({ ok: false, motivo: 'FUERA_DE_HORARIO' })
  })

  it('el horario depende del día: el domingo Cedros abre a las 10:30 y Santa Marina el jueves a la 1:00 p. m.', () => {
    expect(validarHoraDeRecojo({ horarios: cedros, fechaISO: '2026-11-15', hora: '10:00', ahora: AHORA })).toMatchObject({ ok: false, motivo: 'FUERA_DE_HORARIO', abre: '10:30 a. m.' })
    expect(validarHoraDeRecojo({ horarios: cedros, fechaISO: '2026-11-15', hora: '10:30', ahora: AHORA })).toEqual({ ok: true })
    expect(validarHoraDeRecojo({ horarios: santaMarina, fechaISO: '2026-11-19', hora: '12:30', ahora: AHORA })).toMatchObject({ ok: false, abre: '1:00 p. m.' })
    expect(validarHoraDeRecojo({ horarios: santaMarina, fechaISO: '2026-11-19', hora: '1:00 pm', ahora: AHORA })).toEqual({ ok: true })
    expect(validarHoraDeRecojo({ horarios: santaMarina, fechaISO: '2026-11-14', hora: '12:00', ahora: AHORA })).toEqual({ ok: true })
  })

  it('un día sin fila es un día cerrado', () => {
    const sinDomingo = cedros.filter((h) => h.dia !== 0)
    expect(validarHoraDeRecojo({ horarios: sinDomingo, fechaISO: '2026-11-15', hora: '12:00', ahora: AHORA })).toEqual({ ok: false, motivo: 'LOCAL_CERRADO' })
  })

  it('sin ningún horario cargado no se puede validar', () => {
    expect(validarHoraDeRecojo({ horarios: [], fechaISO: '2026-11-14', hora: '12:00', ahora: AHORA })).toEqual({ ok: false, motivo: 'SIN_HORARIOS' })
  })

  it('una hora que no se entiende o vacía: hay que pedir una concreta', () => {
    for (const hora of ['por la tarde', '', null, 'cuando puedan']) {
      expect(validarHoraDeRecojo({ horarios: cedros, fechaISO: '2026-11-14', hora, ahora: AHORA })).toMatchObject({ ok: false, motivo: 'HORA_NO_ENTENDIDA', abre: '7:30 a. m.' })
    }
  })

  it('para HOY la hora tiene que ser posterior a la actual (hora de Lima)', () => {
    const a = lima('2026-11-13', '15:00')
    expect(validarHoraDeRecojo({ horarios: cedros, fechaISO: '2026-11-13', hora: '2pm', ahora: a })).toMatchObject({ ok: false, motivo: 'HORA_PASADA' })
    expect(validarHoraDeRecojo({ horarios: cedros, fechaISO: '2026-11-13', hora: '3:00 pm', ahora: a })).toMatchObject({ ok: false, motivo: 'HORA_PASADA' })
    expect(validarHoraDeRecojo({ horarios: cedros, fechaISO: '2026-11-13', hora: '3:30 pm', ahora: a })).toEqual({ ok: true })
    // Para otro día la hora actual no importa.
    expect(validarHoraDeRecojo({ horarios: cedros, fechaISO: '2026-11-14', hora: '8am', ahora: a })).toEqual({ ok: true })
  })

  it('usa la hora de Lima: a las 02:00 UTC del 14 todavía son las 21:00 del 13', () => {
    const t = new Date('2026-11-14T02:00:00Z')
    expect(validarHoraDeRecojo({ horarios: cedros, fechaISO: '2026-11-13', hora: '9:30 pm', ahora: t })).toMatchObject({ ok: false, motivo: 'FUERA_DE_HORARIO' })
  })
})

describe('textos', () => {
  it('horaLegible y nombre del día', () => {
    expect(horaLegible(m('07:30'))).toBe('7:30 a. m.')
    expect(horaLegible(m('20:30'))).toBe('8:30 p. m.')
    expect(horaLegible(m('12:00'))).toBe('12:00 p. m.')
    expect(nombreDeDia('2026-11-13')).toBe('viernes')
    expect(horarioDelDia(santaMarina, '2026-11-19')?.abre).toBe(m('13:00'))
  })

  it('el horario de HOY de cada local para el prompt (cerrado si ese día no abre)', () => {
    const t = textoHorarioDeHoy(lima('2026-11-13', '10:00'), [{ nombre: 'Cedros', horarios: cedros }, { nombre: 'Santa Marina', horarios: santaMarina }])
    expect(t).toContain('HORARIO DE HOY (viernes)')
    expect(t).toContain('Cedros 7:30 a. m.–8:30 p. m.')
    expect(t).toContain('Santa Marina 12:00 p. m.–10:00 p. m.')
    expect(textoHorarioDeHoy(lima('2026-11-13', '10:00'), [{ nombre: 'Cedros', horarios: [] }])).toContain('Cedros cerrado hoy')
  })
})

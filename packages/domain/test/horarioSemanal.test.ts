import { describe, expect, it } from 'vitest'
import { agruparHorario, horarioJsonLd, minutosDeTime, rangoDeDias, renglonesHorarioWeb, textoHorarioBot, type HorarioDia } from '../src/index.js'

const m = (hhmm: string) => minutosDeTime(`${hhmm}:00`)
const dias = (lista: number[], abre: string, cierra: string): HorarioDia[] => lista.map((dia) => ({ dia, abre: m(abre), cierra: m(cierra) }))

// Los horarios reales (domingo = 0).
const cedros = [...dias([1, 2, 3, 4, 5, 6], '07:30', '20:30'), ...dias([0], '10:30', '20:30')]
const santaMarina = [...dias([5, 6, 0, 1, 2, 3], '12:00', '22:00'), ...dias([4], '13:00', '22:00')]

describe('horario del local generado desde la tabla por día', () => {
  it('Cedros: lunes a sábado y domingo', () => {
    expect(textoHorarioBot(cedros)).toBe('lunes a sábado 7:30 a. m. a 8:30 p. m.; domingo 10:30 a. m. a 8:30 p. m.')
    expect(renglonesHorarioWeb(cedros)).toEqual([
      { dias: 'Lunes a sábado', horas: '7:30 a. m. – 8:30 p. m.' },
      { dias: 'Domingo', horas: '10:30 a. m. – 8:30 p. m.' },
    ])
  })

  it('Santa Marina: el rango da la vuelta a la semana («viernes a miércoles») y el jueves va aparte', () => {
    expect(textoHorarioBot(santaMarina)).toBe('viernes a miércoles 12:00 p. m. a 10:00 p. m.; jueves 1:00 p. m. a 10:00 p. m.')
    expect(renglonesHorarioWeb(santaMarina)).toEqual([
      { dias: 'Viernes a miércoles', horas: '12:00 p. m. – 10:00 p. m.' },
      { dias: 'Jueves', horas: '1:00 p. m. – 10:00 p. m.' },
    ])
  })

  it('todos los días iguales → «todos los días»; sin filas → vacío', () => {
    expect(textoHorarioBot(dias([0, 1, 2, 3, 4, 5, 6], '09:00', '18:00'))).toBe('todos los días 9:00 a. m. a 6:00 p. m.')
    expect(textoHorarioBot([])).toBe('')
    expect(renglonesHorarioWeb([])).toEqual([])
    expect(horarioJsonLd([])).toEqual([])
  })

  it('un día cerrado (sin fila) parte el rango y no aparece', () => {
    const sinMartes = dias([1, 3, 4, 5], '08:00', '17:00')
    expect(textoHorarioBot(sinMartes)).toBe('miércoles a viernes 8:00 a. m. a 5:00 p. m.; lunes 8:00 a. m. a 5:00 p. m.')
  })

  it('rangos de uno, dos y tres o más días', () => {
    expect(rangoDeDias([6])).toBe('sábado')
    expect(rangoDeDias([6, 0])).toBe('sábado y domingo')
    expect(rangoDeDias([1, 2, 3])).toBe('lunes a miércoles')
  })

  it('el orden de las filas no importa', () => {
    expect(textoHorarioBot([...cedros].reverse())).toBe(textoHorarioBot(cedros))
    expect(agruparHorario([...santaMarina].reverse())).toEqual(agruparHorario(santaMarina))
  })

  it('JSON-LD de schema.org: días en inglés y horas HH:MM', () => {
    expect(horarioJsonLd(cedros)).toEqual([
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], opens: '07:30', closes: '20:30' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Sunday', opens: '10:30', closes: '20:30' },
    ])
    expect(horarioJsonLd(santaMarina)).toEqual([
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday'], opens: '12:00', closes: '22:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Thursday', opens: '13:00', closes: '22:00' },
    ])
  })
})

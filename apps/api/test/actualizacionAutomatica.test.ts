// Temporizador que consulta solo a Mifact las boletas «En proceso» de días anteriores (ver
// src/mifact/actualizacionAutomatica.ts). El trabajo de fondo (qué comprobantes se consultan) se prueba en
// comprobantes.test.ts; aquí, el interruptor de la variable de entorno y que una vuelta nunca lanza ni se pisa.
import { describe, expect, it, vi } from 'vitest'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'
import { actualizacionAutomaticaActiva, vueltaDeActualizacion } from '../src/mifact/actualizacionAutomatica.js'

const hayBaseDeDatosReal = !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

describe('MIFACT_ACTUALIZACION_AUTOMATICA', () => {
  it('viene encendida; solo se apaga con un «no» explícito', () => {
    expect(actualizacionAutomaticaActiva({})).toBe(true)
    expect(actualizacionAutomaticaActiva({ MIFACT_ACTUALIZACION_AUTOMATICA: '' })).toBe(true)
    expect(actualizacionAutomaticaActiva({ MIFACT_ACTUALIZACION_AUTOMATICA: 'true' })).toBe(true)
    for (const v of ['false', 'FALSE', ' false ', '0', 'no', 'off'])
      expect(actualizacionAutomaticaActiva({ MIFACT_ACTUALIZACION_AUTOMATICA: v }), v).toBe(false)
  })
})

describe.skipIf(!hayBaseDeDatosReal)('una vuelta de actualización', () => {
  const log = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })

  it('si no existe el tenant lo deja en el log y no lanza', async () => {
    const l = log()
    await expect(vueltaDeActualizacion('tenant-que-no-existe', l)).resolves.toBeUndefined()
    expect(l.error).toHaveBeenCalledTimes(1)
  })

  it('dos vueltas a la vez no se pisan: la segunda se salta', async () => {
    const l = log()
    // Con un tenant inexistente cada vuelta hace una consulta a la base antes de salir: la segunda llega mientras la primera sigue.
    await Promise.all([vueltaDeActualizacion('tenant-que-no-existe', l), vueltaDeActualizacion('tenant-que-no-existe', l)])
    expect(l.error).toHaveBeenCalledTimes(1)
  })
})

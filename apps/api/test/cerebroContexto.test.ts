// construirMensajesParaModelo: qué historial viaja a Claude. Pura, sin base ni
// modelo — el costo por turno depende de esto: los mensajes importados de la
// sincronización de Coexistence (hasta 20 por conversación) NO deben viajar.
import { describe, expect, it } from 'vitest'
import { construirMensajesParaModelo, type TurnoHistorial } from '../src/bot/cerebro.js'

const t = (rol: TurnoHistorial['rol'], texto: string, extra: Partial<TurnoHistorial> = {}): TurnoHistorial => ({
  rol,
  texto,
  en: '2026-10-03T12:00:00Z',
  ...extra,
})

describe('construirMensajesParaModelo', () => {
  it('sin historial: solo el mensaje entrante', () => {
    expect(construirMensajesParaModelo([], 'hola')).toEqual([{ role: 'user', content: 'hola' }])
  })

  it('cliente → user; bot y operador → assistant', () => {
    const m = construirMensajesParaModelo([t('cliente', 'a'), t('bot', 'b'), t('operador', 'c')], 'd')
    expect(m.map((x) => x.role)).toEqual(['user', 'assistant', 'assistant', 'user'])
  })

  it('EXCLUYE todos los importados (ni uno solo viaja al modelo)', () => {
    const historial = [
      ...Array.from({ length: 20 }, (_, i) => t(i % 2 ? 'operador' : 'cliente', `viejo-${i}`, { importado: true })),
      t('cliente', 'real-1'),
      t('bot', 'real-2'),
    ]
    const m = construirMensajesParaModelo(historial, 'nuevo')
    expect(m).toHaveLength(3)
    expect(JSON.stringify(m)).not.toContain('viejo-')
  })

  it('si lo primero que queda es del asistente (el equipo escribió primero), antepone un turno de usuario neutro — nunca empieza con assistant', () => {
    const m = construirMensajesParaModelo([t('operador', 'Hola, te escribo por tu pedido')], 'ok, gracias')
    expect(m[0].role).toBe('user')
    expect(m[1]).toEqual({ role: 'assistant', content: 'Hola, te escribo por tu pedido' })
    expect(m[2]).toEqual({ role: 'user', content: 'ok, gracias' })
  })

  it('si lo único que había eran importados, el modelo ve solo el mensaje nuevo', () => {
    const m = construirMensajesParaModelo([t('cliente', 'x', { importado: true }), t('operador', 'y', { importado: true })], 'hola')
    expect(m).toEqual([{ role: 'user', content: 'hola' }])
  })
})

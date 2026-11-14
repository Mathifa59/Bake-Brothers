// La API tiene que ARRANCAR y funcionar en producción con solo DATABASE_URL: WhatsApp sin conectar (sin META_APP_SECRET ni
// WHATSAPP_TOKEN_ENCRYPTION_KEY), sin DATOS_PAGO (el bot pasa el cobro a una persona: reglasLanzamiento.test.ts), sin clave
// de Anthropic y sin VAPID. Antes, la falta de WHATSAPP_TOKEN_ENCRYPTION_KEY en producción tumbaba el arranque.
// El arranque real (node dist/server.js con solo DATABASE_URL → /health, webhook 503, productos 200) se probó a mano el
// 2026-11-13; esto deja lo esencial como prueba automática, sin base ni red.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { avisosDeArranque } from '../src/avisosDeArranque.js'

const CLAVE_VALIDA = 'a'.repeat(64)

async function importarEnv(variables: Record<string, string>) {
  vi.resetModules()
  for (const [k, v] of Object.entries(variables)) vi.stubEnv(k, v)
  return import('../src/env.js')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('env.ts en producción', () => {
  it('arranca SIN WHATSAPP_TOKEN_ENCRYPTION_KEY (WhatsApp todavía sin conectar)', async () => {
    const { env } = await importarEnv({ NODE_ENV: 'production', WHATSAPP_TOKEN_ENCRYPTION_KEY: '' })
    expect(env.NODE_ENV).toBe('production')
  })

  it('con la clave puesta, sigue arrancando; y una clave mal formada SÍ se rechaza (no se acepta basura)', async () => {
    await expect(importarEnv({ NODE_ENV: 'production', WHATSAPP_TOKEN_ENCRYPTION_KEY: CLAVE_VALIDA })).resolves.toBeDefined()
    await expect(importarEnv({ NODE_ENV: 'production', WHATSAPP_TOKEN_ENCRYPTION_KEY: 'esto-no-es-una-clave' })).rejects.toThrow(/AES-256/)
  })

  it('sin la clave, cifrar un token falla VISIBLE al primer uso real (no se inventa una clave)', async () => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('WHATSAPP_TOKEN_ENCRYPTION_KEY', '')
    const { cifrarTokenWhatsApp } = await import('../src/bot/tokensWhatsApp.js')
    expect(() => cifrarTokenWhatsApp('token')).toThrow(/Falta WHATSAPP_TOKEN_ENCRYPTION_KEY/)
  })
})

describe('avisosDeArranque — qué falta y qué pasa mientras tanto', () => {
  it('con el entorno vacío avisa de las 5 funciones apagadas, cada una con su consecuencia', () => {
    const avisos = avisosDeArranque({})
    expect(avisos.map((a) => a.variable)).toEqual([
      'WHATSAPP_TOKEN_ENCRYPTION_KEY',
      'META_APP_SECRET',
      'DATOS_PAGO',
      'ANTHROPIC_API_KEY',
      'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY',
    ])
    expect(avisos.every((a) => a.consecuencia.length > 20)).toBe(true)
    expect(avisos.find((a) => a.variable === 'DATOS_PAGO')?.consecuencia).toMatch(/persona/)
    expect(avisos.find((a) => a.variable === 'META_APP_SECRET')?.consecuencia).toMatch(/503/)
  })

  it('con todo configurado no avisa de nada (y un valor en blanco cuenta como faltante)', () => {
    const todo = {
      WHATSAPP_TOKEN_ENCRYPTION_KEY: CLAVE_VALIDA,
      META_APP_SECRET: 'x',
      DATOS_PAGO: 'Yape 999 999 999',
      ANTHROPIC_API_KEY: 'x',
      VAPID_PUBLIC_KEY: 'x',
      VAPID_PRIVATE_KEY: 'x',
    }
    expect(avisosDeArranque(todo)).toEqual([])
    expect(avisosDeArranque({ ...todo, DATOS_PAGO: '   ' }).map((a) => a.variable)).toEqual(['DATOS_PAGO'])
    expect(avisosDeArranque({ ...todo, VAPID_PRIVATE_KEY: '' }).map((a) => a.variable)).toEqual(['VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY'])
  })
})

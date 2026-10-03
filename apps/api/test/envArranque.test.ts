// El servidor debe fallar al ARRANCAR (no al primer envío) si en producción
// falta o es inválida WHATSAPP_TOKEN_ENCRYPTION_KEY. env.ts valida process.env
// al importarse — acá se reimporta con distintas variables.
import { afterEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL = { ...process.env }

async function importarEnvCon(vars: Record<string, string | undefined>) {
  vi.resetModules()
  process.env = { ...ORIGINAL }
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  return import('../src/env.js')
}

afterEach(() => {
  process.env = { ...ORIGINAL }
  vi.resetModules()
})

const CLAVE_VALIDA = 'a'.repeat(64)

describe('env.ts — arranque estricto de WHATSAPP_TOKEN_ENCRYPTION_KEY', () => {
  it('en producción SIN la clave: lanza al importar, nombrando la variable', async () => {
    await expect(importarEnvCon({ NODE_ENV: 'production', WHATSAPP_TOKEN_ENCRYPTION_KEY: undefined })).rejects.toThrow(
      /WHATSAPP_TOKEN_ENCRYPTION_KEY/
    )
  })

  it('en producción con la clave vacía: también lanza', async () => {
    await expect(importarEnvCon({ NODE_ENV: 'production', WHATSAPP_TOKEN_ENCRYPTION_KEY: '' })).rejects.toThrow(
      /WHATSAPP_TOKEN_ENCRYPTION_KEY/
    )
  })

  it('en producción con una clave inválida (largo incorrecto): lanza', async () => {
    await expect(importarEnvCon({ NODE_ENV: 'production', WHATSAPP_TOKEN_ENCRYPTION_KEY: 'muy-corta' })).rejects.toThrow(
      /AES-256/
    )
  })

  it('en producción con una clave válida: arranca', async () => {
    const { env } = await importarEnvCon({ NODE_ENV: 'production', WHATSAPP_TOKEN_ENCRYPTION_KEY: CLAVE_VALIDA })
    expect(env.WHATSAPP_TOKEN_ENCRYPTION_KEY).toBe(CLAVE_VALIDA)
  })

  it('fuera de producción sin la clave: arranca (dev/test), pero una clave presente e inválida igual lanza', async () => {
    const { env } = await importarEnvCon({ NODE_ENV: 'development', WHATSAPP_TOKEN_ENCRYPTION_KEY: undefined })
    expect(env.WHATSAPP_TOKEN_ENCRYPTION_KEY).toBeUndefined()
    await expect(importarEnvCon({ NODE_ENV: 'development', WHATSAPP_TOKEN_ENCRYPTION_KEY: 'basura' })).rejects.toThrow(
      /AES-256/
    )
  })

  it('AUTO_RETORNO_BOT_HORAS: 3 por defecto, configurable, y rechaza valores no positivos', async () => {
    const porDefecto = await importarEnvCon({ AUTO_RETORNO_BOT_HORAS: undefined })
    expect(porDefecto.env.AUTO_RETORNO_BOT_HORAS).toBe(3)
    const cinco = await importarEnvCon({ AUTO_RETORNO_BOT_HORAS: '5' })
    expect(cinco.env.AUTO_RETORNO_BOT_HORAS).toBe(5)
    await expect(importarEnvCon({ AUTO_RETORNO_BOT_HORAS: '0' })).rejects.toThrow(/AUTO_RETORNO_BOT_HORAS/)
  })
})

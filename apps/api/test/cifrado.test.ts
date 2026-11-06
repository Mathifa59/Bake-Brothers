import { describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import { cifrarToken, descifrarToken, parsearClaveCifrado } from '../src/bot/cifrado.js'

const CLAVE_HEX = crypto.randomBytes(32).toString('hex')
const clave = parsearClaveCifrado(CLAVE_HEX)!

describe('cifrado de tokens de WhatsApp (AES-256-GCM)', () => {
  it('ida y vuelta: descifrar devuelve exactamente el token original', () => {
    const token = 'EAAG' + 'x'.repeat(180) + '🙂'
    expect(descifrarToken(cifrarToken(token, clave), clave)).toBe(token)
  })

  it('el valor guardado NO contiene el token en claro y tiene el formato versionado', () => {
    const token = 'EAAGsecretotokendenegocio'
    const guardado = cifrarToken(token, clave)
    expect(guardado).not.toContain(token)
    expect(guardado.split('.')).toHaveLength(4)
    expect(guardado.startsWith('v1.')).toBe(true)
  })

  it('cifrar dos veces el mismo token da valores distintos (IV aleatorio)', () => {
    expect(cifrarToken('mismo', clave)).not.toBe(cifrarToken('mismo', clave))
  })

  it('con otra clave NO descifra (lanza, no devuelve basura)', () => {
    const otra = crypto.randomBytes(32)
    expect(() => descifrarToken(cifrarToken('secreto', clave), otra)).toThrow()
  })

  it('un valor alterado en la base NO descifra (integridad de GCM)', () => {
    const [v, iv, tag, ct] = cifrarToken('secreto', clave).split('.')
    const ctAlterado = Buffer.from(ct, 'base64')
    ctAlterado[0] ^= 0xff
    expect(() => descifrarToken([v, iv, tag, ctAlterado.toString('base64')].join('.'), clave)).toThrow()
  })

  it('rechaza un formato que no es el nuestro', () => {
    expect(() => descifrarToken('texto-cualquiera', clave)).toThrow(/formato/)
    expect(() => descifrarToken('v9.a.b.c', clave)).toThrow(/formato/)
  })

  describe('parsearClaveCifrado', () => {
    it('acepta 32 bytes en hex y en base64', () => {
      const bytes = crypto.randomBytes(32)
      expect(parsearClaveCifrado(bytes.toString('hex'))?.equals(bytes)).toBe(true)
      expect(parsearClaveCifrado(bytes.toString('base64'))?.equals(bytes)).toBe(true)
    })

    it('rechaza claves de largo incorrecto o no codificadas', () => {
      expect(parsearClaveCifrado('corta')).toBeNull()
      expect(parsearClaveCifrado(crypto.randomBytes(16).toString('hex'))).toBeNull()
      expect(parsearClaveCifrado('z'.repeat(64))).toBeNull()
      expect(parsearClaveCifrado('')).toBeNull()
    })
  })
})

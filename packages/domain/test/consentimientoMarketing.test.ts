import { describe, expect, it } from 'vitest'
import { puedeRecibirEnvioMasivo } from '../src/consentimientoMarketing.js'

describe('puedeRecibirEnvioMasivo — ningún envío masivo sin consentimiento marcado', () => {
  it('solo con consentimiento en true y teléfono', () => {
    expect(puedeRecibirEnvioMasivo({ telefono: '+51912944096', acepta_marketing: true })).toBe(true)
  })

  it('sin responder (null/undefined) NO: es el caso de los contactos importados de la agenda', () => {
    expect(puedeRecibirEnvioMasivo({ telefono: '+51912944096', acepta_marketing: null })).toBe(false)
    expect(puedeRecibirEnvioMasivo({ telefono: '+51912944096' })).toBe(false)
  })

  it('si dijo que no, NO', () => {
    expect(puedeRecibirEnvioMasivo({ telefono: '+51912944096', acepta_marketing: false })).toBe(false)
  })

  it('sin teléfono no hay a quién enviar, aunque haya consentimiento', () => {
    expect(puedeRecibirEnvioMasivo({ telefono: null, acepta_marketing: true })).toBe(false)
    expect(puedeRecibirEnvioMasivo({ telefono: '', acepta_marketing: true })).toBe(false)
  })

  it('un cliente interno (envío a un local propio) nunca recibe envíos masivos', () => {
    expect(puedeRecibirEnvioMasivo({ telefono: '+51912944096', acepta_marketing: true, es_interno: true })).toBe(false)
  })
})

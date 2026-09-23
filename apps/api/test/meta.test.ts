import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { verificarFirmaWebhook } from '../src/bot/meta.js'

const APP_SECRET = 'un-app-secret-de-prueba-no-real'

function firmarComoMeta(body: Buffer, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')
}

describe('verificarFirmaWebhook', () => {
  it('acepta una firma real calculada con el mismo secret', () => {
    const body = Buffer.from(JSON.stringify({ entry: [{ id: '123' }] }))
    const firma = firmarComoMeta(body, APP_SECRET)
    expect(verificarFirmaWebhook(body, firma, APP_SECRET)).toBe(true)
  })

  it('rechaza una firma calculada con un secret distinto', () => {
    const body = Buffer.from(JSON.stringify({ entry: [{ id: '123' }] }))
    const firma = firmarComoMeta(body, 'otro-secret-distinto')
    expect(verificarFirmaWebhook(body, firma, APP_SECRET)).toBe(false)
  })

  it('rechaza si el body fue alterado después de firmarlo (misma firma, body distinto)', () => {
    const bodyOriginal = Buffer.from(JSON.stringify({ entry: [{ id: '123' }] }))
    const firma = firmarComoMeta(bodyOriginal, APP_SECRET)
    const bodyAlterado = Buffer.from(JSON.stringify({ entry: [{ id: '999' }] }))
    expect(verificarFirmaWebhook(bodyAlterado, firma, APP_SECRET)).toBe(false)
  })

  it('rechaza sin header de firma', () => {
    const body = Buffer.from('{}')
    expect(verificarFirmaWebhook(body, undefined, APP_SECRET)).toBe(false)
  })

  it('rechaza un header con formato inválido (sin "sha256=")', () => {
    const body = Buffer.from('{}')
    expect(verificarFirmaWebhook(body, 'no-tiene-el-formato-esperado', APP_SECRET)).toBe(false)
  })

  it('rechaza un header con hex inválido sin tronar', () => {
    const body = Buffer.from('{}')
    expect(verificarFirmaWebhook(body, 'sha256=no-es-hexadecimal-esto', APP_SECRET)).toBe(false)
  })
})

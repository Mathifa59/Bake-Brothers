import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import crypto from 'node:crypto'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { verificarFirmaWebhook, enviarMensajeMeta } = await import('../src/bot/meta.js')

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

// enviarMensajeMeta — sin Postgres, sin credenciales reales de Meta: fetch
// está mockeado, nunca sale un request real. Prueba la lógica real de la
// llamada (URL, headers, body, manejo de error), no que "algún día funcione
// contra la API real" — eso no se puede probar sin un token permanente
// real, que todavía no existe (ver CLAUDE.md §9).
describe('enviarMensajeMeta', () => {
  const tokenOriginal = process.env.META_WHATSAPP_TOKEN

  beforeEach(() => {
    mockFetch.mockReset()
  })

  afterEach(() => {
    if (tokenOriginal === undefined) delete process.env.META_WHATSAPP_TOKEN
    else process.env.META_WHATSAPP_TOKEN = tokenOriginal
  })

  it('falla visiblemente si falta META_WHATSAPP_TOKEN — nunca en silencio', async () => {
    delete process.env.META_WHATSAPP_TOKEN
    await expect(enviarMensajeMeta('whatsapp', 'PHONE_ID', '51999999999', 'hola')).rejects.toThrow(
      /META_WHATSAPP_TOKEN/
    )
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('rechaza canales distintos de whatsapp (Messenger/Instagram sin envío real todavía)', async () => {
    process.env.META_WHATSAPP_TOKEN = 'token-de-prueba'
    await expect(enviarMensajeMeta('facebook', 'PAGE_ID', 'PSID', 'hola')).rejects.toThrow(/facebook/)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('hace la llamada real correcta a la Cloud API cuando hay token (fetch mockeado)', async () => {
    process.env.META_WHATSAPP_TOKEN = 'token-de-prueba-real'
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => '' })

    await enviarMensajeMeta('whatsapp', 'PHONE_ID_123', '51987654321', 'Tu pedido BB-1000 quedó confirmado 😊')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, opciones] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://graph.facebook.com/v21.0/PHONE_ID_123/messages')
    expect(opciones.method).toBe('POST')
    expect((opciones.headers as Record<string, string>).Authorization).toBe('Bearer token-de-prueba-real')
    expect((opciones.headers as Record<string, string>)['Content-Type']).toBe('application/json')

    const body = JSON.parse(opciones.body as string)
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      to: '51987654321',
      type: 'text',
      text: { body: 'Tu pedido BB-1000 quedó confirmado 😊' },
    })
  })

  it('lanza con el detalle real cuando Meta responde un error', async () => {
    process.env.META_WHATSAPP_TOKEN = 'token-de-prueba'
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => '{"error":{"message":"Invalid OAuth access token"}}',
    })

    await expect(enviarMensajeMeta('whatsapp', 'PHONE_ID', '51999999999', 'hola')).rejects.toThrow(
      /401.*Invalid OAuth access token/s
    )
  })
})

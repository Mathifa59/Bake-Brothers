import { beforeEach, describe, expect, it, vi } from 'vitest'
import crypto from 'node:crypto'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// El token sale de whatsapp_conexiones (una por número) — acá se mockea la
// búsqueda para probar SOLO la llamada a la Cloud API sin Postgres. La
// búsqueda + descifrado real contra la base se prueba en
// test/whatsappConexiones.test.ts.
const mockObtenerToken = vi.fn()
vi.mock('../src/bot/tokensWhatsApp.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/bot/tokensWhatsApp.js')>()),
  obtenerTokenWhatsApp: (...args: unknown[]) => mockObtenerToken(...args),
}))

const { verificarFirmaWebhook, enviarMensajeMeta } = await import('../src/bot/meta.js')
const { ConexionWhatsAppNoEncontradaError } = await import('../src/bot/tokensWhatsApp.js')

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
// llamada (URL, headers, body, manejo de error, token por número), no que
// "algún día funcione contra la API real" — eso solo se puede probar con un
// número conectado de verdad (ver CLAUDE.md §9).
describe('enviarMensajeMeta', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockObtenerToken.mockReset()
  })

  it('falla visiblemente si el número no tiene conexión — nunca en silencio ni con el token de otro número', async () => {
    mockObtenerToken.mockRejectedValueOnce(new ConexionWhatsAppNoEncontradaError('PHONE_ID'))
    await expect(enviarMensajeMeta('whatsapp', 'PHONE_ID', '51999999999', 'hola')).rejects.toThrow(
      /No hay una conexión de WhatsApp activa para el número PHONE_ID/
    )
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('rechaza canales distintos de whatsapp (Messenger/Instagram sin envío real todavía)', async () => {
    await expect(enviarMensajeMeta('facebook', 'PAGE_ID', 'PSID', 'hola')).rejects.toThrow(/facebook/)
    expect(mockObtenerToken).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('hace la llamada real correcta a la Cloud API con el token de ESE número (fetch mockeado)', async () => {
    mockObtenerToken.mockResolvedValueOnce('token-de-negocio-de-ese-numero')
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.ABC123' }] }),
    })

    const resultado = await enviarMensajeMeta('whatsapp', 'PHONE_ID_123', '51987654321', 'Tu pedido BB-1000 quedó confirmado 😊')

    expect(mockObtenerToken).toHaveBeenCalledWith('PHONE_ID_123')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, opciones] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://graph.facebook.com/v21.0/PHONE_ID_123/messages')
    expect(opciones.method).toBe('POST')
    expect((opciones.headers as Record<string, string>).Authorization).toBe('Bearer token-de-negocio-de-ese-numero')
    expect((opciones.headers as Record<string, string>)['Content-Type']).toBe('application/json')

    const body = JSON.parse(opciones.body as string)
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      to: '51987654321',
      type: 'text',
      text: { body: 'Tu pedido BB-1000 quedó confirmado 😊' },
    })
    // El wamid queda disponible para que el caller lo registre (anti-eco de Coexistence).
    expect(resultado).toEqual({ wamid: 'wamid.ABC123' })
  })

  it('devuelve wamid null (sin romper) si Meta responde ok sin cuerpo parseable', async () => {
    mockObtenerToken.mockResolvedValueOnce('t')
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => '' })
    await expect(enviarMensajeMeta('whatsapp', 'P', '51999999999', 'hola')).resolves.toEqual({ wamid: null })
  })

  it('dos números distintos usan cada uno SU token', async () => {
    mockObtenerToken.mockImplementation(async (id: string) => `token-de-${id}`)
    mockFetch.mockResolvedValue({ ok: true, text: async () => '' })

    await enviarMensajeMeta('whatsapp', 'CEDROS', '51900000001', 'a')
    await enviarMensajeMeta('whatsapp', 'SANTA_MARINA', '51900000002', 'b')

    const auth = mockFetch.mock.calls.map(([, o]) => (o as RequestInit & { headers: Record<string, string> }).headers.Authorization)
    expect(auth).toEqual(['Bearer token-de-CEDROS', 'Bearer token-de-SANTA_MARINA'])
  })

  it('lanza con el detalle real cuando Meta responde un error', async () => {
    mockObtenerToken.mockResolvedValueOnce('token-de-prueba')
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

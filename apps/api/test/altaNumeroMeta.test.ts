// Alta del número en Meta (src/bot/altaNumeroMeta.ts) con `fetch` simulado: nunca sale un request real.
import { describe, expect, it, vi } from 'vitest'
import { altaNumeroMeta, validarPeticionAlta } from '../src/bot/altaNumeroMeta.js'

const TOKEN = 'EAAG-token-de-prueba-que-no-debe-aparecer-en-ningun-informe'
const peticion = { graphVersion: 'v21.0', phoneNumberId: '1234567890', wabaId: '9876543210', token: TOKEN, pin: '123456' }

const respuesta = (cuerpo: unknown, ok = true, estado = 200) => ({ ok, status: estado, json: async () => cuerpo }) as Response

function fetchFeliz() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/register')) return respuesta({ success: true })
    if (url.includes('subscribed_apps') && init?.method === 'POST') return respuesta({ success: true })
    if (url.includes('subscribed_apps')) return respuesta({ data: [{ whatsapp_business_api_data: { name: 'App' } }] })
    return respuesta({ display_phone_number: '+51 912 944 096', verified_name: 'Bake Brothers', quality_rating: 'GREEN' })
  })
}

describe('validación de la petición', () => {
  it('rechaza ids no numéricos, PIN que no sea de 6 dígitos y tokens vacíos', () => {
    expect(validarPeticionAlta(peticion)).toBeNull()
    expect(validarPeticionAlta({ ...peticion, phoneNumberId: '12ab' })).toMatch(/phone_number_id/)
    expect(validarPeticionAlta({ ...peticion, wabaId: '' })).toMatch(/WABA/)
    expect(validarPeticionAlta({ ...peticion, pin: '12345' })).toMatch(/PIN/)
    expect(validarPeticionAlta({ ...peticion, token: 'corto' })).toMatch(/token/)
  })
})

describe('altaNumeroMeta', () => {
  it('hace los 4 pasos en orden, con el token en el header y el PIN solo en el registro', async () => {
    const f = fetchFeliz()
    const informe = await altaNumeroMeta(peticion, f as unknown as typeof fetch)
    expect(informe.ok).toBe(true)
    expect(informe.pasos.map((p) => p.paso)).toEqual(['verificar_numero', 'registrar_numero', 'suscribir_app', 'verificar_suscripcion'])

    const llamadas = f.mock.calls.map(([url, init]) => [init?.method, url])
    expect(llamadas[0][1]).toContain('https://graph.facebook.com/v21.0/1234567890?fields=')
    expect(llamadas[1]).toEqual(['POST', 'https://graph.facebook.com/v21.0/1234567890/register'])
    expect(llamadas[2]).toEqual(['POST', 'https://graph.facebook.com/v21.0/9876543210/subscribed_apps'])
    expect(llamadas[3]).toEqual(['GET', 'https://graph.facebook.com/v21.0/9876543210/subscribed_apps'])

    for (const [, init] of f.mock.calls) expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
    expect(JSON.parse(f.mock.calls[1][1]?.body as string)).toEqual({ messaging_product: 'whatsapp', pin: '123456' })
    expect(f.mock.calls.filter(([, init]) => String(init?.body ?? '').includes('123456'))).toHaveLength(1)
  })

  it('el informe nunca trae el token ni el PIN', async () => {
    const informe = await altaNumeroMeta(peticion, fetchFeliz() as unknown as typeof fetch)
    const texto = JSON.stringify(informe)
    expect(texto).not.toContain(TOKEN)
    expect(texto).not.toContain('123456')
  })

  it('si el token no ve el número, se detiene ahí: no registra ni suscribe', async () => {
    const f = vi.fn(async () => respuesta({ error: { message: 'Invalid OAuth access token.', code: 190 } }, false, 400))
    const informe = await altaNumeroMeta(peticion, f as unknown as typeof fetch)
    expect(informe.ok).toBe(false)
    expect(informe.pasos).toEqual([{ paso: 'verificar_numero', ok: false, detalle: 'Invalid OAuth access token. (código 190)' }])
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('si el registro falla (PIN incorrecto), no suscribe la app', async () => {
    const f = vi.fn(async (url: string) =>
      url.includes('/register')
        ? respuesta({ error: { message: 'Incorrect PIN', code: 133005, error_subcode: 2388001 } }, false, 400)
        : respuesta({ display_phone_number: '+51 912 944 096' })
    )
    const informe = await altaNumeroMeta(peticion, f as unknown as typeof fetch)
    expect(informe.ok).toBe(false)
    expect(informe.pasos.at(-1)).toMatchObject({ paso: 'registrar_numero', ok: false })
    expect(informe.pasos.at(-1)?.detalle).toContain('133005/2388001')
    expect(f.mock.calls.some(([url]) => String(url).includes('subscribed_apps'))).toBe(false)
  })

  it('si la cuenta no muestra la app suscrita, avisa en vez de dar el alta por buena', async () => {
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/register')) return respuesta({ success: true })
      if (url.includes('subscribed_apps') && init?.method === 'POST') return respuesta({ success: true })
      if (url.includes('subscribed_apps')) return respuesta({ data: [] })
      return respuesta({ display_phone_number: '+51 912 944 096' })
    })
    const informe = await altaNumeroMeta(peticion, f as unknown as typeof fetch)
    expect(informe.ok).toBe(false)
    expect(informe.pasos.at(-1)).toMatchObject({ paso: 'verificar_suscripcion', ok: false })
  })

  it('con datos inválidos no llama a Meta', async () => {
    const f = vi.fn()
    const informe = await altaNumeroMeta({ ...peticion, pin: 'abc' }, f as unknown as typeof fetch)
    expect(informe.ok).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })
})

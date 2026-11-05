/**
 * Alta de un número de WhatsApp en la API de Meta (Cloud API). Tres pasos, en este orden, y se detiene en el
 * primero que falle (no deja el número a medias sin avisar):
 *
 *   1. GET  /{phone-number-id}            comprueba que el token ve el número y que el número es de esa cuenta.
 *   2. POST /{phone-number-id}/register   registra el número en la Cloud API con el PIN de verificación en dos pasos
 *                                         (6 dígitos; si el número no tenía PIN, este queda como el PIN nuevo).
 *   3. POST /{waba-id}/subscribed_apps    suscribe la app a la cuenta de WhatsApp: sin esto Meta no manda los mensajes
 *                                         entrantes al webhook.
 *
 * Después se verifica con GET /{waba-id}/subscribed_apps. El token y el PIN solo viajan en el header / cuerpo de
 * cada llamada: nunca se devuelven en el informe ni se escriben en ningún log.
 */

export interface PeticionAltaNumero {
  graphVersion: string
  phoneNumberId: string
  wabaId: string
  /** Token del usuario del sistema (no vence). */
  token: string
  /** PIN de 6 dígitos de la verificación en dos pasos. */
  pin: string
}

export interface PasoAlta {
  paso: 'verificar_numero' | 'registrar_numero' | 'suscribir_app' | 'verificar_suscripcion'
  ok: boolean
  /** Mensaje de Meta si falló, o un resumen si salió bien. Sin secretos. */
  detalle: string
}

export interface InformeAlta {
  ok: boolean
  numero: { visible: string | null; nombreVerificado: string | null; calidad: string | null } | null
  pasos: PasoAlta[]
}

type Fetch = typeof fetch

const SOLO_DIGITOS = /^\d+$/

export function validarPeticionAlta(p: PeticionAltaNumero): string | null {
  if (!SOLO_DIGITOS.test(p.phoneNumberId)) return 'El phone_number_id debe ser numérico.'
  if (!SOLO_DIGITOS.test(p.wabaId)) return 'El WABA ID debe ser numérico.'
  if (!/^\d{6}$/.test(p.pin)) return 'El PIN debe tener exactamente 6 dígitos.'
  if (p.token.trim().length < 20) return 'El token parece incompleto.'
  return null
}

async function llamar(
  f: Fetch,
  url: string,
  token: string,
  metodo: 'GET' | 'POST',
  cuerpo?: Record<string, unknown>
): Promise<{ ok: boolean; estado: number; json: Record<string, unknown> }> {
  const res = await f(url, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { ok: res.ok, estado: res.status, json }
}

function mensajeDeMeta(json: Record<string, unknown>, estado: number): string {
  const e = json.error as { message?: string; code?: number; error_subcode?: number } | undefined
  if (!e) return `Meta respondió ${estado}.`
  return `${e.message ?? 'Error de Meta'} (código ${e.code ?? '?'}${e.error_subcode ? `/${e.error_subcode}` : ''})`
}

export async function altaNumeroMeta(p: PeticionAltaNumero, f: Fetch = fetch): Promise<InformeAlta> {
  const error = validarPeticionAlta(p)
  if (error) return { ok: false, numero: null, pasos: [{ paso: 'verificar_numero', ok: false, detalle: error }] }

  const base = `https://graph.facebook.com/${p.graphVersion}`
  const pasos: PasoAlta[] = []
  let numero: InformeAlta['numero'] = null
  const falla = (paso: PasoAlta['paso'], detalle: string): InformeAlta => {
    pasos.push({ paso, ok: false, detalle })
    return { ok: false, numero, pasos }
  }

  // 1. El token ve el número.
  const info = await llamar(
    f,
    `${base}/${p.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`,
    p.token,
    'GET'
  )
  if (!info.ok) return falla('verificar_numero', mensajeDeMeta(info.json, info.estado))
  numero = {
    visible: (info.json.display_phone_number as string) ?? null,
    nombreVerificado: (info.json.verified_name as string) ?? null,
    calidad: (info.json.quality_rating as string) ?? null,
  }
  pasos.push({ paso: 'verificar_numero', ok: true, detalle: `${numero.visible ?? p.phoneNumberId} · ${numero.nombreVerificado ?? 'sin nombre verificado'}` })

  // 2. Registro en la Cloud API.
  const registro = await llamar(f, `${base}/${p.phoneNumberId}/register`, p.token, 'POST', {
    messaging_product: 'whatsapp',
    pin: p.pin,
  })
  if (!registro.ok || registro.json.success === false) return falla('registrar_numero', mensajeDeMeta(registro.json, registro.estado))
  pasos.push({ paso: 'registrar_numero', ok: true, detalle: 'Número registrado en la Cloud API.' })

  // 3. Suscripción de la app a la cuenta de WhatsApp (para que lleguen los mensajes al webhook).
  const suscripcion = await llamar(f, `${base}/${p.wabaId}/subscribed_apps`, p.token, 'POST', {})
  if (!suscripcion.ok || suscripcion.json.success === false) return falla('suscribir_app', mensajeDeMeta(suscripcion.json, suscripcion.estado))
  pasos.push({ paso: 'suscribir_app', ok: true, detalle: 'App suscrita a la cuenta de WhatsApp.' })

  // 4. Comprobación: la app aparece suscrita.
  const lista = await llamar(f, `${base}/${p.wabaId}/subscribed_apps`, p.token, 'GET')
  const apps = Array.isArray(lista.json.data) ? (lista.json.data as unknown[]) : []
  if (!lista.ok || apps.length === 0) {
    return falla('verificar_suscripcion', lista.ok ? 'La cuenta no muestra ninguna app suscrita.' : mensajeDeMeta(lista.json, lista.estado))
  }
  pasos.push({ paso: 'verificar_suscripcion', ok: true, detalle: `${apps.length} app(s) suscrita(s) a la cuenta.` })

  return { ok: true, numero, pasos }
}

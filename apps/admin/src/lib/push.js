import { guardarSuscripcionPush, quitarSuscripcionPush, traerClavePush } from './apiClient'

/**
 * Notificaciones push del panel (Web Push). Estados de este celular/navegador:
 *   'no-soportado'      el navegador no sabe de push (o no hay service worker).
 *   'instalar'          iPhone/iPad: Apple solo deja recibir avisos si el panel está instalado en la pantalla de inicio.
 *   'bloqueado'         el permiso está negado en el navegador (hay que cambiarlo en los ajustes del teléfono).
 *   'inactivo'          se puede activar.
 *   'activo'            ya está suscrito.
 */
export const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const estaInstalado = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true

const soportaPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export async function estadoPush() {
  if (!soportaPush()) return esIOS() && !estaInstalado() ? 'instalar' : 'no-soportado'
  if (Notification.permission === 'denied') return 'bloqueado'
  const reg = await navigator.serviceWorker.getRegistration()
  const suscripcion = await reg?.pushManager.getSubscription()
  return suscripcion && Notification.permission === 'granted' ? 'activo' : 'inactivo'
}

function claveABytes(base64Url) {
  const relleno = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + relleno).replace(/-/g, '+').replace(/_/g, '/')
  const crudo = atob(base64)
  return Uint8Array.from([...crudo].map((c) => c.charCodeAt(0)))
}

/** Pide el permiso, suscribe este dispositivo y le pasa las llaves a la API. Lanza con un mensaje legible si falla. */
export async function activarPush() {
  if (!soportaPush()) throw new Error('Este navegador no permite notificaciones.')
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') throw new Error('No diste permiso para las notificaciones. Puedes cambiarlo en los ajustes del teléfono.')
  const reg = await navigator.serviceWorker.ready
  const clave = await traerClavePush()
  let suscripcion = await reg.pushManager.getSubscription()
  // Si la clave del servidor cambió, la suscripción vieja ya no sirve: se rehace.
  if (suscripcion) {
    const actual = suscripcion.options?.applicationServerKey
    const igual = actual && new Uint8Array(actual).toString() === claveABytes(clave).toString()
    if (!igual) {
      await suscripcion.unsubscribe()
      suscripcion = null
    }
  }
  suscripcion ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(clave) })
  await guardarSuscripcionPush(suscripcion.toJSON())
}

export async function desactivarPush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const suscripcion = await reg?.pushManager.getSubscription()
  if (!suscripcion) return
  await quitarSuscripcionPush(suscripcion.endpoint).catch(() => {})
  await suscripcion.unsubscribe()
}

// ——— Instalar el panel como app ———
let eventoInstalacion = null
const oyentes = new Set()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    eventoInstalacion = e
    oyentes.forEach((f) => f())
  })
  window.addEventListener('appinstalled', () => {
    eventoInstalacion = null
    oyentes.forEach((f) => f())
  })
}
export const puedeInstalarDirecto = () => eventoInstalacion !== null
export const alCambiarInstalacion = (f) => {
  oyentes.add(f)
  return () => oyentes.delete(f)
}
export async function instalarPanel() {
  if (!eventoInstalacion) return false
  eventoInstalacion.prompt()
  const { outcome } = await eventoInstalacion.userChoice
  eventoInstalacion = null
  oyentes.forEach((f) => f())
  return outcome === 'accepted'
}

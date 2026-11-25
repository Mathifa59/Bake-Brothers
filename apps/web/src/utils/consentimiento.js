// Elección de cookies de estadísticas de la persona que visita. Se guarda en localStorage ('bb_cookies'); el bloque de
// Google Tag Manager de index.html la lee ANTES de cargar GTM para arrancar con el consentimiento ya puesto. Si cambias
// la clave o el formato, cámbialos también allí.
//
// Solo hay una decisión: las cookies de estadísticas (Google Analytics). Las de publicidad nunca se activan.
// «aceptadas» → analytics_storage = granted · «rechazadas» → denied (y se borran las cookies de Google que ya existieran).

export const CLAVE_COOKIES = 'bb_cookies'
const EVENTO_ABRIR = 'bb_abrir_cookies'

// GTM distingue un objeto `arguments` de un arreglo normal: tiene que ser una función clásica.
function gtag() {
  window.dataLayer = window.dataLayer || []
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments)
}

/** 'aceptadas' | 'rechazadas' | null (todavía no eligió, o el navegador no deja guardar). */
export function leerConsentimiento() {
  try {
    const c = JSON.parse(window.localStorage.getItem(CLAVE_COOKIES) || 'null')
    return c && (c.estado === 'aceptadas' || c.estado === 'rechazadas') ? c.estado : null
  } catch {
    return null
  }
}

// Al rechazar se quitan las cookies que Google ya hubiera puesto (_ga, _ga_XXXX, _gid, _gat…), en las variantes de dominio
// donde pueden vivir. Las de un dominio que no es nuestro no se pueden tocar desde aquí (y no existen).
function borrarCookiesDeGoogle() {
  const host = window.location.hostname
  const dominios = [null, host, `.${host}`, `.${host.replace(/^www\./, '')}`]
  const nombres = document.cookie
    .split(';')
    .map((c) => c.split('=')[0].trim())
    .filter((n) => n === '_ga' || n === '_gid' || n.startsWith('_ga_') || n.startsWith('_gat'))
  for (const nombre of nombres) {
    for (const dominio of dominios) {
      document.cookie = `${nombre}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${dominio ? `; domain=${dominio}` : ''}`
    }
  }
}

export function guardarConsentimiento(estado) {
  const aceptadas = estado === 'aceptadas'
  try {
    window.localStorage.setItem(CLAVE_COOKIES, JSON.stringify({ estado, fecha: new Date().toISOString(), version: 1 }))
  } catch {
    // sin localStorage: el cambio vale solo durante esta visita
  }
  gtag('consent', 'update', { analytics_storage: aceptadas ? 'granted' : 'denied' })
  if (!aceptadas) borrarCookiesDeGoogle()
}

/** Vuelve a mostrar el aviso (enlace «Preferencias de cookies» del pie). */
export const abrirPreferenciasDeCookies = () => window.dispatchEvent(new Event(EVENTO_ABRIR))

export function alAbrirPreferencias(funcion) {
  window.addEventListener(EVENTO_ABRIR, funcion)
  return () => window.removeEventListener(EVENTO_ABRIR, funcion)
}

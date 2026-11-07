/* Service worker de Bake OS: SOLO notificaciones push (y lo que hace falta para instalar el panel como app).
 * No guarda nada en caché a propósito: el panel siempre debe cargar la versión publicada, no una vieja. */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// El servidor manda { titulo, cuerpo, url, tag, tipo } (apps/api/src/services/avisos.ts). Con el celular bloqueado
// esto es lo que despierta la pantalla: por eso la notificación es siempre visible y con vibración.
self.addEventListener('push', (event) => {
  let datos = {}
  try {
    datos = event.data ? event.data.json() : {}
  } catch {
    datos = { cuerpo: event.data ? event.data.text() : '' }
  }
  const titulo = datos.titulo || 'Bake OS'
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: datos.cuerpo || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // Una notificación por conversación: la nueva reemplaza a la anterior, pero vuelve a sonar (renotify).
      tag: datos.tag || 'bake-os',
      renotify: true,
      vibrate: [200, 100, 200],
      requireInteraction: datos.tipo === 'esperando_persona',
      data: { url: datos.url || '/#/conversaciones' },
    })
  )
})

// Tocar la notificación abre (o trae al frente) el panel en esa conversación.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destino = (event.notification.data && event.notification.data.url) || '/#/conversaciones'
  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const ventana of ventanas) {
        if (new URL(ventana.url).origin === self.location.origin) {
          await ventana.focus()
          // El panel abre la ruta él mismo (HashRouter): no se recarga la página.
          ventana.postMessage({ tipo: 'abrir', url: destino })
          return
        }
      }
      await self.clients.openWindow(destino)
    })()
  )
})

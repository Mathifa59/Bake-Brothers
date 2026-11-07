import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Service worker: solo avisos push y la instalación del panel (no guarda nada en caché). Solo en producción: en
// desarrollo se evita para no mezclar versiones. Tocar una notificación con el panel ya abierto manda aquí el
// destino (HashRouter) y se navega sin recargar.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (evento) => {
    if (evento.data?.tipo !== 'abrir') return
    const hash = String(evento.data.url ?? '').split('#')[1]
    if (hash) window.location.hash = hash
  })
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('No se pudo registrar el service worker', err))
    })
  }
}

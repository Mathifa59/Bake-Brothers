// Analítica de la landing (Google Tag Manager, ver el bloque de index.html). GTM lee lo que el sitio publica en el
// `dataLayer`; aquí se publican los eventos propios que GTM no puede detectar solo.
//
// «whatsapp_click»: el clic en cualquier botón de WhatsApp (el objetivo del sitio). Todos pasan por
// components/landing/WhatsAppCTA.jsx, que ya dispara un CustomEvent con el producto; esto solo lo reenvía.
// Para verlo en Google Analytics hace falta en GTM un activador «Evento personalizado» = whatsapp_click y una etiqueta
// de evento de GA4 con el parámetro `producto` (variable de capa de datos), y marcarlo como evento clave en GA4.
export function iniciarAnalitica() {
  window.dataLayer = window.dataLayer || []
  window.addEventListener('whatsapp_click', (e) => {
    window.dataLayer.push({ event: 'whatsapp_click', producto: e.detail?.producto ?? null })
  })
}

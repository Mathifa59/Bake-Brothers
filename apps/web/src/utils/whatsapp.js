// Configuración centralizada de contacto por WhatsApp. El número real todavía
// no está definido (se carga en Semana 2 vía VITE_WHATSAPP_NUMBER); mientras
// tanto se usa un valor de referencia para que el sitio siga siendo navegable.

const NUMERO = import.meta.env.VITE_WHATSAPP_NUMBER || '51987654321'

export const whatsappNumero = NUMERO
export const whatsappNumeroFormateado = `+${NUMERO.slice(0, 2)} ${NUMERO.slice(2)}`

export const whatsappUrl = (mensaje = '') =>
  `https://wa.me/${NUMERO}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ''}`

// Configuración centralizada de contacto por WhatsApp. Número real de la
// ficha del cliente (Bake Brothers); VITE_WHATSAPP_NUMBER permite
// sobreescribirlo por entorno (ej. un número de pruebas en local).

const NUMERO = import.meta.env.VITE_WHATSAPP_NUMBER || '51912944096'

export const whatsappNumero = NUMERO
export const whatsappNumeroFormateado = `+${NUMERO.slice(0, 2)} ${NUMERO.slice(2)}`

export const whatsappUrl = (mensaje = '') =>
  `https://wa.me/${NUMERO}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ''}`

// Configuración centralizada de contacto por WhatsApp. Número real de la
// ficha del cliente (Bake Brothers); VITE_WHATSAPP_NUMBER permite
// sobreescribirlo por entorno (ej. un número de pruebas en local).

import { agregarReferenciaAlMensaje } from '@bakebrothers/domain'
import { referenciaActual } from './campana'

const NUMERO = import.meta.env.VITE_WHATSAPP_NUMBER || '51912944096'

export const whatsappNumero = NUMERO
export const whatsappNumeroFormateado = `+${NUMERO.slice(0, 2)} ${NUMERO.slice(2)}`

// Todo CTA de WhatsApp de la landing pasa por acá, así que es el único punto donde
// se agrega la referencia de campaña ("(ref: tt-halloween)") al mensaje prellenado.
// Sin campaña (la mayoría de las visitas) el mensaje queda exactamente igual.
export const whatsappUrl = (mensaje = '') => {
  const referencia = referenciaActual()
  const texto = agregarReferenciaAlMensaje(mensaje || (referencia ? 'Hola Bake Brothers 👋' : ''), referencia)
  return `https://wa.me/${NUMERO}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`
}

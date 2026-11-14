import { env } from './env.js'

/**
 * Atención de mayoristas (decisión del cliente, 2026-11-13): el bot NO les cotiza ni les toma pedidos. Si el cliente es
 * mayorista o pide «por mayor», se le deriva a este WhatsApp de atención directa. El número vive en la variable
 * WHATSAPP_MAYORISTAS (por defecto el real, +51 986 639 228), no escrito a mano en cada lugar.
 */
export const linkWhatsAppMayoristas = (): string => `https://wa.me/${env.WHATSAPP_MAYORISTAS}`

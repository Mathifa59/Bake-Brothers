/**
 * Variables de entorno que NO impiden arrancar pero dejan una función apagada. Se calculan aparte (función pura) para
 * poder probarlas y para que el log de arranque diga claro, en Coolify, qué falta y qué pasa mientras tanto.
 * La API arranca y atiende (panel, pedidos, conversaciones a mano) con solo `DATABASE_URL`.
 */
export interface AvisoDeArranque {
  variable: string
  consecuencia: string
}

export function avisosDeArranque(entorno: Record<string, string | undefined>): AvisoDeArranque[] {
  const falta = (nombre: string) => !(entorno[nombre] ?? '').trim()
  const avisos: AvisoDeArranque[] = []
  if (falta('WHATSAPP_TOKEN_ENCRYPTION_KEY'))
    avisos.push({
      variable: 'WHATSAPP_TOKEN_ENCRYPTION_KEY',
      consecuencia: 'no se puede conectar ningún número de WhatsApp (no hay dónde guardar su token cifrado); el resto de la API funciona',
    })
  if (falta('META_APP_SECRET'))
    avisos.push({
      variable: 'META_APP_SECRET',
      consecuencia: 'POST /webhook responde 503 (la firma de Meta es obligatoria en producción): ningún mensaje de WhatsApp entra todavía',
    })
  if (falta('DATOS_PAGO'))
    avisos.push({
      variable: 'DATOS_PAGO',
      consecuencia: 'el bot no inventa datos de cobro: registra el pedido y pasa el pago a una persona',
    })
  if (falta('ANTHROPIC_API_KEY'))
    avisos.push({ variable: 'ANTHROPIC_API_KEY', consecuencia: 'el bot y el simulador no pueden llamar al modelo (con el bot apagado no se necesita)' })
  if (falta('VAPID_PUBLIC_KEY') || falta('VAPID_PRIVATE_KEY'))
    avisos.push({
      variable: 'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY',
      consecuencia: 'no llegan notificaciones al celular; la campana y el centro de avisos del panel sí funcionan',
    })
  return avisos
}

// TODO(Semana 2/3 — credenciales reales de Meta): implementar el envío real
// contra la Cloud API de WhatsApp/Messenger/Instagram
// (https://graph.facebook.com/v21.0/{phone_number_id}/messages) una vez que
// exista el token permanente de la app de Meta. Necesita, como mínimo:
// META_WHATSAPP_TOKEN (o el que corresponda por canal) y el
// phone_number_id/page_id de la sede que corresponda (ver
// sedes.whatsapp_phone_number_id).
//
// Stub a propósito: nadie en este repo debe poder mandar un mensaje real a
// un cliente todavía sin darse cuenta. No se simula una respuesta exitosa de
// Meta — si algo llega a invocar esta función antes de que esté
// implementada, tiene que fallar visiblemente (excepción), nunca en
// silencio. Ahora mismo nada del código la invoca — ni el bandeja de
// conversaciones de apps/admin (que solo escribe historial/estado en
// Supabase directo), ni ninguna ruta de apps/api.
export async function enviarMensajeMeta(
  _canal: 'whatsapp' | 'facebook' | 'instagram',
  _destinatarioId: string,
  _texto: string
): Promise<never> {
  throw new Error(
    'enviarMensajeMeta no está implementado — falta el token permanente de la Cloud API de Meta (ver CLAUDE.md §9)'
  )
}

/**
 * Consentimiento para mensajes promocionales / masivos. Una sola regla, en un solo lugar: las reglas de WhatsApp
 * Business exigen que la persona haya aceptado recibir mensajes de la marca, así que un envío masivo solo puede ir a
 * quien tenga el consentimiento marcado en `true`. «No se sabe» (NULL) y «dijo que no» (false) quedan FUERA, igual
 * que los contactos de la agenda importados (que entran con NULL) y los clientes internos (envíos a los propios locales).
 *
 * Todo código que arme una lista de destinatarios para un envío masivo tiene que pasar por esta función; nunca
 * filtrar por «tiene teléfono».
 */
export interface ClienteParaEnvioMasivo {
  telefono: string | null
  /** true = aceptó; false = dijo que no; null/undefined = nunca respondió. */
  acepta_marketing?: boolean | null
  es_interno?: boolean | null
}

export function puedeRecibirEnvioMasivo(c: ClienteParaEnvioMasivo): boolean {
  return c.acepta_marketing === true && Boolean(c.telefono) && !c.es_interno
}

/** La pregunta, tal cual, que hace el bot una sola vez tras el primer pedido. */
export const PREGUNTA_PROMOCIONES = '¿Quieres recibir promociones y novedades de Bake Brothers por este WhatsApp?'

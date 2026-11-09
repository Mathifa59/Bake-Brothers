/**
 * Modelos de Claude que usa el bot, configurables por variable de entorno (cambiar de modelo = cambiar la variable
 * en Coolify y reiniciar, sin tocar código). Por defecto Sonnet: es con el que está probado hoy. Para pasar a Haiku
 * (más barato y rápido; hay que volver a probar los casos del bot antes de dejarlo en producción, ver
 * docs/cambio-a-haiku.md):
 *
 *   BOT_MODELO=claude-haiku-5-5            la conversación del bot (cerebro.ts)
 *   BOT_MODELO_CAPTURAS=...                la lectura de capturas de pago (capturaPago.ts); aparte a propósito: es
 *                                          dinero y se queda en Sonnet aunque la conversación pase a Haiku.
 *
 * Una variable vacía o ausente = el modelo por defecto. El valor no se valida contra la lista de modelos (cambia con
 * el tiempo): si tiene un error de tipeo, la llamada falla y la conversación pasa a una persona como con cualquier
 * otra falla del modelo; el modelo en uso queda en el log de arranque.
 */
export const MODELO_POR_DEFECTO = 'claude-sonnet-5'

export function resolverModelo(valor: string | null | undefined): string {
  const limpio = valor?.trim()
  return limpio ? limpio : MODELO_POR_DEFECTO
}

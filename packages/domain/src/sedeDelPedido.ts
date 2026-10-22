/**
 * Sede de un pedido tomado por el bot desde un número que NO pertenece a un local.
 *
 * Con los números de cada tienda la sede sale del número (la conversación ya la trae).
 * El número nuevo del bot es uno solo para todo el negocio, así que el bot tiene que
 * preguntar: ¿recoge en tienda (en cuál local) o es delivery? Y el servidor lo exige
 * ANTES de crear el pedido — no depende de que el modelo se acuerde de preguntar.
 *
 * Lógica pura, sin I/O: recibe las sedes activas y devuelve a cuál va el pedido o qué
 * falta para saberlo.
 */

export interface SedeDisponible {
  id: string
  nombre: string
}

export type ResultadoSedePedido =
  | {
      ok: true
      /** null solo en delivery cuando no hay una sede configurada para despacharlo. */
      sedeId: string | null
      motivo: 'sede_de_la_conversacion' | 'recojo_en_tienda' | 'delivery_sede_configurada' | 'delivery_sin_sede_configurada'
    }
  | { ok: false; error: 'SEDE_REQUERIDA' | 'SEDE_NO_VALIDA'; sedesDisponibles: string[] }

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
// "Sede Cedros", "local de Santa Marina", "en cedros"… → "cedros" / "santa marina".
const normalizar = (s: string) =>
  sinTildes(s.toLowerCase())
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(sede|local|tienda|en|de|la|el|los|las|del|por|a)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Busca la sede por el nombre que dijo el cliente: igual, o uno contenido en el otro ("Santa Marina" ↔ "santa marina"). Null si no calza con exactamente una. */
export function encontrarSedePorNombre(texto: string, sedes: SedeDisponible[]): SedeDisponible | null {
  const t = normalizar(texto)
  if (!t) return null
  const exactas = sedes.filter((s) => normalizar(s.nombre) === t)
  if (exactas.length === 1) return exactas[0]
  const parciales = sedes.filter((s) => {
    const n = normalizar(s.nombre)
    return n.length > 0 && (n.includes(t) || t.includes(n))
  })
  return parciales.length === 1 ? parciales[0] : null
}

const ES_DELIVERY = /\b(delivery|domicilio|envio|enviar|reparto)\b/

export function resolverSedeDelPedido(params: {
  tipoEntrega: 'tienda' | 'delivery'
  /** Sede de la conversación (número de un local). Si existe, manda y no se pregunta nada. */
  sedeDeLaConversacion?: string | null
  /** Lo que respondió el cliente al "¿en qué local recoges?" (o "delivery"). */
  sedeElegida?: string | null
  sedes: SedeDisponible[]
  /** Nombre de la sede que despacha los delivery (configuración del negocio, no del código). */
  sedeDelivery?: string | null
}): ResultadoSedePedido {
  const { tipoEntrega, sedeDeLaConversacion, sedeElegida, sedes, sedeDelivery } = params
  const nombres = sedes.map((s) => s.nombre)

  if (sedeDeLaConversacion) return { ok: true, sedeId: sedeDeLaConversacion, motivo: 'sede_de_la_conversacion' }

  if (tipoEntrega === 'delivery') {
    const configurada = sedeDelivery ? encontrarSedePorNombre(sedeDelivery, sedes) : null
    return configurada
      ? { ok: true, sedeId: configurada.id, motivo: 'delivery_sede_configurada' }
      : { ok: true, sedeId: null, motivo: 'delivery_sin_sede_configurada' }
  }

  // Recojo en tienda: el cliente tiene que haber elegido un local concreto.
  const dicho = (sedeElegida ?? '').trim()
  if (!dicho) return { ok: false, error: 'SEDE_REQUERIDA', sedesDisponibles: nombres }
  // Si dijo "delivery" pero el pedido va como tienda, no es un local válido: que el modelo lo aclare.
  const encontrada = ES_DELIVERY.test(sinTildes(dicho.toLowerCase())) ? null : encontrarSedePorNombre(dicho, sedes)
  if (!encontrada) return { ok: false, error: 'SEDE_NO_VALIDA', sedesDisponibles: nombres }
  return { ok: true, sedeId: encontrada.id, motivo: 'recojo_en_tienda' }
}

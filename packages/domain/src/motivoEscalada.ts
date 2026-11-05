/**
 * Por qué una conversación pasó a una persona, en una etiqueta corta para la bandeja
 * («Reclamo · pide reembolso», «Catering», «Alergia», «Pago por revisar»…). El motivo llega como texto libre
 * (lo escribe el bot al llamar a escalarAHumano, o el código al forzar la escalada), así que se clasifica por
 * palabras clave; lo que no calza queda como «Otro» con el propio texto recortado.
 */
export type CategoriaMotivo =
  | 'Reclamo'
  | 'Catering'
  | 'Alergia'
  | 'Pago por revisar'
  | 'Delivery'
  | 'Combo'
  | 'Imagen'
  | 'Error técnico'
  | 'Otro'

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Se evalúan en orden: lo más específico primero. El texto ya viene sin tildes y en minúsculas.
const REGLAS: { categoria: CategoriaMotivo; patron: RegExp }[] = [
  { categoria: 'Alergia', patron: /alergi|intoleranc|libre de|celiac/ },
  { categoria: 'Reclamo', patron: /reclam|queja|reembols|devoluc|molest|llego (rota|mal|tarde)|mal estado/ },
  { categoria: 'Pago por revisar', patron: /captura de pago|comprobante de pago|datos de pago|pago/ },
  { categoria: 'Catering', patron: /catering/ },
  { categoria: 'Delivery', patron: /delivery|envio|domicilio/ },
  { categoria: 'Combo', patron: /combo|sujeto a stock/ },
  { categoria: 'Imagen', patron: /imagen|foto/ },
  { categoria: 'Error técnico', patron: /error|fallo|limite de iteraciones|no se pudo/ },
]

export interface MotivoLegible {
  categoria: CategoriaMotivo
  /** Etiqueta para mostrar: «Reclamo · pide reembolso» o solo «Catering». */
  etiqueta: string
}

const recortar = (s: string, max: number) => {
  const limpio = s.replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '')
  return limpio.length <= max ? limpio : `${limpio.slice(0, max - 1).trimEnd()}…`
}

export function motivoEscaladaLegible(motivo: string | null | undefined): MotivoLegible | null {
  const texto = (motivo ?? '').trim()
  if (!texto) return null
  const t = sinTildes(texto)
  const regla = REGLAS.find((r) => r.patron.test(t))
  const categoria = regla?.categoria ?? 'Otro'
  // Categorías que se explican solas: sin el texto largo del bot.
  if (categoria === 'Alergia' || categoria === 'Catering') return { categoria, etiqueta: categoria }
  // «Reclamo · pide reembolso»: lo que viene después de los dos puntos del motivo, o el motivo mismo.
  const detalle = texto.includes(':') ? texto.split(':').slice(1).join(':') : texto
  const corto = recortar(detalle, 48)
  if (categoria === 'Otro') return { categoria, etiqueta: corto }
  if (categoria === 'Pago por revisar' || categoria === 'Imagen' || categoria === 'Error técnico' || categoria === 'Combo' || categoria === 'Delivery') {
    // Estos motivos los escribe el código con frases largas: la categoría sola alcanza.
    return { categoria, etiqueta: categoria }
  }
  const mismoQueLaCategoria = sinTildes(corto) === sinTildes(categoria)
  return { categoria, etiqueta: mismoQueLaCategoria ? categoria : `${categoria} · ${corto.charAt(0).toLowerCase()}${corto.slice(1)}` }
}

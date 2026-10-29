/**
 * Cobertura de delivery: ¿el distrito que dijo el cliente está entre los que se atienden?
 *
 * La lista de distritos es configuración del negocio (variable de entorno DISTRITOS_DELIVERY de la API),
 * no una constante del código: la ficha real trae Chorrillos, Surco, Miraflores, San Isidro, Villa el
 * Salvador, San Juan de Miraflores, La Victoria, Jesús María y Lince, y cambiarla no debe requerir un deploy
 * de código. Lógica pura, sin I/O.
 *
 * La comparación es por igualdad exacta del nombre normalizado (sin tildes, mayúsculas ni "distrito de"):
 * "Miraflores" NO calza con "San Juan de Miraflores" — son dos distritos distintos y una coincidencia
 * parcial prometería delivery donde no hay.
 */

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

const normalizar = (s: string) =>
  sinTildes(s.toLowerCase())
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^(distrito de|dist de|distrito|en|de|del)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Parte la lista que viene de configuración ("Chorrillos, Surco, ...") en distritos limpios. */
export function parsearDistritosDelivery(lista: string | undefined | null): string[] {
  return (lista ?? '')
    .split(/[,;\n]/)
    .map((d) => d.trim())
    .filter(Boolean)
}

/** true si el distrito está en la lista de cobertura. Una lista vacía significa "sin restricción". */
export function distritoTieneCobertura(distrito: string, distritosConCobertura: string[]): boolean {
  if (distritosConCobertura.length === 0) return true
  const buscado = normalizar(distrito)
  if (!buscado) return false
  return distritosConCobertura.some((d) => normalizar(d) === buscado)
}

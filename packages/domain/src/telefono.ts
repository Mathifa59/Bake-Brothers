/**
 * Teléfonos de Perú. WhatsApp entrega el número como «51912944096» (sin «+»); en la base de clientes puede
 * estar como «912944096». Se comparan por los últimos 9 dígitos.
 */
const soloDigitos = (s: string) => s.replace(/\D/g, '')

export function ultimos9(telefono: string): string {
  return soloDigitos(telefono).slice(-9)
}

export function mismoTelefono(a: string, b: string): boolean {
  const x = ultimos9(a)
  const y = ultimos9(b)
  return x.length >= 7 && x === y
}

/** «51912944096» → «+51 912 944 096». Si no es un número de Perú reconocible, lo devuelve con «+» tal cual. */
export function telefonoLegible(telefono: string): string {
  const d = soloDigitos(telefono)
  if (d.length === 11 && d.startsWith('51')) return `+51 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`
  if (d.length === 9) return `+51 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
  return d ? `+${d}` : telefono
}

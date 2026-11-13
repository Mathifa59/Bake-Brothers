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

/**
 * Teléfono en formato E.164 («+51912944096»), la forma ÚNICA en que se guarda el teléfono de un cliente.
 * Acepta lo que escribe una persona («912 944 096», «+51 912-944-096», «0051912944096», «(01) 234 5678») y
 * devuelve null si no es un número reconocible — nunca adivina un dígito.
 *  - Sin «+»/«00»: solo números de Perú — celular de 9 dígitos que empieza con 9, «51» + celular, o fijo de
 *    Lima/provincia con el 0 de marcación («01 2345678»).
 *  - Con «+»/«00»: cualquier país (8 a 15 dígitos); si es «+51», se exige un número peruano válido.
 */
export function normalizarTelefono(entrada: string | null | undefined): string | null {
  if (!entrada) return null
  const crudo = entrada.trim()
  if (!/^[+\d\s().-]+$/.test(crudo)) return null
  let digitos = soloDigitos(crudo)
  let internacional = crudo.startsWith('+')
  if (!internacional && digitos.startsWith('00')) {
    internacional = true
    digitos = digitos.slice(2)
  }

  const peru = (nacional: string) => /^9\d{8}$/.test(nacional) || /^[1-8]\d{7}$/.test(nacional)

  if (internacional) {
    if (digitos.length < 8 || digitos.length > 15 || digitos.startsWith('0')) return null
    if (digitos.startsWith('51') && !peru(digitos.slice(2))) return null
    return `+${digitos}`
  }
  if (/^9\d{8}$/.test(digitos)) return `+51${digitos}`
  if (digitos.length === 11 && digitos.startsWith('51') && /^9\d{8}$/.test(digitos.slice(2))) return `+${digitos}`
  if (digitos.startsWith('0') && /^[1-8]\d{7}$/.test(digitos.slice(1))) return `+51${digitos.slice(1)}`
  return null
}

/**
 * El número con el que escribe alguien por WhatsApp (`wa_id`, «51912944096», sin «+») → E.164. Meta siempre manda el
 * código de país, así que acá se acepta cualquier país; null si no son 8 a 15 dígitos.
 */
export function normalizarTelefonoWhatsApp(waId: string | null | undefined): string | null {
  const d = soloDigitos(waId ?? '')
  return d.length >= 8 && d.length <= 15 && !d.startsWith('0') ? `+${d}` : null
}

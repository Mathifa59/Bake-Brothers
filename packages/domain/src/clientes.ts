/**
 * Reglas de clientes que no dependen de la base: cómo se compara un nombre y cómo se lee el tamaño habitual de un
 * mayorista (la hoja DATOS de la plantilla lo escribe «GR» / «MED»).
 */

/** Clave para comparar nombres sin importar mayúsculas, tildes, espacios ni puntuación: «Mirtha - Huánuco» = «MIRTHA HUANUCO». */
export function claveNombreCliente(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export type TamanoHabitual = 'Mediana' | 'Grande'

/** «GR» → Grande, «MED» → Mediana (también las palabras completas). null si no es ninguno de los dos — nunca adivina. */
export function tamanoHabitualDesdeCodigo(codigo: string | null | undefined): TamanoHabitual | null {
  const c = (codigo ?? '').trim().toUpperCase()
  if (c === 'GR' || c === 'GRANDE') return 'Grande'
  if (c === 'MED' || c === 'MEDIANA') return 'Mediana'
  return null
}

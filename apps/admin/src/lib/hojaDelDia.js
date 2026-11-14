import { abrirPdfAutenticado } from './apiClient'

// LA hoja que se imprime es una sola: todas las órdenes del día (mayoristas, agendados y resumen de producción) en un
// PDF. No hay impresión por orden individual. Las otras hojas (solo mayoristas, solo agendados, solo el resumen) son
// una opción secundaria para quien necesita una parte sola.
//
// Los responsables de carga y de empaque se escriben al imprimir (su hoja los trae arriba). Se recuerdan los últimos
// usados en este dispositivo para no volver a escribirlos cada día; si el navegador no deja guardar, no pasa nada.
const CLAVE = 'bakeos:responsables-hoja'

export function responsablesGuardados() {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? '{}')
    return { carga: typeof v.carga === 'string' ? v.carga : '', empaque: typeof v.empaque === 'string' ? v.empaque : '' }
  } catch {
    return { carga: '', empaque: '' }
  }
}

export function guardarResponsables(valor) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(valor))
  } catch {
    // sin almacenamiento: se escribe de nuevo la próxima vez
  }
}

/** Rutas de cada hoja (la «hoja del día» es la principal). */
export const HOJAS = {
  dia: { ruta: '/api/dashboard/ordenes/hoja-del-dia.pdf', archivo: 'hoja-del-dia', conEmpaque: true },
  mayoristas: { ruta: '/api/dashboard/ordenes/empaque-mayorista.pdf', archivo: 'empaque-mayorista', conEmpaque: true },
  agendados: { ruta: '/api/dashboard/ordenes/agendados.pdf', archivo: 'agendados', conEmpaque: false },
  produccion: { ruta: '/api/dashboard/produccion/hoja.pdf', archivo: 'hoja-produccion', conEmpaque: false, conResponsables: false },
}

/** Arma los parámetros de la hoja pedida (el empleado va siempre a su propia sede: el servidor lo fuerza). */
export function parametrosDeHoja(hoja, { fecha, sedeId, esAdmin, carga = '', empaque = '' }) {
  const h = HOJAS[hoja]
  const params = new URLSearchParams({ fecha })
  if (esAdmin && sedeId) params.set('sedeId', sedeId)
  if (h.conResponsables !== false) {
    if (carga.trim()) params.set('carga', carga.trim())
    if (h.conEmpaque && empaque.trim()) params.set('empaque', empaque.trim())
  }
  return params
}

/** Genera la hoja y la abre para imprimir. Lanza el error de red/servidor para que quien llama lo muestre. */
export async function imprimirHoja(hoja, { fecha, sedeId, esAdmin, carga, empaque }) {
  const h = HOJAS[hoja]
  const params = parametrosDeHoja(hoja, { fecha, sedeId, esAdmin, carga, empaque })
  await abrirPdfAutenticado(`${h.ruta}?${params}`, `${h.archivo}-${fecha}.pdf`)
}

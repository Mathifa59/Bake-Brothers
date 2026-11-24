import { esAdministracion, type Perfil } from './permisosPanel.js'

/**
 * Porcionado: una torta (o pie) entera se corta en porciones individuales. En Stock se resta la cantidad de enteras y se
 * suman las porciones que rinde cada una, según una REGLA por producto (ej. Familiar → Individual = 12 porciones,
 * editable por Administración en Catálogo). Lógica pura y compartida: la API la usa para decidir y el panel para mostrar
 * la vista previa, así dicen exactamente lo mismo.
 *
 * Reglas:
 *  - Solo descuenta donde hay CONTEO. Las enteras tienen que tener su cantidad registrada y alcanzar. La fila de
 *    porciones puede no existir todavía (se crea con lo porcionado), pero si existe tiene que llevar conteo: si no, sumar
 *    mezclaría «no se cuenta» con un número.
 *  - Quién puede: Administración (siempre) o una cuenta con acceso a Stock que además sea «Encargado».
 *  - Las tortas mini se venden siempre enteras: no tienen regla, así que no hay nada que porcionar.
 */

export const MAX_PORCIONES_POR_REGLA = 200
export const MAX_ENTERAS_POR_PORCIONADO = 200

export type ErrorPorcionado =
  | 'CANTIDAD_INVALIDA'
  | 'SIN_CONTEO_ENTERO'
  | 'STOCK_INSUFICIENTE'
  | 'SIN_CONTEO_PORCION'
  | 'PORCIONES_INSUFICIENTES'

export interface StockDeUnSku {
  /** ¿Existe la fila de stock de ese producto + tamaño en el local? */
  existe: boolean
  /** Conteo exacto; null = no se lleva conteo. */
  cantidad: number | null
}

export type PlanPorcionado =
  | { ok: true; porcionesGeneradas: number; enterasQuedan: number; porcionesQuedan: number }
  | { ok: false; error: ErrorPorcionado; detalle: string }

const esEnteroPositivo = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0

export function planearPorcionado(datos: { enteras: number; rendimiento: number; entero: StockDeUnSku; porcion: StockDeUnSku }): PlanPorcionado {
  const { enteras, rendimiento, entero, porcion } = datos
  if (!esEnteroPositivo(enteras) || enteras > MAX_ENTERAS_POR_PORCIONADO)
    return { ok: false, error: 'CANTIDAD_INVALIDA', detalle: `Indica cuántas enteras porcionas (de 1 a ${MAX_ENTERAS_POR_PORCIONADO}).` }
  if (!esEnteroPositivo(rendimiento) || rendimiento > MAX_PORCIONES_POR_REGLA)
    return { ok: false, error: 'CANTIDAD_INVALIDA', detalle: 'El rendimiento de la regla no es válido.' }
  if (!entero.existe || entero.cantidad === null)
    return { ok: false, error: 'SIN_CONTEO_ENTERO', detalle: 'Las enteras no tienen cantidad registrada en Stock. Anota primero cuántas hay.' }
  if (entero.cantidad < enteras)
    return { ok: false, error: 'STOCK_INSUFICIENTE', detalle: `Solo hay ${entero.cantidad} entera${entero.cantidad === 1 ? '' : 's'} en Stock.` }
  if (porcion.existe && porcion.cantidad === null)
    return { ok: false, error: 'SIN_CONTEO_PORCION', detalle: 'Las porciones no llevan cantidad en Stock. Anota primero cuántas porciones hay ahora.' }
  const porcionesGeneradas = enteras * rendimiento
  return {
    ok: true,
    porcionesGeneradas,
    enterasQuedan: entero.cantidad - enteras,
    porcionesQuedan: (porcion.existe ? (porcion.cantidad as number) : 0) + porcionesGeneradas,
  }
}

export type PlanReversion =
  | { ok: true; enterasQuedan: number; porcionesQuedan: number }
  | { ok: false; error: ErrorPorcionado; detalle: string }

/** Deshacer un porcionado: devuelve las enteras y quita las porciones que se habían sumado. */
export function planearReversion(datos: { enteras: number; porcionesGeneradas: number; entero: StockDeUnSku; porcion: StockDeUnSku }): PlanReversion {
  const { enteras, porcionesGeneradas, entero, porcion } = datos
  if (!entero.existe || entero.cantidad === null)
    return { ok: false, error: 'SIN_CONTEO_ENTERO', detalle: 'Las enteras ya no tienen cantidad en Stock: no se puede devolverlas. Ajusta el conteo y vuelve a intentar.' }
  if (!porcion.existe || porcion.cantidad === null || porcion.cantidad < porcionesGeneradas) {
    const hay = porcion.existe && porcion.cantidad !== null ? porcion.cantidad : 0
    return {
      ok: false,
      error: 'PORCIONES_INSUFICIENTES',
      detalle: `Ya no quedan las ${porcionesGeneradas} porciones de este porcionado en Stock (hay ${hay}); faltan ${porcionesGeneradas - hay}. Ajusta el conteo a mano si hace falta.`,
    }
  }
  return { ok: true, enterasQuedan: entero.cantidad + enteras, porcionesQuedan: porcion.cantidad - porcionesGeneradas }
}

/** Administración siempre; el resto, con acceso a Stock (Caja) y marcado como Encargado. */
export function puedePorcionar(perfiles: readonly Perfil[] | null | undefined, esEncargado: boolean | null | undefined): boolean {
  if (!perfiles || perfiles.length === 0) return false
  if (esAdministracion(perfiles)) return true
  return Boolean(esEncargado) && (perfiles.includes('caja') || perfiles.includes('empleado_temporal'))
}

export interface ReglaPorcionadoVista {
  id: string
  size_entero_id: string
  size_porcion_id: string
  porciones: number
  activo: boolean
}

/**
 * ¿Aparece el botón «Porcionar» para este tamaño? Solo si hay una regla ACTIVA que parte de él. Las tortas mini no tienen
 * regla (se venden siempre enteras), así que nunca lo muestran.
 */
export const reglaDeTamano = (reglas: readonly ReglaPorcionadoVista[] | null | undefined, sizeId: string): ReglaPorcionadoVista | null =>
  (reglas ?? []).find((r) => r.activo && r.size_entero_id === sizeId) ?? null

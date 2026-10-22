// Atribución de campañas sin herramientas externas: la landing conserva los
// parámetros utm de la URL por la que llegó la persona y los agrega al mensaje
// prellenado de WhatsApp como una referencia corta ("(ref: tt-halloween)"). La
// lógica de armar/leer la referencia vive en @bakebrothers/domain (campana.ts) —
// la comparte con el bot, que la lee del primer mensaje y la guarda en
// orders.campana.
//
// Se guarda en localStorage (30 días) para que la referencia sobreviva a navegar
// entre /menu y /locales (la landing es una SPA, pero la persona puede recargar o
// volver otro día). Es la campaña MÁS RECIENTE con que llegó: si vuelve por otra,
// gana la nueva. Todo falla en silencio (modo privado, storage bloqueado): sin
// storage la referencia vale mientras dure la pestaña.

import { referenciaDeUtm } from '@bakebrothers/domain'

const CLAVE = 'bb-campana'
const VIGENCIA_MS = 30 * 24 * 60 * 60 * 1000
const PARAMETROS_UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref']

let enMemoria = null // { referencia, utm, en }

function leerGuardada() {
  try {
    const crudo = localStorage.getItem(CLAVE)
    if (!crudo) return null
    const dato = JSON.parse(crudo)
    if (!dato?.referencia || Date.now() - dato.en > VIGENCIA_MS) {
      localStorage.removeItem(CLAVE)
      return null
    }
    return dato
  } catch {
    return null
  }
}

function guardar(dato) {
  enMemoria = dato
  try {
    localStorage.setItem(CLAVE, JSON.stringify(dato))
  } catch {
    // sin storage: queda en memoria
  }
}

/** Corre una vez al cargar la app: si la URL trae utm/ref, los conserva. */
export function capturarCampanaDeLaUrl() {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  const referencia = referenciaDeUtm(params)
  if (!referencia) return
  const utm = Object.fromEntries(PARAMETROS_UTM.filter((k) => params.get(k)).map((k) => [k, params.get(k)]))
  guardar({ referencia, utm, en: Date.now() })
}

/** La referencia vigente ("tt-halloween") o null si la persona no llegó por una campaña. */
export function referenciaActual() {
  return enMemoria?.referencia ?? leerGuardada()?.referencia ?? null
}

capturarCampanaDeLaUrl()

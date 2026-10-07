import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

const PAGINA = 1000 // tope de filas por consulta de PostgREST

/**
 * Trae TODAS las filas de una consulta, página por página. PostgREST corta en
 * 1000 filas sin avisar — Clientes ya traía los pedidos con ese tope silencioso
 * (columna "Último pedido"), y los segmentos nuevos contarían mal en cuanto se
 * pasara de ahí. `construir` recibe (desde, hasta) y devuelve la consulta ya con
 * su `.range(desde, hasta)` aplicado por esta función.
 */
export async function traerTodo(construir) {
  const filas = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await construir().range(desde, desde + PAGINA - 1)
    if (error) throw error
    filas.push(...data)
    if (data.length < PAGINA) return filas
  }
}

/**
 * Se suscribe a cambios de una o varias tablas (Realtime respeta la RLS por
 * sede) y llama a `alCambiar`. Cada suscripción usa un nombre de canal propio:
 * varias pantallas/hook a la vez sobre la misma tabla (el menú, el Resumen, el
 * Control Tower) no deben pisarse entre sí.
 */
export function suscribirTablas(tablas, alCambiar) {
  const nombre = `bakeos-${tablas.join('-')}-${Math.random().toString(36).slice(2, 8)}`
  let canal = supabase.channel(nombre)
  for (const tabla of tablas) {
    canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, alCambiar)
  }
  canal.subscribe()
  return () => supabase.removeChannel(canal)
}

/** Hora actual que se refresca sola (cada `cadaMs`) — para que "hoy" y la fecha de la portada no queden congelados. */
export function useAhora(cadaMs = 60_000) {
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), cadaMs)
    return () => clearInterval(t)
  }, [cadaMs])
  return ahora
}

/**
 * Carga + recarga de datos: corre `cargar` al montar, cuando cambia alguna
 * tabla suscrita (Realtime), cada `refrescarCadaMs` y al volver a la pestaña.
 * `cargar` devuelve el dato nuevo; esto devuelve { datos, error, cargando, recargar }.
 */
export function useDatosVivos(cargar, { tablas = [], deps = [], refrescarCadaMs = 0 } = {}) {
  const [estado, setEstado] = useState({ datos: null, error: null })
  const cargarRef = useRef(cargar)
  cargarRef.current = cargar
  const version = useRef(0)

  const recargar = () => {
    const mia = ++version.current
    cargarRef
      .current()
      .then((datos) => {
        if (mia === version.current) setEstado({ datos, error: null })
      })
      .catch((err) => {
        if (mia === version.current) setEstado((e) => ({ ...e, error: err.message ?? String(err) }))
      })
  }

  useEffect(() => {
    recargar()
    const quitar = tablas.length ? suscribirTablas(tablas, recargar) : null
    const intervalo = refrescarCadaMs ? setInterval(recargar, refrescarCadaMs) : null
    const alVolver = () => document.visibilityState === 'visible' && recargar()
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      quitar?.()
      if (intervalo) clearInterval(intervalo)
      document.removeEventListener('visibilitychange', alVolver)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablas.join(','), refrescarCadaMs, ...deps])

  return { datos: estado.datos, error: estado.error, cargando: estado.datos === null && !estado.error, recargar }
}

/** Cambia el estado de un pedido (RLS decide si tienes permiso; el trigger de la base valida la transición). Devuelve null si salió bien o el mensaje de error. */
export async function actualizarEstadoPedido(numero, nuevoEstado) {
  const { error, data } = await supabase
    .from('orders')
    .update({ estado: nuevoEstado, actualizado_en: new Date().toISOString() })
    .eq('numero', numero)
    .select('numero')
  if (error) return `No se pudo actualizar ${numero}: ${error.message}`
  // RLS bloqueó la fila (no es de tu sede) sin lanzar error: PostgREST simplemente no devuelve nada.
  if (!data || data.length === 0) return `No tienes permiso para editar el pedido ${numero} (no es de tu sede).`
  return null
}

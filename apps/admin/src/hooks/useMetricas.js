import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const TOP_N = 5

// Trae las 3 funciones agregadas de 0026_metricas_dashboard.sql vía RPC —
// el cálculo (SUM/COUNT/GROUP BY) lo hace Postgres, no este hook. RLS ya
// filtra por sede según quién esté logueado (operador ve solo la suya,
// admin ve todas o la que elija) — sedeId=null pide "todas las que la RLS
// me deje ver", nunca hay que forzar la sede del operador acá también.
export function useMetricas({ desde, hasta, sedeId }) {
  const [kpis, setKpis] = useState(null)
  const [productos, setProductos] = useState(null)
  const [tendencia, setTendencia] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!desde || !hasta) return
    setError(null)
    const args = { p_desde: desde, p_hasta: hasta, p_sede_id: sedeId ?? null }

    supabase
      .rpc('metricas_kpis', args)
      .single()
      .then(({ data, error }) => {
        if (error) return setError(error.message)
        setKpis(data)
      })

    supabase
      .rpc('metricas_productos_vendidos', args)
      .then(({ data, error }) => {
        if (error) return setError(error.message)
        setProductos(data)
      })

    supabase
      .rpc('metricas_tendencia_diaria', args)
      .then(({ data, error }) => {
        if (error) return setError(error.message)
        setTendencia(data)
      })
  }, [desde, hasta, sedeId])

  // No se asume que el top por cantidad coincide con el top por ingresos —
  // dos sorts independientes sobre el mismo set agregado.
  const topPorCantidad = useMemo(() => {
    if (!productos) return null
    return [...productos].sort((a, b) => b.cantidad - a.cantidad).slice(0, TOP_N)
  }, [productos])

  const topPorIngresos = useMemo(() => {
    if (!productos) return null
    return [...productos].sort((a, b) => b.ingresos - a.ingresos).slice(0, TOP_N)
  }, [productos])

  const cargando = kpis === null || productos === null || tendencia === null

  return { kpis, topPorCantidad, topPorIngresos, tendencia, cargando, error }
}

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const COLUMNAS = 'bot_activo, bienvenida_activa, mensaje_bienvenida, actualizado_en'

/**
 * Interruptor del bot (tabla configuracion_bot, una sola fila). Lo lee todo el personal; solo el admin lo cambia (la
 * base lo hace cumplir con RLS, esto solo evita mostrar un botón que no va a funcionar). Cambiarlo no necesita
 * redeploy: la API lo lee en cada mensaje entrante.
 *
 * Devuelve { config, error, cargando, guardar } — `guardar(cambios)` actualiza y devuelve un texto de error o null.
 * Si la tabla todavía no existe (migración 0040 sin aplicar) `config` queda en null y `error` lo explica.
 */
export function useConfiguracionBot() {
  const [config, setConfig] = useState(null)
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase.from('configuracion_bot').select(COLUMNAS).eq('id', true).maybeSingle()
    if (err) setError(err.message)
    else {
      setError(null)
      setConfig(data)
    }
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar()
    // El estado del bot lo puede cambiar otra persona: se refresca solo al volver a la pestaña y cada minuto.
    const intervalo = setInterval(cargar, 60_000)
    const alVolver = () => document.visibilityState === 'visible' && cargar()
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [cargar])

  const guardar = useCallback(
    async (cambios) => {
      const { data, error: err } = await supabase
        .from('configuracion_bot')
        .update(cambios)
        .eq('id', true)
        .select(COLUMNAS)
        .maybeSingle()
      if (err) return err.message
      // Sin fila devuelta = la política no dejó actualizar (no es admin).
      if (!data) return 'No se pudo guardar: solo dirección puede cambiar esto.'
      setConfig(data)
      return null
    },
    []
  )

  return { config, error, cargando, guardar }
}

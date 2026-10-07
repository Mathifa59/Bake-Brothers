import { useMemo } from 'react'
import { resumirAtencion, tiemposDeRespuesta } from '@bakebrothers/domain'
import { supabase } from '../lib/supabase'
import { traerTodo, useDatosVivos } from '../lib/datos'

export const DIAS_ATENCION = 30

// Conversaciones de los últimos 30 días con su historial. El cálculo de los
// tiempos vive en packages/domain/src/atencion.ts (función pura, con tests);
// acá solo se traen los datos. RLS por sede: un operador ve solo lo de su sede.
async function cargarConversaciones() {
  const desde = new Date(Date.now() - DIAS_ATENCION * 86_400_000).toISOString()
  return traerTodo(() =>
    supabase
      .from('conversaciones')
      .select('id, canal, estado, historial, creado_en, sedes(nombre)')
      .gte('creado_en', desde)
      .order('creado_en', { ascending: false })
  )
}

/** Tiempos de primera respuesta (bot y humana) de los últimos 30 días, desde el historial de conversaciones. */
export function useAtencion() {
  const { datos, error, cargando } = useDatosVivos(cargarConversaciones, { tablas: ['conversaciones'] })

  const calculo = useMemo(() => {
    if (!datos) return null
    return {
      resumen: resumirAtencion(datos.map((c) => c.historial ?? [])),
      filas: datos.map((c) => ({ ...c, tiempos: tiemposDeRespuesta(c.historial ?? []) })),
    }
  }, [datos])

  return { resumen: calculo?.resumen ?? null, filas: calculo?.filas ?? null, error, cargando }
}

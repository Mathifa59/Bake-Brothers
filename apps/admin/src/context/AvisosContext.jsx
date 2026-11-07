import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'
import { useDatosVivos } from '../lib/datos'

const AvisosContext = createContext(null)
const MAXIMO = 40

/**
 * Centro de avisos de la campana: lo que el servidor guardó cuando entró algo que una persona tiene que atender
 * (una conversación que espera, un mensaje nuevo). La RLS decide qué ve cada uno (dirección todo; un empleado, lo
 * de su local y lo que aún no tiene local). «Sin ver» = los más nuevos que `avisos_cursor.vistos_en` (por persona).
 * Llegan por Realtime y también se refrescan solos al volver a la pestaña.
 */
export function AvisosProvider({ children }) {
  const { session } = useAuth()
  const usuarioId = session?.user?.id

  const cargar = useCallback(async () => {
    const [lista, cursor] = await Promise.all([
      supabase
        .from('avisos')
        .select('id, tipo, titulo, cuerpo, conversacion_id, sede_id, creado_en')
        .order('creado_en', { ascending: false })
        .limit(MAXIMO),
      supabase.from('avisos_cursor').select('vistos_en').eq('usuario_id', usuarioId).maybeSingle(),
    ])
    if (lista.error) throw lista.error
    if (cursor.error) throw cursor.error
    let vistosEn = cursor.data?.vistos_en
    if (!vistosEn) {
      // Primera vez de esta persona: lo anterior no cuenta como «sin ver».
      vistosEn = new Date().toISOString()
      await supabase.from('avisos_cursor').upsert({ usuario_id: usuarioId, vistos_en: vistosEn })
    }
    return { avisos: lista.data, vistosEn }
  }, [usuarioId])

  const { datos, error, recargar } = useDatosVivos(cargar, { tablas: ['avisos'], deps: [usuarioId], refrescarCadaMs: 120_000 })

  const avisos = datos?.avisos ?? null
  const vistosEn = datos?.vistosEn ?? null
  const sinVer = useMemo(
    () => (avisos && vistosEn ? avisos.filter((a) => new Date(a.creado_en) > new Date(vistosEn)).length : 0),
    [avisos, vistosEn]
  )

  // El número de la campana también en el ícono de la app instalada (donde el sistema lo permite).
  useEffect(() => {
    try {
      if (sinVer > 0) navigator.setAppBadge?.(sinVer)
      else navigator.clearAppBadge?.()
    } catch {
      /* sin soporte: no pasa nada */
    }
  }, [sinVer])

  const marcarVistos = useCallback(async () => {
    if (!usuarioId) return
    await supabase.from('avisos_cursor').upsert({ usuario_id: usuarioId, vistos_en: new Date().toISOString() })
    recargar()
  }, [usuarioId, recargar])

  // Para la pantalla: cuáles eran nuevos al ENTRAR (aunque después se marquen como vistos, se siguen resaltando un rato).
  const vistosAlEntrar = useRef(null)
  if (vistosEn && vistosAlEntrar.current === null) vistosAlEntrar.current = vistosEn

  return (
    <AvisosContext.Provider value={{ avisos, sinVer, error, marcarVistos, recargar, vistosAlEntrar }}>{children}</AvisosContext.Provider>
  )
}

export const useAvisos = () => useContext(AvisosContext)

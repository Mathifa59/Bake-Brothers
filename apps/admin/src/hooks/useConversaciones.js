import { useEffect, useState } from 'react'
import { puedeTransicionarConversacion } from '@bakebrothers/domain'
import { supabase } from '../lib/supabase'

const SELECT = 'id, canal, external_id, sede_id, estado, historial, ultimo_mensaje_en, creado_en, sedes(nombre)'

// Bandeja de conversaciones escaladas — mismo patrón que usePedidos (fetch +
// mutación con chequeo de RLS por el largo de `data` devuelto).
export function useConversaciones() {
  const [conversaciones, setConversaciones] = useState(null)
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(null) // id en vuelo

  const cargar = () => {
    setError(null)
    supabase
      .from('conversaciones')
      .select(SELECT)
      .eq('estado', 'escalada')
      .order('ultimo_mensaje_en', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setConversaciones(data)
      })
  }

  useEffect(cargar, [])

  const enviarMensaje = async (conversacion, texto) => {
    const limpio = texto.trim()
    if (!limpio) return
    setEnviando(conversacion.id)

    const nuevoMensaje = { rol: 'operador', texto: limpio, en: new Date().toISOString() }
    const historialNuevo = [...(conversacion.historial ?? []), nuevoMensaje]
    // La primera respuesta escala -> atendida. Si ya estaba atendida
    // (mensajes de seguimiento antes de que la fila salga de esta bandeja),
    // el estado se mantiene — nunca se pisa con un valor que
    // puedeTransicionarConversacion no permitiría.
    const nuevoEstado =
      conversacion.estado === 'escalada' && puedeTransicionarConversacion('escalada', 'atendida_por_operador')
        ? 'atendida_por_operador'
        : conversacion.estado

    const { error, data } = await supabase
      .from('conversaciones')
      .update({ historial: historialNuevo, estado: nuevoEstado, ultimo_mensaje_en: new Date().toISOString() })
      .eq('id', conversacion.id)
      .select('id')
    setEnviando(null)
    if (error) {
      alert(`No se pudo enviar el mensaje: ${error.message}`)
      return false
    }
    if (!data || data.length === 0) {
      alert('No tenés permiso para editar esta conversación (no es de tu sede).')
      return false
    }
    // El envío real a Meta (Cloud API) todavía no existe — ver
    // apps/api/src/bot/meta.ts (stub, sin token permanente todavía). Este
    // mensaje queda guardado en Supabase pero no sale de verdad hacia el
    // cliente; no se simula un envío exitoso.
    cargar()
    return true
  }

  return { conversaciones, error, enviando, enviarMensaje, recargar: cargar }
}

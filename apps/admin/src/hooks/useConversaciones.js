import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { responderConversacion } from '../lib/apiClient'
import { reproducirAvisoEscalada } from '../utils/sonidoAviso'

const SELECT = 'id, canal, external_id, sede_id, estado, historial, ultimo_mensaje_en, creado_en, sedes(nombre)'

// Bandeja de conversaciones escaladas — la lectura sigue directa contra
// Supabase (RLS filtra por sede, mismo patrón que usePedidos), pero
// responder ya no escribe directo acá: pasa por apps/api
// (responderConversacion en apiClient.js), que manda el mensaje real por
// WhatsApp (enviarMensajeMeta) y solo si eso funciona actualiza
// historial/estado — nunca un "enviado" falso.
export function useConversaciones() {
  const [conversaciones, setConversaciones] = useState(null)
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(null) // id en vuelo
  const [errorEnvio, setErrorEnvio] = useState(null)

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

  // Tiempo real, mismo patrón que usePedidos: cualquier cambio en
  // conversaciones (dentro de lo que la RLS de sede ya te deja ver, ver
  // 0017/0029) recarga la lista entera — más robusto ante inserts/cambios
  // de sede que un parcheo manual del estado. El aviso sonoro es más
  // específico: solo suena cuando una conversación PASA a 'escalada' (no
  // en cada mensaje nuevo de una que ya lo está, ni cuando alguien más la
  // atiende) — 0029 le agregó replica identity full a la tabla para que el
  // evento traiga el estado anterior y se pueda distinguir esa transición.
  useEffect(() => {
    const canal = supabase
      .channel('conversaciones-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversaciones' }, (payload) => {
        const seEscaloAhora = payload.new?.estado === 'escalada' && payload.old?.estado !== 'escalada'
        if (seEscaloAhora) reproducirAvisoEscalada()
        cargar()
      })
      .subscribe()
    return () => supabase.removeChannel(canal)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const enviarMensaje = async (conversacion, texto) => {
    const limpio = texto.trim()
    if (!limpio) return false
    setEnviando(conversacion.id)
    setErrorEnvio(null)
    try {
      await responderConversacion(conversacion.id, limpio)
      cargar()
      return true
    } catch (err) {
      // Nunca un "listo" falso: si el envío real por WhatsApp falló (sin
      // token todavía, error de Meta, sin sede asignada, etc.) el operador
      // tiene que verlo en pantalla, no asumir que el cliente recibió algo.
      setErrorEnvio(err)
      return false
    } finally {
      setEnviando(null)
    }
  }

  return { conversaciones, error, enviando, errorEnvio, enviarMensaje, recargar: cargar }
}

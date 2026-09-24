import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { responderConversacion } from '../lib/apiClient'

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

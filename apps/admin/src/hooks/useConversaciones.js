import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { enviarPlantillaConversacion, gestionarConversacion, responderConversacion } from '../lib/apiClient'
import { traerTodo } from '../lib/datos'
import { reproducirAvisoEscalada } from '../utils/sonidoAviso'
import { indexarClientes } from '../utils/conversaciones'

const SELECT =
  'id, canal, external_id, sede_id, estado, historial, contexto, ultimo_mensaje_en, creado_en, sedes(nombre)'
// Las cerradas hace más de 30 días no entran a la bandeja (siguen en la base).
const DIAS_VISIBLES = 30

// Bandeja de Conversaciones. La lectura es directa contra Supabase (la RLS filtra por local: un empleado ve las de
// su local y las que todavía no tienen local; dirección, todas). Todo lo que ESCRIBE pasa por apps/api (responder,
// tomar, devolver, cerrar): el servidor valida el acceso, manda el mensaje real por WhatsApp y recién entonces
// actualiza historial/estado — nunca un «enviado» falso.
export function useConversaciones() {
  const [conversaciones, setConversaciones] = useState(null)
  const [clientes, setClientes] = useState(new Map())
  const [error, setError] = useState(null)
  const [trabajando, setTrabajando] = useState(null) // id con una acción en vuelo
  const [errorAccion, setErrorAccion] = useState(null)

  const cargar = useCallback(() => {
    setError(null)
    const desde = new Date(Date.now() - DIAS_VISIBLES * 86_400_000).toISOString()
    supabase
      .from('conversaciones')
      .select(SELECT)
      .gte('ultimo_mensaje_en', desde)
      .order('ultimo_mensaje_en', { ascending: false })
      .limit(300)
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setConversaciones(data)
      })
  }, [])

  // Nombres de clientes (por teléfono) para no mostrar el número en bruto. La RLS solo deja ver los clientes con
  // pedidos del local (o sin local): los demás quedan con su teléfono.
  const cargarClientes = useCallback(() => {
    traerTodo(() => supabase.from('customers').select('id, nombre, telefono'))
      .then((filas) => setClientes(indexarClientes(filas)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    cargar()
    cargarClientes()
  }, [cargar, cargarClientes])

  // Tiempo real: cualquier cambio en conversaciones recarga la lista. El aviso sonoro suena solo cuando una
  // conversación PASA a «escalada» (0029: replica identity full trae el estado anterior).
  useEffect(() => {
    const canal = supabase
      .channel(`conversaciones-realtime-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversaciones' }, (payload) => {
        if (payload.new?.estado === 'escalada' && payload.old?.estado !== 'escalada') reproducirAvisoEscalada()
        cargar()
      })
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [cargar])

  const ejecutar = async (conversacion, accion) => {
    setTrabajando(conversacion.id)
    setErrorAccion(null)
    try {
      await accion()
      cargar()
      return true
    } catch (err) {
      // Nunca un «listo» falso: el motivo real llega a la pantalla.
      setErrorAccion(err)
      if (err?.codigo === 'TRANSICION_NO_VALIDA') cargar()
      return false
    } finally {
      setTrabajando(null)
    }
  }

  const enviarMensaje = (conversacion, texto) => {
    const limpio = texto.trim()
    if (!limpio) return Promise.resolve(false)
    return ejecutar(conversacion, () => responderConversacion(conversacion.id, limpio))
  }
  const enviarPlantilla = (conversacion, datos) =>
    ejecutar(conversacion, () => enviarPlantillaConversacion(conversacion.id, datos))
  const tomar = (conversacion, sedeId) =>
    ejecutar(conversacion, () => gestionarConversacion(conversacion.id, 'tomar', sedeId ? { sedeId } : {}))
  const devolverAlBot = (conversacion) => ejecutar(conversacion, () => gestionarConversacion(conversacion.id, 'devolver'))
  const cerrar = (conversacion) => ejecutar(conversacion, () => gestionarConversacion(conversacion.id, 'cerrar'))
  const asignarSede = (conversacion, sedeId) =>
    ejecutar(conversacion, () => gestionarConversacion(conversacion.id, 'sede', { sedeId: sedeId || null }))

  return {
    conversaciones,
    clientes,
    error,
    trabajando,
    errorAccion,
    limpiarError: () => setErrorAccion(null),
    enviarMensaje,
    enviarPlantilla,
    tomar,
    devolverAlBot,
    cerrar,
    asignarSede,
    recargar: cargar,
  }
}

/** Respuestas rápidas: las lee todo el equipo; solo la dirección las crea, edita y borra (RLS de la migración 0038). */
export function useRespuestasRapidas() {
  const [respuestas, setRespuestas] = useState([])
  const [error, setError] = useState(null)

  const cargar = useCallback(() => {
    supabase
      .from('respuestas_rapidas')
      .select('id, titulo, texto, orden')
      .order('orden')
      .order('creado_en')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setRespuestas(data)
      })
  }, [])
  useEffect(cargar, [cargar])

  const guardar = async ({ id, titulo, texto }) => {
    setError(null)
    const fila = { titulo: titulo.trim(), texto: texto.trim() }
    const { error } = id
      ? await supabase.from('respuestas_rapidas').update({ ...fila, actualizado_en: new Date().toISOString() }).eq('id', id)
      : await supabase.from('respuestas_rapidas').insert({ ...fila, orden: respuestas.length + 1 })
    if (error) setError(error.message)
    else cargar()
    return !error
  }
  const borrar = async (id) => {
    setError(null)
    const { error } = await supabase.from('respuestas_rapidas').delete().eq('id', id)
    if (error) setError(error.message)
    else cargar()
    return !error
  }

  return { respuestas, error, guardar, borrar }
}

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const SELECT = 'numero, canal, tipo_entrega, fecha_entrega, horario_entrega, estado, total, sede_id, creado_en, sedes(nombre)'

// Fetch + cambio de estado de pedidos, reusado por la pantalla de Pedidos
// (todos los que ve el usuario según RLS) y por el historial de un cliente
// (mismo fetch, filtrado por customer_id).
export function usePedidos({ customerId } = {}) {
  const [pedidos, setPedidos] = useState(null)
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(null) // numero en vuelo, para deshabilitar su select

  const cargar = () => {
    setError(null)
    let query = supabase.from('orders').select(SELECT).order('creado_en', { ascending: false }).limit(100)
    if (customerId) query = query.eq('customer_id', customerId)
    query.then(({ data, error }) => {
      if (error) setError(error.message)
      else setPedidos(data)
    })
  }

  useEffect(cargar, [customerId])

  // Tiempo real: cuando cualquier pedido cambia (el propio usuario en otra
  // pestaña, un operador de otra sede si sos admin, etc.) se vuelve a
  // cargar. Realtime respeta la RLS de 0011 — solo llegan eventos de filas
  // que igual podrías leer. Re-fetch simple en vez de parchear el estado a
  // mano: más robusto ante inserts/deletes/cambios de sede que afectan qué
  // filas son visibles.
  useEffect(() => {
    const canal = supabase
      .channel('orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, cargar)
      .subscribe()
    return () => supabase.removeChannel(canal)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])

  const cambiarEstado = async (numero, estadoActual, nuevoEstado) => {
    if (nuevoEstado === estadoActual) return
    setGuardando(numero)
    const { error, data } = await supabase
      .from('orders')
      .update({ estado: nuevoEstado, actualizado_en: new Date().toISOString() })
      .eq('numero', numero)
      .select('numero')
    setGuardando(null)
    if (error) {
      alert(`No se pudo actualizar ${numero}: ${error.message}`)
      return
    }
    if (!data || data.length === 0) {
      // RLS bloqueó la fila (no es de tu sede) sin lanzar error — PostgREST
      // simplemente no devuelve nada. Se distingue de un error real.
      alert(`No tenés permiso para editar el pedido ${numero} (no es de tu sede).`)
      return
    }
    cargar()
  }

  return { pedidos, error, guardando, cambiarEstado, recargar: cargar }
}

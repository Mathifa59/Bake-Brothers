import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const SELECT =
  'numero, canal, tipo_entrega, fecha_entrega, horario_entrega, estado, total, sede_id, creado_en, requiere_confirmar_combo, pago_reportado, pago_resultado, sedes(nombre), customers(nombre)'

// Fetch + cambio de estado de pedidos, reusado por la pantalla de Pedidos
// (todos los que ve el usuario según RLS) y por el historial de un cliente
// (mismo fetch, filtrado por customer_id).
export function usePedidos({ customerId } = {}) {
  const { perfil } = useAuth()
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
  // pestaña, un operador de otra sede si eres admin, etc.) se vuelve a
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
      alert(`No tienes permiso para editar el pedido ${numero} (no es de tu sede).`)
      return
    }
    cargar()
  }

  // "Me lo quedo": un delivery del bot nace sin sede (ambas sedes despachan) y lo ven todas; quien lo toma lo
  // asigna a SU sede. El UPDATE solo toca la fila si sigue sin sede (`is null`): si dos personas lo toman a la
  // vez, gana la primera y la segunda no pisa nada. Solo personal con sede (un administrador no tiene una).
  const tomarPedido = async (numero) => {
    if (!perfil?.sedeId) return
    setGuardando(numero)
    const { error, data } = await supabase
      .from('orders')
      .update({ sede_id: perfil.sedeId, actualizado_en: new Date().toISOString() })
      .eq('numero', numero)
      .is('sede_id', null)
      .select('numero')
    setGuardando(null)
    if (error) {
      alert(`No se pudo tomar ${numero}: ${error.message}`)
      return
    }
    if (!data || data.length === 0) {
      alert(`Otra sede ya tomó el pedido ${numero}.`)
    }
    cargar()
  }

  // Pago reportado por el cliente (el bot leyó su captura): la persona lo CONFIRMA (el pedido pasa a pagado) o lo
  // RECHAZA (sigue pendiente y el cliente puede mandar otra captura). El bot nunca hace esto solo. El UPDATE solo
  // toca la fila si el pago sigue pendiente de revisar: dos personas tocando a la vez no se pisan, y quién lo
  // revisó lo registra la base con la sesión real (trigger de 0036), no este navegador.
  const resolverPago = async (numero, resultado) => {
    setGuardando(numero)
    const cambios =
      resultado === 'confirmado'
        ? { estado: 'paid', pago_resultado: 'confirmado', actualizado_en: new Date().toISOString() }
        : { pago_resultado: 'rechazado', actualizado_en: new Date().toISOString() }
    const { error, data } = await supabase
      .from('orders')
      .update(cambios)
      .eq('numero', numero)
      .eq('estado', 'payment_pending')
      .not('pago_reportado', 'is', null)
      .is('pago_resultado', null)
      .select('numero')
    setGuardando(null)
    if (error) {
      alert(`No se pudo ${resultado === 'confirmado' ? 'confirmar' : 'rechazar'} el pago de ${numero}: ${error.message}`)
      return
    }
    if (!data || data.length === 0) {
      alert(`El pago de ${numero} ya fue revisado o no tienes permiso para este pedido.`)
    }
    cargar()
  }
  const confirmarPago = (numero) => resolverPago(numero, 'confirmado')
  const rechazarPago = (numero) => resolverPago(numero, 'rechazado')

  return { pedidos, error, guardando, cambiarEstado, tomarPedido, confirmarPago, rechazarPago, recargar: cargar, perfil }
}

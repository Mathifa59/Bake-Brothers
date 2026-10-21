import { createContext, useContext, useMemo } from 'react'
import { construirAlertas, fechaLimaISO } from '@bakebrothers/domain'
import { supabase } from '../lib/supabase'
import { traerTodo, useAhora, useDatosVivos } from '../lib/datos'

const AlertasContext = createContext(null)

const ESTADOS_PRE_PRODUCCION = ['draft', 'confirmed', 'payment_pending', 'paid']

// Las cuatro consultas del Control Tower — todas sobre datos que ya existen y
// sujetas a la RLS por sede (un operador solo ve lo de su sede; un admin, todo).
async function cargarAlertas() {
  const [stock, pedidos, conversaciones] = await Promise.all([
    supabase
      .from('stock')
      .select('id, disponible, products(nombre), product_sizes(tamano), sedes(nombre)')
      .eq('disponible', false),
    traerTodo(() =>
      supabase
        .from('orders')
        .select(
          'numero, estado, requiere_confirmar_combo, actualizado_en, fecha_entrega, horario_entrega, customers(nombre), sedes(nombre)'
        )
        .in('estado', ESTADOS_PRE_PRODUCCION)
        .order('actualizado_en', { ascending: true })
    ),
    supabase.from('conversaciones').select('id, canal, ultimo_mensaje_en, sedes(nombre)').eq('estado', 'escalada'),
  ])
  if (stock.error) throw stock.error
  if (conversaciones.error) throw conversaciones.error

  return {
    stockAgotado: stock.data.map((s) => ({
      id: s.id,
      producto: s.products?.nombre ?? 'Producto',
      tamano: s.product_sizes?.tamano ?? null,
      sede: s.sedes?.nombre ?? null,
    })),
    pedidosPreProduccion: pedidos.map((p) => ({
      numero: p.numero,
      estado: p.estado,
      requiere_confirmar_combo: p.requiere_confirmar_combo,
      actualizado_en: p.actualizado_en,
      fecha_entrega: p.fecha_entrega,
      horario_entrega: p.horario_entrega,
      cliente: p.customers?.nombre ?? null,
      sede: p.sedes?.nombre ?? null,
    })),
    escaladas: conversaciones.data.map((c) => ({
      id: c.id,
      canal: c.canal,
      ultimo_mensaje_en: c.ultimo_mensaje_en,
      sede: c.sedes?.nombre ?? null,
    })),
  }
}

/**
 * Alertas reales de Control Tower, compartidas por el menú (contador del
 * Control Tower), la campana, el Resumen (prioridades del día) y la propia
 * pantalla — una sola carga, no una por componente. Pedidos y conversaciones
 * llegan por Realtime; el stock no está en la publicación de Realtime, así que
 * se refresca cada 60 s y al volver a la pestaña.
 */
export function AlertasProvider({ children }) {
  const ahora = useAhora(60_000)
  const { datos, error, cargando, recargar } = useDatosVivos(cargarAlertas, {
    tablas: ['orders', 'conversaciones'],
    refrescarCadaMs: 60_000,
  })

  const alertas = useMemo(
    () => (datos ? construirAlertas({ ...datos, hoy: fechaLimaISO(ahora) }) : null),
    [datos, ahora]
  )

  return (
    <AlertasContext.Provider value={{ alertas, error, cargando, recargar, ahora }}>{children}</AlertasContext.Provider>
  )
}

export const useAlertas = () => useContext(AlertasContext)

import { useMemo, useState } from 'react'
import { ChevronRight, Users } from 'lucide-react'
import { COMPRAS_FRECUENTE, DIAS_SIN_COMPRAR, segmentarClientes } from '@bakebrothers/domain'
import { supabase } from '../lib/supabase'
import { traerTodo, useDatosVivos } from '../lib/datos'
import { usePedidos } from '../hooks/usePedidos'
import TablaPedidos from '../components/TablaPedidos'
import { Cargando, EncabezadoBloque, ErrorCarga, Hero, Portada, Tarjeta } from '../components/bakeos/ui'

// Clientes + pedidos (customer_id, fecha, estado) — la base de los segmentos.
// Se piden TODAS las filas, paginando: PostgREST corta en 1000 sin avisar y la
// versión anterior (columna "Último pedido") ya traía los pedidos con ese
// tope silencioso. RLS por sede: un operador ve solo los clientes con pedidos
// en su sede (política de 0014), y sus pedidos.
async function cargarClientes() {
  const [clientes, pedidos] = await Promise.all([
    traerTodo(() => supabase.from('customers').select('id, nombre, telefono, creado_en').order('nombre')),
    traerTodo(() => supabase.from('orders').select('customer_id, creado_en, estado').order('creado_en', { ascending: false })),
  ])
  return { clientes, pedidos }
}

const SEGMENTOS = [
  { id: 'frecuentes', letra: 'F', titulo: 'Clientes frecuentes', detalle: `Compra ${COMPRAS_FRECUENTE}+ veces`, clave: 'frecuentes' },
  {
    id: 'sin30',
    letra: 'D',
    titulo: `Sin comprar hace ${DIAS_SIN_COMPRAR} días`,
    detalle: 'Compraron antes, sin pedidos recientes',
    clave: 'sinComprar30',
  },
  { id: 'nuevos', letra: 'N', titulo: 'Nuevos del mes', detalle: 'Registrados este mes', clave: 'nuevosDelMes' },
]

export default function Clientes() {
  const { datos, error } = useDatosVivos(cargarClientes, { tablas: ['orders'] })
  const [seleccionado, setSeleccionado] = useState(null) // { id, nombre }
  const [segmentoId, setSegmentoId] = useState(null)

  const { pedidos, error: errorPedidos, guardando, cambiarEstado } = usePedidos({ customerId: seleccionado?.id })

  const segmentos = useMemo(() => (datos ? segmentarClientes(datos.clientes, datos.pedidos) : null), [datos])
  const ultimoPedido = useMemo(() => {
    // Ya viene ordenado por fecha descendente: la primera ocurrencia por cliente es la más reciente.
    const m = {}
    for (const p of datos?.pedidos ?? []) if (!m[p.customer_id]) m[p.customer_id] = p.creado_en
    return m
  }, [datos])

  const visibles = useMemo(() => {
    if (!datos) return null
    const seg = SEGMENTOS.find((s) => s.id === segmentoId)
    return seg ? datos.clientes.filter((c) => segmentos[seg.clave].has(c.id)) : datos.clientes
  }, [datos, segmentos, segmentoId])

  return (
    <>
      <Portada titulo="Clientes" subtitulo="CRM y recompra" />

      {error && <ErrorCarga mensaje={error} />}
      {!datos && !error && <Cargando texto="Cargando clientes…" />}

      {datos && (
        <>
          <Hero className="mt-5">
            <span className="grid h-12 w-12 place-items-center rounded-full border border-white/20 text-acento">
              <Users size={22} aria-hidden="true" />
            </span>
            <p className="mt-4 text-[11px] font-bold uppercase tracking-widest text-acento">Base de clientes</p>
            <h2 className="mt-1 text-2xl font-semibold leading-snug">
              {datos.clientes.length} cliente{datos.clientes.length === 1 ? '' : 's'}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/70">
              Los segmentos se calculan con los pedidos reales de tu alcance.
            </p>
          </Hero>

          <Tarjeta className="mt-4 p-4">
            <EncabezadoBloque etiqueta="Segmentos útiles" titulo="Audiencias para esta semana" />
            <ul className="divide-y divide-borde">
              {SEGMENTOS.map((s) => {
                const activo = segmentoId === s.id
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setSegmentoId(activo ? null : s.id)}
                      aria-pressed={activo}
                      className={`flex w-full items-center gap-3 rounded-lg py-3 text-left ${activo ? 'bg-acento-suave/60' : ''}`}
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-acento-suave text-sm font-bold text-acento-oscuro">
                        {s.letra}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold leading-snug">{s.titulo}</span>
                        <span className="block text-xs text-gris">{s.detalle}</span>
                      </span>
                      <span className="text-sm font-bold">{segmentos[s.clave].size}</span>
                      <ChevronRight size={16} className="shrink-0 text-gris" aria-hidden="true" />
                    </button>
                  </li>
                )
              })}
            </ul>
            {segmentoId && (
              <button type="button" onClick={() => setSegmentoId(null)} className="mt-2 text-xs font-semibold text-acento-oscuro">
                Quitar filtro
              </button>
            )}
          </Tarjeta>

          <div className="mt-4 grid gap-4 lg:grid-cols-[360px_1fr]">
            <Tarjeta className="p-0">
              <p className="px-4 pt-4 text-[10.5px] font-bold uppercase tracking-wide text-gris">
                {segmentoId ? SEGMENTOS.find((s) => s.id === segmentoId).titulo : 'Todos los clientes'} · {visibles.length}
              </p>
              {visibles.length === 0 ? (
                <p className="p-4 text-sm text-gris">No hay clientes en este grupo todavía.</p>
              ) : (
                <ul className="mt-2 max-h-[28rem] divide-y divide-borde overflow-y-auto">
                  {visibles.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSeleccionado(c)}
                        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
                          seleccionado?.id === c.id ? 'bg-acento-suave/60' : 'hover:bg-crema'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{c.nombre}</span>
                          <span className="block text-xs text-gris">{c.telefono}</span>
                        </span>
                        <span className="shrink-0 text-right text-[11px] text-gris">
                          Último pedido
                          <span className="block font-semibold text-tinta">
                            {ultimoPedido[c.id] ? new Date(ultimoPedido[c.id]).toLocaleDateString('es-PE', { timeZone: 'America/Lima' }) : '—'}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>

            <div>
              {!seleccionado ? (
                <p className="text-sm text-gris">Elige un cliente para ver su historial de pedidos.</p>
              ) : (
                <>
                  <h2 className="mb-3 text-sm font-bold text-gris">Pedidos de {seleccionado.nombre}</h2>
                  {errorPedidos ? (
                    <p className="text-sm text-red-600">Error al cargar pedidos: {errorPedidos}</p>
                  ) : !pedidos ? (
                    <p className="text-sm text-gris">Cargando…</p>
                  ) : (
                    <TablaPedidos pedidos={pedidos} guardando={guardando} onCambiarEstado={cambiarEstado} />
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}

import { useMemo, useState } from 'react'
import { ChevronRight, Users } from 'lucide-react'
import { COMPRAS_FRECUENTE, DIAS_SIN_COMPRAR, segmentarClientes, telefonoLegible } from '@bakebrothers/domain'
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
    traerTodo(() => supabase.from('customers').select('id, nombre, telefono, creado_en, es_mayorista, tamano_habitual, es_interno, origen').order('nombre')),
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

// Con miles de contactos importados no se dibuja todo de una vez: se muestran los primeros y el buscador hace el resto.
const MAX_FILAS = 150
const sinTildes = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const VISTAS = [
  { id: 'todos', etiqueta: 'Todos' },
  { id: 'conPedidos', etiqueta: 'Con pedidos' },
  { id: 'soloContactos', etiqueta: 'Solo contactos' },
]

export default function Clientes() {
  const { datos, error } = useDatosVivos(cargarClientes, { tablas: ['orders'] })
  const [seleccionado, setSeleccionado] = useState(null) // { id, nombre }
  const [segmentoId, setSegmentoId] = useState(null)
  const [vista, setVista] = useState('todos')
  const [busqueda, setBusqueda] = useState('')

  const { pedidos, error: errorPedidos, guardando, cambiarEstado, tomarPedido, confirmarPago, rechazarPago, perfil } = usePedidos({ customerId: seleccionado?.id })

  // Los clientes internos (envíos a un local propio) se ven en la lista con su etiqueta, pero no son clientes:
  // no entran en los segmentos ni en el conteo, y sus pedidos tampoco.
  const internos = useMemo(() => new Set((datos?.clientes ?? []).filter((c) => c.es_interno).map((c) => c.id)), [datos])
  const segmentos = useMemo(
    () => (datos ? segmentarClientes(datos.clientes.filter((c) => !c.es_interno), datos.pedidos.filter((p) => !internos.has(p.customer_id))) : null),
    [datos, internos]
  )
  const ultimoPedido = useMemo(() => {
    // Ya viene ordenado por fecha descendente: la primera ocurrencia por cliente es la más reciente.
    const m = {}
    for (const p of datos?.pedidos ?? []) if (!m[p.customer_id]) m[p.customer_id] = p.creado_en
    return m
  }, [datos])

  // Quién tiene al menos un pedido (cualquier estado): los demás son contactos de la lista, sin compras.
  const conPedido = useMemo(() => new Set((datos?.pedidos ?? []).map((p) => p.customer_id)), [datos])
  const totales = useMemo(() => {
    const reales = (datos?.clientes ?? []).filter((c) => !c.es_interno)
    return {
      total: reales.length,
      conPedidos: reales.filter((c) => conPedido.has(c.id)).length,
      contactos: reales.filter((c) => !conPedido.has(c.id)).length,
    }
  }, [datos, conPedido])

  const filtrados = useMemo(() => {
    if (!datos) return null
    const seg = SEGMENTOS.find((s) => s.id === segmentoId)
    const q = sinTildes(busqueda).trim()
    const qDigitos = busqueda.replace(/\D/g, '')
    return datos.clientes.filter((c) => {
      if (seg && !segmentos[seg.clave].has(c.id)) return false
      if (vista === 'conPedidos' && !conPedido.has(c.id)) return false
      if (vista === 'soloContactos' && conPedido.has(c.id)) return false
      if (!q) return true
      if (sinTildes(c.nombre).includes(q)) return true
      return qDigitos.length >= 3 && (c.telefono ?? '').replace(/\D/g, '').includes(qDigitos)
    })
  }, [datos, segmentos, segmentoId, vista, busqueda, conPedido])
  const visibles = useMemo(() => (filtrados ? filtrados.slice(0, MAX_FILAS) : null), [filtrados])

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
              {totales.total.toLocaleString('es-PE')} contacto{totales.total === 1 ? '' : 's'}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/70">
              {totales.conPedidos.toLocaleString('es-PE')} con pedidos · {totales.contactos.toLocaleString('es-PE')} solo en la lista.
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

          <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
            <Tarjeta className="p-0">
              <p className="px-4 pt-4 text-[10.5px] font-bold uppercase tracking-wide text-gris">
                {segmentoId ? SEGMENTOS.find((s) => s.id === segmentoId).titulo : 'Todos los clientes'} · {filtrados.length.toLocaleString('es-PE')}
              </p>
              <div className="px-4 pt-2">
                <input
                  type="search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre o teléfono"
                  aria-label="Buscar cliente por nombre o teléfono"
                  className="w-full rounded-lg border border-borde bg-hueso px-3 py-2 text-sm"
                />
                <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Qué clientes ver">
                  {VISTAS.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setVista(v.id)}
                      aria-pressed={vista === v.id}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        vista === v.id ? 'bg-tinta text-white' : 'bg-hueso text-gris hover:text-tinta'
                      }`}
                    >
                      {v.etiqueta}
                    </button>
                  ))}
                </div>
              </div>
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
                          <span className="block truncate text-sm font-semibold">
                            {c.nombre}
                            {c.es_interno && (
                              <span className="ml-2 rounded-full bg-acento-suave px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-acento-oscuro">
                                Interno
                              </span>
                            )}
                            {c.es_mayorista && !c.es_interno && (
                              <span className="ml-2 rounded-full bg-hueso px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-gris">
                                Mayorista{c.tamano_habitual ? ` · ${c.tamano_habitual}` : ''}
                              </span>
                            )}
                          </span>
                          <span className="block text-xs text-gris">{c.telefono ? telefonoLegible(c.telefono) : 'Sin teléfono'}</span>
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
              {filtrados.length > visibles.length && (
                <p className="border-t border-borde px-4 py-3 text-xs text-gris">
                  Se muestran los primeros {visibles.length} de {filtrados.length.toLocaleString('es-PE')}. Usa el buscador para encontrar a alguien.
                </p>
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
                    <TablaPedidos pedidos={pedidos} guardando={guardando} onCambiarEstado={cambiarEstado} onTomar={tomarPedido} onConfirmarPago={confirmarPago} onRechazarPago={rechazarPago} perfil={perfil} />
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

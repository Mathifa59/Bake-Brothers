import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { usePedidos } from '../hooks/usePedidos'
import TablaPedidos from '../components/TablaPedidos'
import { Cargando, ErrorCarga, Portada, Tarjeta } from '../components/bakeos/ui'

const POR_PREPARAR = ['confirmed', 'payment_pending', 'paid', 'in_production']
const LISTOS = ['out_for_delivery']

export default function Pedidos() {
  const { pedidos, error, guardando, cambiarEstado } = usePedidos()
  const [filtro, setFiltro] = useState('todos')
  const [busqueda, setBusqueda] = useState('')

  const filtros = useMemo(() => {
    const lista = pedidos ?? []
    return [
      { id: 'todos', etiqueta: 'Todos', n: lista.length },
      { id: 'preparar', etiqueta: 'Por preparar', n: lista.filter((p) => POR_PREPARAR.includes(p.estado)).length },
      { id: 'listos', etiqueta: 'Listos', n: lista.filter((p) => LISTOS.includes(p.estado)).length },
    ]
  }, [pedidos])

  const visibles = useMemo(() => {
    if (!pedidos) return null
    const q = busqueda.trim().toLowerCase()
    return pedidos
      .filter((p) => (filtro === 'preparar' ? POR_PREPARAR.includes(p.estado) : filtro === 'listos' ? LISTOS.includes(p.estado) : true))
      .filter(
        (p) =>
          !q ||
          p.numero.toLowerCase().includes(q) ||
          (p.customers?.nombre ?? '').toLowerCase().includes(q) ||
          p.canal.toLowerCase().includes(q)
      )
  }, [pedidos, filtro, busqueda])

  return (
    <>
      <Portada titulo="Pedidos" subtitulo="Seguimiento multicanal" />

      <label className="mt-4 flex items-center gap-2 rounded-xl border border-borde bg-hueso px-3 py-2.5">
        <Search size={16} className="text-gris" aria-hidden="true" />
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar pedido, cliente o canal"
          aria-label="Buscar pedido, cliente o canal"
          className="w-full bg-transparent text-sm outline-none placeholder:text-gris/70"
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        {filtros.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltro(f.id)}
            aria-pressed={filtro === f.id}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              filtro === f.id ? 'bg-acento-suave text-acento-oscuro' : 'bg-borde/60 text-gris'
            }`}
          >
            {f.etiqueta} · {f.n}
          </button>
        ))}
      </div>

      <Tarjeta className="mt-4 p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-wide text-gris">Pedidos recientes</p>
            <h2 className="mt-1 text-base font-semibold">Seguimiento multicanal</h2>
          </div>
          <Link
            to="/nuevo-pedido"
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-tinta px-3.5 py-2.5 text-xs font-semibold text-white"
          >
            <Plus size={14} aria-hidden="true" /> Nuevo pedido
          </Link>
        </div>

        {error && <ErrorCarga mensaje={error} />}
        {!pedidos && !error && <Cargando texto="Cargando pedidos…" />}
        {visibles && <TablaPedidos pedidos={visibles} guardando={guardando} onCambiarEstado={cambiarEstado} />}
        {pedidos && pedidos.length >= 100 && (
          <p className="mt-3 text-xs text-gris">Se muestran los 100 pedidos más recientes. Los que están en producción siempre aparecen en Producción.</p>
        )}
      </Tarjeta>
    </>
  )
}

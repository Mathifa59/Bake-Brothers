import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { COLUMNAS_PRODUCCION, accionDeProduccion, armarTablero, estadoLegible, fechaLimaISO, sumarDiasISO } from '@bakebrothers/domain'
import { supabase } from '../lib/supabase'
import { actualizarEstadoPedido, traerTodo, useAhora, useDatosVivos } from '../lib/datos'
import { fechaCorta, formatoPrecio } from '../utils/formato'
import { Cargando, ErrorCarga, Pill, Portada, Tarjeta } from '../components/bakeos/ui'

const ESTADOS_TABLERO = ['confirmed', 'paid', 'payment_pending', 'in_production', 'out_for_delivery']

// Pedidos activos (sin el tope de 100 de la pantalla de Pedidos), con sus
// líneas para mostrar qué hay que preparar. RLS por sede; Realtime sobre orders.
async function cargarPedidosActivos() {
  return traerTodo(() =>
    supabase
      .from('orders')
      .select(
        'numero, estado, tipo_entrega, fecha_entrega, horario_entrega, total, canal, requiere_confirmar_combo, sedes(nombre), customers(nombre), order_items(nombre_producto, cantidad, tamano)'
      )
      .in('estado', ESTADOS_TABLERO)
      .order('fecha_entrega', { ascending: true })
      .order('horario_entrega', { ascending: true })
  )
}

const FILTROS = [
  { id: 'todos', etiqueta: 'Todos' },
  { id: 'hoy', etiqueta: 'Hoy' },
  { id: 'manana', etiqueta: 'Mañana' },
]

function resumenItems(items) {
  if (!items?.length) return 'Sin líneas'
  const [primero, ...resto] = items
  const base = `${primero.cantidad} × ${primero.nombre_producto}${primero.tamano ? ` (${primero.tamano})` : ''}`
  return resto.length ? `${base} + ${resto.length} más` : base
}

function TarjetaPedido({ pedido, hoy, manana, enviando, onAvanzar, mostrarSede }) {
  const accion = accionDeProduccion(pedido.estado)
  const cuando =
    pedido.fecha_entrega === hoy ? 'Hoy' : pedido.fecha_entrega === manana ? 'Mañana' : fechaCorta(pedido.fecha_entrega)
  return (
    <li className="rounded-xl border border-borde bg-hueso p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-snug">{resumenItems(pedido.order_items)}</p>
        <span className="shrink-0 text-xs font-semibold text-gris">{pedido.numero}</span>
      </div>
      <p className="mt-1 text-xs text-gris">
        {cuando} · {pedido.horario_entrega} · {pedido.tipo_entrega === 'tienda' ? 'Recojo' : 'Delivery'}
        {pedido.customers?.nombre ? ` · ${pedido.customers.nombre}` : ''}
        {mostrarSede && pedido.sedes?.nombre ? ` · ${pedido.sedes.nombre}` : ''}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold">{formatoPrecio(pedido.total)}</span>
        {pedido.estado === 'confirmed' && <Pill>Pago contra entrega</Pill>}
        {pedido.requiere_confirmar_combo && pedido.estado !== 'in_production' && pedido.estado !== 'out_for_delivery' && (
          <Pill tono="prioridad">Revisar combo</Pill>
        )}
        {pedido.estado === 'out_for_delivery' && <Pill tono="ok">{estadoLegible(pedido.estado, pedido.tipo_entrega)}</Pill>}
      </div>
      {accion && (
        <button
          type="button"
          disabled={enviando === pedido.numero}
          onClick={() => onAvanzar(pedido, accion)}
          className="mt-3 w-full rounded-lg bg-tinta px-3 py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {enviando === pedido.numero ? 'Guardando…' : `${accion.etiqueta} →`}
        </button>
      )}
    </li>
  )
}

function Columna({ titulo, color, pedidos, children }) {
  return (
    <section className="rounded-2xl bg-borde/40 p-3" aria-label={titulo}>
      <h2 className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold">
        <span className={`h-2 w-2 rounded-full ${color}`} aria-hidden="true" />
        {titulo}
        <span className="ml-auto text-xs font-medium text-gris">{pedidos.length}</span>
      </h2>
      {pedidos.length === 0 ? <p className="px-1 py-3 text-xs text-gris">Nada por aquí.</p> : <ul className="space-y-2">{children}</ul>}
    </section>
  )
}

const COLORES = { por_iniciar: 'bg-gris', en_produccion: 'bg-acento', listo: 'bg-ok' }

export default function Produccion() {
  const ahora = useAhora(60_000)
  const hoy = fechaLimaISO(ahora)
  const manana = sumarDiasISO(hoy, 1)
  const [filtro, setFiltro] = useState('todos')
  const [enviando, setEnviando] = useState(null)
  const [errorAccion, setErrorAccion] = useState(null)
  const { datos, error, recargar } = useDatosVivos(cargarPedidosActivos, { tablas: ['orders'] })

  const visibles = useMemo(() => {
    if (!datos) return null
    if (filtro === 'hoy') return datos.filter((p) => p.fecha_entrega === hoy)
    if (filtro === 'manana') return datos.filter((p) => p.fecha_entrega === manana)
    return datos
  }, [datos, filtro, hoy, manana])

  const tablero = useMemo(() => (visibles ? armarTablero(visibles) : null), [visibles])
  const hayVariasSedes = useMemo(() => new Set((datos ?? []).map((p) => p.sedes?.nombre)).size > 1, [datos])

  const avanzar = async (pedido, accion) => {
    setEnviando(pedido.numero)
    setErrorAccion(null)
    // El trigger de la base valida la transición igual que la máquina de estados del dominio.
    const problema = await actualizarEstadoPedido(pedido.numero, accion.hacia)
    setEnviando(null)
    if (problema) setErrorAccion(problema)
    recargar()
  }

  const grupos = {
    por_iniciar: tablero?.porIniciar ?? [],
    en_produccion: tablero?.enProduccion ?? [],
    listo: tablero?.listo ?? [],
  }

  return (
    <>
      <Portada titulo="Producción" subtitulo="Demanda y despacho" />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltro(f.id)}
            aria-pressed={filtro === f.id}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              filtro === f.id ? 'bg-acento-suave text-acento-oscuro' : 'bg-borde/60 text-gris'
            }`}
          >
            {f.etiqueta}
          </button>
        ))}
      </div>

      {tablero && tablero.pagoPendiente > 0 && (
        <Tarjeta className="mt-3 flex items-center justify-between gap-3 p-3">
          <p className="text-sm">
            <span className="font-semibold">{tablero.pagoPendiente}</span> pedido{tablero.pagoPendiente > 1 ? 's' : ''} esperando
            pago <span className="text-gris">— no pueden iniciar producción hasta que se pague.</span>
          </p>
          <Link to="/pedidos" className="shrink-0 text-xs font-semibold text-acento-oscuro">
            Ver pedidos
          </Link>
        </Tarjeta>
      )}

      {errorAccion && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {errorAccion}
        </p>
      )}
      {error && <ErrorCarga mensaje={error} />}
      {!datos && !error && <Cargando texto="Cargando producción…" />}

      {tablero && (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {COLUMNAS_PRODUCCION.map((c) => (
            <Columna key={c.id} titulo={c.titulo} color={COLORES[c.id]} pedidos={grupos[c.id]}>
              {grupos[c.id].map((p) => (
                <TarjetaPedido
                  key={p.numero}
                  pedido={p}
                  hoy={hoy}
                  manana={manana}
                  enviando={enviando}
                  onAvanzar={avanzar}
                  mostrarSede={hayVariasSedes}
                />
              ))}
            </Columna>
          ))}
        </div>
      )}
    </>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useMetricas } from '../hooks/useMetricas'
import { supabase } from '../lib/supabase'
import GraficoBarras from '../components/GraficoBarras'

const formatoMoneda = (n) => `S/ ${Number(n ?? 0).toFixed(2)}`

// "Hoy" tiene que ser el día calendario en Lima (único lugar donde opera
// el negocio), no el del timezone que tenga configurado el sistema
// operativo del dispositivo del operador — confiar en new Date().getDate()
// directo ya causó un bug real de 5 horas del lado del backend (ver 0027),
// no vale la pena repetir el mismo supuesto acá. Intl.DateTimeFormat con
// timeZone explícito da los componentes Y/M/D correctos sin importar en
// qué timezone esté el navegador; se anclan a un Date en UTC solo para
// poder hacer aritmética de calendario (+/- días) sin que ningún getter
// local vuelva a meter una zona horaria de por medio.
function fechaLimaComoUTC(fechaReal = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(fechaReal)
  const { year, month, day } = Object.fromEntries(partes.map((p) => [p.type, p.value]))
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
}

function aISO(fechaUTC) {
  const y = fechaUTC.getUTCFullYear()
  const m = String(fechaUTC.getUTCMonth() + 1).padStart(2, '0')
  const d = String(fechaUTC.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function rangoHoy() {
  const hoy = aISO(fechaLimaComoUTC())
  return { desde: hoy, hasta: hoy }
}

function rangoEstaSemana() {
  const hoy = fechaLimaComoUTC()
  // Semana de lunes a hoy (0 = domingo en getUTCDay()).
  const diaSemana = hoy.getUTCDay()
  const offsetDesdeElLunes = diaSemana === 0 ? 6 : diaSemana - 1
  const lunes = new Date(hoy)
  lunes.setUTCDate(hoy.getUTCDate() - offsetDesdeElLunes)
  return { desde: aISO(lunes), hasta: aISO(hoy) }
}

function rangoEsteMes() {
  const hoy = fechaLimaComoUTC()
  const primero = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1))
  return { desde: aISO(primero), hasta: aISO(hoy) }
}

const PRESETS = [
  { key: 'hoy', label: 'Hoy', calcular: rangoHoy },
  { key: 'semana', label: 'Esta semana', calcular: rangoEstaSemana },
  { key: 'mes', label: 'Este mes', calcular: rangoEsteMes },
  { key: 'personalizado', label: 'Personalizado', calcular: null },
]

function TarjetaKpi({ etiqueta, valor }) {
  return (
    <div className="rounded-2xl border border-borde/60 bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-gris">{etiqueta}</p>
      <p className="mt-1 text-3xl font-extrabold text-tinta">{valor}</p>
    </div>
  )
}

function ListaTop({ titulo, items, formatoLinea }) {
  return (
    <div className="rounded-2xl border border-borde/60 bg-white p-5">
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gris">{titulo}</p>
      {!items || items.length === 0 ? (
        <p className="text-sm text-gris">Sin ventas en este rango.</p>
      ) : (
        <ol className="space-y-2 text-sm">
          {items.map((item, i) => (
            <li key={item.id} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-caramelo-suave text-[11px] font-bold text-caramelo">
                  {i + 1}
                </span>
                <span className="text-tinta">{item.nombre}</span>
              </span>
              <span className="shrink-0 font-semibold text-gris">{formatoLinea(item)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export default function Metricas() {
  const { perfil } = useAuth()
  const esAdmin = perfil?.rol === 'admin'

  const [preset, setPreset] = useState('mes')
  const [rangoPersonalizado, setRangoPersonalizado] = useState(rangoEsteMes())
  const [sedes, setSedes] = useState([])
  const [sedeId, setSedeId] = useState(esAdmin ? null : perfil?.sedeId ?? null)
  const [vistaGrafico, setVistaGrafico] = useState('ingresos') // 'ingresos' | 'pedidos'

  useEffect(() => {
    if (!esAdmin) return
    supabase
      .from('sedes')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => setSedes(data ?? []))
  }, [esAdmin])

  const rango = useMemo(() => {
    if (preset === 'personalizado') return rangoPersonalizado
    return PRESETS.find((p) => p.key === preset).calcular()
  }, [preset, rangoPersonalizado])

  const { kpis, topPorCantidad, topPorIngresos, tendencia, cargando, error } = useMetricas({
    desde: rango.desde,
    hasta: rango.hasta,
    sedeId,
  })

  const datosGrafico = useMemo(() => {
    if (!tendencia) return null
    return tendencia.map((d) => ({ fecha: d.fecha, valor: vistaGrafico === 'ingresos' ? d.ingresos : d.pedidos }))
  }, [tendencia, vistaGrafico])

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold">Métricas</h1>
        {esAdmin ? (
          <select
            value={sedeId ?? ''}
            onChange={(e) => setSedeId(e.target.value || null)}
            className="rounded-lg border border-borde bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-acento"
          >
            <option value="">Todas las sedes</option>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        ) : (
          <span className="rounded-full bg-acento-suave px-3 py-1.5 text-xs font-bold text-acento-oscuro">
            {perfil?.sedeNombre ?? 'Tu sede'}
          </span>
        )}
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                preset === p.key ? 'bg-caramelo text-white' : 'border border-borde text-tinta/70 hover:bg-caramelo-suave'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'personalizado' && (
          <div className="flex items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gris">Desde</label>
              <input
                type="date"
                value={rangoPersonalizado.desde}
                max={rangoPersonalizado.hasta}
                onChange={(e) => setRangoPersonalizado((r) => ({ ...r, desde: e.target.value }))}
                className="rounded-lg border border-borde bg-white px-3 py-2 text-sm outline-none focus:border-acento"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gris">Hasta</label>
              <input
                type="date"
                value={rangoPersonalizado.hasta}
                min={rangoPersonalizado.desde}
                onChange={(e) => setRangoPersonalizado((r) => ({ ...r, hasta: e.target.value }))}
                className="rounded-lg border border-borde bg-white px-3 py-2 text-sm outline-none focus:border-acento"
              />
            </div>
          </div>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-red-600">Error: {error}</p>}
      {cargando && !error && <p className="text-sm text-gris">Cargando…</p>}

      {!cargando && !error && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <TarjetaKpi etiqueta="Pedidos" valor={kpis.pedidos} />
            <TarjetaKpi etiqueta="Ingresos" valor={formatoMoneda(kpis.ingresos)} />
            <TarjetaKpi etiqueta="Ticket promedio" valor={formatoMoneda(kpis.ticket_promedio)} />
          </div>

          <div className="mb-6 rounded-2xl border border-borde/60 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-gris">Tendencia</p>
              <div className="flex gap-1">
                <button
                  onClick={() => setVistaGrafico('ingresos')}
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    vistaGrafico === 'ingresos' ? 'bg-caramelo text-white' : 'text-gris hover:bg-caramelo-suave'
                  }`}
                >
                  Ingresos
                </button>
                <button
                  onClick={() => setVistaGrafico('pedidos')}
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    vistaGrafico === 'pedidos' ? 'bg-caramelo text-white' : 'text-gris hover:bg-caramelo-suave'
                  }`}
                >
                  Pedidos
                </button>
              </div>
            </div>
            <GraficoBarras
              datos={datosGrafico}
              formatoValor={vistaGrafico === 'ingresos' ? formatoMoneda : (v) => `${v} pedido${v === 1 ? '' : 's'}`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ListaTop
              titulo="Más vendidos (por cantidad)"
              items={topPorCantidad}
              formatoLinea={(item) => `${item.cantidad} und.`}
            />
            <ListaTop
              titulo="Más vendidos (por ingresos)"
              items={topPorIngresos}
              formatoLinea={(item) => formatoMoneda(item.ingresos)}
            />
          </div>
          <p className="mt-3 text-xs text-gris">
            No incluye catering: se cotiza a mano, sin precio de catálogo comparable.
          </p>
        </>
      )}
    </div>
  )
}

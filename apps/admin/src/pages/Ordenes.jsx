import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, FileText, Plus } from 'lucide-react'
import { CORTE_TEXTO, estadoEquipo, evaluarCorteOrden, fechaLimaISO, sumarDiasISO } from '@bakebrothers/domain'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { actualizarEstadoPedido, traerTodo, useAhora, useDatosVivos } from '../lib/datos'
import { abrirPdfAutenticado } from '../lib/apiClient'
import { fechaCorta, formatoPrecio } from '../utils/formato'
import { mensajeDeError, ordenarEmpanadas } from '../utils/ordenes'
import { Cargando, ErrorCarga, Pill, Portada, Tarjeta } from '../components/bakeos/ui'
import FormMayorista from '../components/ordenes/FormMayorista'
import FormRappi from '../components/ordenes/FormRappi'

const PESTANAS = [
  { id: 'lista', etiqueta: 'Del día' },
  { id: 'mayorista', etiqueta: 'Mayorista' },
  { id: 'rappi', etiqueta: 'Rappi' },
]

const CANAL = {
  mayorista: { texto: 'Mayorista', tono: 'lila' },
  rappi: { texto: 'Rappi', tono: 'prioridad' },
  presencial: { texto: 'Encargo', tono: 'neutro' },
}

const TONO_ESTADO = { Confirmado: 'neutro', 'En preparación': 'prioridad', Listo: 'ok', Despachado: 'ok', Anulado: 'neutro', 'Por pagar': 'prioridad' }

async function cargarOrdenes(fecha) {
  return traerTodo(() =>
    supabase
      .from('orders')
      .select(
        'numero, estado, canal, horario_entrega, total, total_pendiente, fuera_de_corte, referencia_externa, nota, sedes(nombre), customers(nombre), order_items(nombre_producto, tamano, cantidad)'
      )
      .eq('fecha_entrega', fecha)
      .in('canal', ['mayorista', 'rappi', 'presencial'])
      .order('horario_entrega', { ascending: true })
  )
}

async function cargarCatalogo() {
  const [productos, mayoristas] = await Promise.all([
    supabase.from('products').select('id, nombre, modo_produccion, product_sizes(id, tamano, precio, visible_publico)').order('nombre'),
    supabase.from('customers').select('id, nombre, tamano_habitual, hora_habitual').eq('es_mayorista', true).order('nombre'),
  ])
  if (productos.error) throw productos.error
  if (mayoristas.error) throw mayoristas.error
  const todos = productos.data
  return {
    empanadas: ordenarEmpanadas(todos),
    // Postres y lo demás que se pide por línea (no empanadas, no bebidas: no se producen).
    postres: todos.filter((p) => !/^empanada\b/i.test(p.nombre) && p.modo_produccion !== 'no_produce'),
    todos,
    mayoristas: mayoristas.data,
  }
}

function resumenLineas(items) {
  if (!items?.length) return 'Sin líneas'
  const cuenta = (xs) => xs.reduce((n, i) => n + i.cantidad, 0)
  const empanadas = items.filter((i) => /^empanada\b/i.test(i.nombre_producto))
  const otros = items.filter((i) => !/^empanada\b/i.test(i.nombre_producto))
  const partes = []
  const med = empanadas.filter((i) => i.tamano === 'Mediana')
  const gr = empanadas.filter((i) => i.tamano !== 'Mediana')
  if (med.length) partes.push(`${cuenta(med)} empanadas medianas`)
  if (gr.length) partes.push(`${cuenta(gr)} empanadas grandes`)
  if (otros.length) partes.push(otros.map((i) => `${i.cantidad} × ${i.nombre_producto}${i.tamano ? ` (${i.tamano})` : ''}`).join(', '))
  return partes.join(' · ')
}

function TarjetaOrden({ orden, onAnular, anulando }) {
  const estado = estadoEquipo(orden.estado)
  const canal = CANAL[orden.canal] ?? CANAL.presencial
  const puedeAnular = orden.estado === 'confirmed' || orden.estado === 'paid'
  return (
    <li className={`rounded-2xl border border-borde bg-hueso p-3.5 ${orden.estado === 'cancelled' ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">
            {orden.canal === 'rappi' ? `Rappi ${orden.referencia_externa ?? ''}` : (orden.customers?.nombre ?? 'Cliente')}
          </p>
          <p className="text-xs text-gris">
            {orden.numero} · {orden.horario_entrega}
            {orden.sedes?.nombre ? ` · ${orden.sedes.nombre}` : ''}
          </p>
        </div>
        <Pill tono={TONO_ESTADO[estado] ?? 'neutro'}>{estado}</Pill>
      </div>
      <p className="mt-2 text-sm leading-snug">{resumenLineas(orden.order_items)}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Pill tono={canal.tono}>{canal.texto}</Pill>
        {orden.total_pendiente ? <Pill tono="neutro">Total por cotizar</Pill> : <span className="text-xs font-semibold">{formatoPrecio(orden.total)}</span>}
        {orden.fuera_de_corte && <Pill tono="prioridad">Fuera de corte</Pill>}
      </div>
      {puedeAnular && (
        <button
          type="button"
          disabled={anulando === orden.numero}
          onClick={() => onAnular(orden)}
          className="mt-3 h-10 w-full rounded-xl border border-borde text-xs font-semibold text-gris disabled:opacity-50"
        >
          Anular
        </button>
      )}
    </li>
  )
}

export default function Ordenes() {
  const { perfil } = useAuth()
  const esAdmin = perfil?.rol === 'admin'
  const ahora = useAhora(30_000)
  const hoy = fechaLimaISO(ahora)
  const manana = sumarDiasISO(hoy, 1)
  const [pestana, setPestana] = useState('lista')
  const [fecha, setFecha] = useState(manana)
  const [sedes, setSedes] = useState([])
  const [sedeId, setSedeId] = useState(esAdmin ? '' : (perfil?.sedeId ?? ''))
  const [errorAccion, setErrorAccion] = useState(null)
  const [anulando, setAnulando] = useState(null)
  const [imprimiendo, setImprimiendo] = useState(false)

  // Mientras nadie elija otra fecha, la que se mira es «mañana»: el día en que se trabaja esta lista.
  const [fechaManual, setFechaManual] = useState(false)
  useEffect(() => {
    if (!fechaManual) setFecha(manana)
  }, [manana, fechaManual])

  useEffect(() => {
    if (!esAdmin) return
    supabase
      .from('sedes')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => {
        setSedes(data ?? [])
        if (data?.length) setSedeId((s) => s || data[0].id)
      })
  }, [esAdmin])

  const { datos: ordenes, error, recargar } = useDatosVivos(() => cargarOrdenes(fecha), { tablas: ['orders'], deps: [fecha] })
  const { datos: catalogo, error: errorCatalogo, recargar: recargarCatalogo } = useDatosVivos(cargarCatalogo)

  const corte = useMemo(() => evaluarCorteOrden(ahora, fecha), [ahora, fecha])
  const mananaEsLaFecha = fecha === manana
  const minutosHastaCorte = useMemo(() => {
    if (!mananaEsLaFecha || corte.fueraDeCorte) return null
    const partes = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ahora).split(':').map(Number)
    return 22 * 60 + 30 - (partes[0] * 60 + partes[1])
  }, [ahora, mananaEsLaFecha, corte])

  const anular = async (orden) => {
    if (!window.confirm(`¿Anular la orden ${orden.numero}?`)) return
    setAnulando(orden.numero)
    setErrorAccion(null)
    const problema = await actualizarEstadoPedido(orden.numero, 'cancelled')
    setAnulando(null)
    if (problema) setErrorAccion(problema)
    recargar()
  }

  const imprimirEmpaque = async () => {
    setImprimiendo(true)
    setErrorAccion(null)
    try {
      await abrirPdfAutenticado(`/api/dashboard/ordenes/empaque-mayorista.pdf?fecha=${fecha}${esAdmin && sedeId ? `&sedeId=${sedeId}` : ''}`, `empaque-mayorista-${fecha}.pdf`)
    } catch (err) {
      setErrorAccion(mensajeDeError(err))
    } finally {
      setImprimiendo(false)
    }
  }

  const alRegistrar = () => {
    recargar()
    recargarCatalogo()
  }

  const hayMayoristas = (ordenes ?? []).some((o) => o.canal === 'mayorista' && o.estado !== 'cancelled')

  return (
    <>
      <Portada titulo="Órdenes" subtitulo="Mayoristas, Rappi y encargos" accion={false} />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {[
          { f: hoy, t: 'Hoy' },
          { f: manana, t: 'Mañana' },
        ].map((x) => (
          <button
            key={x.t}
            type="button"
            aria-pressed={fecha === x.f}
            onClick={() => {
              setFecha(x.f)
              setFechaManual(x.f !== manana)
            }}
            className={`h-11 rounded-full px-4 text-sm font-semibold transition-colors ${fecha === x.f ? 'bg-acento-suave text-acento-oscuro' : 'bg-borde/60 text-gris'}`}
          >
            {x.t}
          </button>
        ))}
        <label className="sr-only" htmlFor="ord-fecha">
          Otra fecha
        </label>
        <input
          id="ord-fecha"
          type="date"
          value={fecha}
          onChange={(e) => {
            if (!e.target.value) return
            setFecha(e.target.value)
            setFechaManual(e.target.value !== manana)
          }}
          className="h-11 rounded-full border border-borde bg-hueso px-3 text-sm outline-none focus:border-acento"
        />
        {esAdmin && sedes.length > 0 && (
          <select
            value={sedeId}
            onChange={(e) => setSedeId(e.target.value)}
            aria-label="Local"
            className="h-11 rounded-full border border-borde bg-hueso px-3 text-sm font-semibold outline-none focus:border-acento"
          >
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        )}
      </div>

      {mananaEsLaFecha && (
        <Tarjeta className={`mt-3 flex items-center gap-3 p-3 ${corte.fueraDeCorte ? 'border-acento bg-acento-suave' : ''}`}>
          <AlertTriangle size={18} className={corte.fueraDeCorte ? 'text-acento-oscuro' : 'text-gris'} aria-hidden="true" />
          <p className="text-sm">
            {corte.fueraDeCorte ? (
              <>
                <span className="font-semibold text-acento-oscuro">Ya pasó el corte de las {CORTE_TEXTO}</span> — las órdenes nuevas para mañana se registran igual, marcadas «fuera de corte».
              </>
            ) : (
              <>
                Corte a las <span className="font-semibold">{CORTE_TEXTO}</span>
                {minutosHastaCorte !== null && minutosHastaCorte > 0 && (
                  <span className="text-gris"> · faltan {Math.floor(minutosHastaCorte / 60) > 0 ? `${Math.floor(minutosHastaCorte / 60)} h ` : ''}{minutosHastaCorte % 60} min</span>
                )}
              </>
            )}
          </p>
        </Tarjeta>
      )}

      <div role="tablist" aria-label="Órdenes" className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-borde/60 p-1">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={pestana === p.id}
            onClick={() => setPestana(p.id)}
            className={`h-11 rounded-lg text-sm font-semibold transition-colors ${pestana === p.id ? 'bg-tinta text-white' : 'text-gris'}`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {errorAccion && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {errorAccion}
        </p>
      )}

      <div className="mt-4 pb-8">
        {pestana === 'lista' && (
          <>
            {error && <ErrorCarga mensaje={error} />}
            {!ordenes && !error && <Cargando texto="Cargando órdenes…" />}
            {ordenes && (
              <>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-sm text-gris">
                    {ordenes.filter((o) => o.estado !== 'cancelled').length} orden(es) para {fecha === hoy ? 'hoy' : fecha === manana ? 'mañana' : fechaCorta(fecha)}
                  </p>
                  <Link to="/nuevo-pedido" className="flex h-10 items-center gap-1.5 rounded-xl border border-tinta px-3 text-xs font-semibold text-tinta">
                    <Plus size={14} aria-hidden="true" />
                    Nuevo encargo
                  </Link>
                </div>
                {hayMayoristas && (
                  <button
                    type="button"
                    onClick={imprimirEmpaque}
                    disabled={imprimiendo}
                    className="mb-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-tinta text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <FileText size={16} aria-hidden="true" />
                    {imprimiendo ? 'Generando…' : 'Imprimir hoja de empaque mayorista'}
                  </button>
                )}
                {ordenes.length === 0 ? (
                  <Tarjeta className="text-center text-sm text-gris">No hay órdenes para esa fecha. Registra una en Mayorista o Rappi.</Tarjeta>
                ) : (
                  <ul className="space-y-2.5">
                    {ordenes.map((o) => (
                      <TarjetaOrden key={o.numero} orden={o} onAnular={anular} anulando={anulando} />
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}

        {pestana !== 'lista' && errorCatalogo && <ErrorCarga mensaje={errorCatalogo} />}
        {pestana !== 'lista' && !catalogo && !errorCatalogo && <Cargando texto="Cargando catálogo…" />}
        {pestana === 'mayorista' && catalogo && (
          <FormMayorista
            key={`${fecha}-${sedeId}`}
            empanadas={catalogo.empanadas}
            postres={catalogo.postres}
            mayoristas={catalogo.mayoristas}
            fecha={fecha}
            corte={corte}
            sedeId={esAdmin ? sedeId : undefined}
            onRegistrada={alRegistrar}
          />
        )}
        {pestana === 'rappi' && catalogo && (
          <FormRappi
            key={`${fecha}-${sedeId}`}
            productos={catalogo.todos}
            fecha={fecha}
            corte={corte}
            sedeId={esAdmin ? sedeId : undefined}
            onRegistrada={alRegistrar}
          />
        )}
      </div>
    </>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, FileText, Settings2 } from 'lucide-react'
import { fechaLimaISO, nombreDeArea, sumarDiasISO } from '@bakebrothers/domain'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { useAhora, useDatosVivos } from '../../lib/datos'
import { abrirPdfAutenticado, marcarProducido, traerPlanDelDia } from '../../lib/apiClient'
import { fechaCorta } from '../../utils/formato'
import { mensajeDeError } from '../../utils/ordenes'
import { Cargando, ErrorCarga, Pill, Tarjeta } from '../bakeos/ui'

function LineaPlan({ linea, puedeMarcar, motivoNoPuede, onMarcar, guardando }) {
  const [otra, setOtra] = useState(false)
  const [cantidad, setCantidad] = useState(String(linea.total))
  const producida = linea.producida
  const nombre = linea.sabor ? `${linea.nombre} — ${linea.sabor}` : linea.nombre
  const esProducto = linea.origen === 'producto'
  // La empanada sin tamaño es la «grande»: se dice, para no confundirla con la mediana en la hoja.
  const etiquetaGrande = esProducto && linea.esEmpanada && !linea.tamano

  const guardar = (n) => {
    onMarcar(linea, n)
    setOtra(false)
  }

  return (
    <li className="rounded-2xl border border-borde bg-hueso p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-snug">{nombre}</p>
          {(linea.tamano || etiquetaGrande) && <p className="text-xs text-gris">{linea.tamano ?? 'Grande'}</p>}
        </div>
        <p className="shrink-0 text-2xl font-bold leading-none tabular-nums">{linea.total}</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-gris">
        {linea.porPedido > 0 && <span>Por pedido {linea.porPedido}</span>}
        {linea.porPedido > 0 && linea.vitrina > 0 && <span aria-hidden="true">·</span>}
        {linea.vitrina > 0 && <span>Vitrina {linea.vitrina}</span>}
        {linea.antesDe8 > 0 && <Pill tono="prioridad">{linea.antesDe8} antes de las 8:00</Pill>}
        {linea.origen === 'catering' && <Pill tono="lila">Catering</Pill>}
      </div>

      {esProducto && (
        <div className="mt-3">
          {producida !== null && !otra ? (
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-ok">
                <CheckCircle2 size={16} aria-hidden="true" />
                Producido {producida}
                {producida !== linea.total ? <span className="font-normal text-gris"> de {linea.total}</span> : null}
              </span>
              {puedeMarcar && (
                <button type="button" onClick={() => setOtra(true)} className="h-10 rounded-xl border border-borde px-3 text-xs font-semibold text-gris">
                  Cambiar
                </button>
              )}
            </div>
          ) : otra ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                aria-label={`Cantidad producida de ${nombre}`}
                className="h-11 w-24 rounded-xl border border-borde bg-hueso text-center text-base font-bold outline-none focus:border-acento"
              />
              <button
                type="button"
                disabled={guardando}
                onClick={() => guardar(Number(cantidad))}
                className="h-11 flex-1 rounded-xl bg-tinta text-sm font-semibold text-white disabled:opacity-50"
              >
                Guardar
              </button>
              <button type="button" onClick={() => setOtra(false)} className="h-11 rounded-xl border border-borde px-3 text-sm text-gris">
                Cancelar
              </button>
            </div>
          ) : puedeMarcar ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={guardando}
                onClick={() => guardar(linea.total)}
                className="h-11 flex-1 rounded-xl bg-tinta text-sm font-semibold text-white disabled:opacity-50"
              >
                {guardando ? 'Guardando…' : `Producido (${linea.total})`}
              </button>
              <button type="button" onClick={() => setOtra(true)} className="h-11 rounded-xl border border-borde px-3 text-sm font-semibold text-gris">
                Otra cantidad
              </button>
            </div>
          ) : (
            <p className="text-xs text-gris">{motivoNoPuede}</p>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * Plan del día: lo que se produce POR PEDIDO (órdenes, encargos, Rappi, catering, tienda) más lo que se produce PARA
 * VITRINA (plan fijo por sede). Al marcar un producto como producido, el stock de esa sede queda disponible.
 */
export default function PlanDelDia() {
  const { perfil } = useAuth()
  const esAdmin = perfil?.rol === 'admin'
  const ahora = useAhora(60_000)
  const hoy = fechaLimaISO(ahora)
  const manana = sumarDiasISO(hoy, 1)
  const [fecha, setFecha] = useState(hoy)
  const [sedes, setSedes] = useState([])
  const [sedeId, setSedeId] = useState('') // admin: '' = todas las sedes
  const [guardando, setGuardando] = useState(null)
  const [errorAccion, setErrorAccion] = useState(null)
  const [imprimiendo, setImprimiendo] = useState(false)

  useEffect(() => {
    if (!esAdmin) return
    supabase
      .from('sedes')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => setSedes(data ?? []))
  }, [esAdmin])

  const { datos: plan, error, recargar } = useDatosVivos(() => traerPlanDelDia(fecha, esAdmin ? sedeId || null : null), {
    tablas: ['orders'],
    deps: [fecha, sedeId],
    refrescarCadaMs: 60_000,
  })

  const marcar = async (linea, cantidadProducida) => {
    setGuardando(linea.clave)
    setErrorAccion(null)
    try {
      await marcarProducido({
        fecha,
        ...(esAdmin ? { sedeId } : {}),
        productId: linea.productId,
        tamano: linea.tamano,
        cantidadProducida,
      })
      recargar()
    } catch (err) {
      setErrorAccion(mensajeDeError(err))
    } finally {
      setGuardando(null)
    }
  }

  const imprimir = async () => {
    setImprimiendo(true)
    setErrorAccion(null)
    try {
      await abrirPdfAutenticado(`/api/dashboard/produccion/hoja.pdf?fecha=${fecha}${esAdmin && sedeId ? `&sedeId=${sedeId}` : ''}`, `hoja-produccion-${fecha}.pdf`)
    } catch (err) {
      setErrorAccion(mensajeDeError(err))
    } finally {
      setImprimiendo(false)
    }
  }

  const puedeMarcar = !esAdmin || !!sedeId
  const motivoNoPuede = 'Elige un local para marcar lo producido.'

  // Agrupa por área, en el orden que ya trae el plan.
  const grupos = []
  for (const l of plan?.lineas ?? []) {
    const nombre = nombreDeArea(l.area)
    const g = grupos.find((x) => x.nombre === nombre)
    if (g) g.lineas.push(l)
    else grupos.push({ nombre, lineas: [l] })
  }

  return (
    <section aria-labelledby="plan-titulo" className="mt-4">
      <div className="flex items-end justify-between gap-2">
        <h2 id="plan-titulo" className="text-lg font-bold tracking-tight">
          Plan del día
        </h2>
        {esAdmin && (
          <Link to="/plan-vitrina" className="flex h-10 items-center gap-1.5 rounded-xl border border-borde px-3 text-xs font-semibold text-gris">
            <Settings2 size={14} aria-hidden="true" />
            Plan de vitrina
          </Link>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {[
          { f: hoy, t: 'Hoy' },
          { f: manana, t: 'Mañana' },
        ].map((x) => (
          <button
            key={x.t}
            type="button"
            aria-pressed={fecha === x.f}
            onClick={() => setFecha(x.f)}
            className={`h-11 rounded-full px-4 text-sm font-semibold transition-colors ${fecha === x.f ? 'bg-acento-suave text-acento-oscuro' : 'bg-borde/60 text-gris'}`}
          >
            {x.t}
          </button>
        ))}
        <label className="sr-only" htmlFor="plan-fecha">
          Otra fecha
        </label>
        <input
          id="plan-fecha"
          type="date"
          value={fecha}
          onChange={(e) => e.target.value && setFecha(e.target.value)}
          className="h-11 rounded-full border border-borde bg-hueso px-3 text-sm outline-none focus:border-acento"
        />
        {esAdmin && (
          <select
            value={sedeId}
            onChange={(e) => setSedeId(e.target.value)}
            aria-label="Local"
            className="h-11 rounded-full border border-borde bg-hueso px-3 text-sm font-semibold outline-none focus:border-acento"
          >
            <option value="">Todos los locales</option>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        )}
      </div>

      <button
        type="button"
        onClick={imprimir}
        disabled={imprimiendo}
        className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-tinta text-sm font-semibold text-white disabled:opacity-50"
      >
        <FileText size={16} aria-hidden="true" />
        {imprimiendo ? 'Generando…' : 'Imprimir resumen de producción'}
      </button>

      {errorAccion && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {errorAccion}
        </p>
      )}
      {error && <ErrorCarga mensaje={error} />}
      {!plan && !error && <Cargando texto="Armando el plan…" />}

      {plan && (
        <div className="mt-3 space-y-3">
          {(plan.pagoPendiente > 0 || plan.sinAsignar > 0 || plan.combosSinDetalle > 0) && (
            <Tarjeta className="space-y-1 p-3 text-sm">
              {plan.pagoPendiente > 0 && (
                <p>
                  <span className="font-semibold">{plan.pagoPendiente}</span> pedido(s) esperando pago <span className="text-gris">— todavía no están en el plan.</span>
                </p>
              )}
              {plan.sinAsignar > 0 && (
                <p>
                  <span className="font-semibold">{plan.sinAsignar}</span> pedido(s) sin local <span className="text-gris">— nadie los tomó todavía («Me lo quedo» en Pedidos).</span>
                </p>
              )}
              {plan.combosSinDetalle > 0 && (
                <p>
                  <span className="font-semibold">{plan.combosSinDetalle}</span> combo(s) con cambios sin detalle <span className="text-gris">— revisa qué eligió el cliente.</span>
                </p>
              )}
            </Tarjeta>
          )}

          {plan.lineas.length === 0 ? (
            <Tarjeta className="text-center text-sm text-gris">
              Nada para producir {fecha === hoy ? 'hoy' : fecha === manana ? 'mañana' : `el ${fechaCorta(fecha)}`}: no hay pedidos ni plan de vitrina cargado.
            </Tarjeta>
          ) : (
            grupos.map((g) => (
              <div key={g.nombre}>
                <h3 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-gris">{g.nombre}</h3>
                <ul className="space-y-2">
                  {g.lineas.map((l) => (
                    <LineaPlan
                      key={l.clave}
                      linea={l}
                      puedeMarcar={puedeMarcar}
                      motivoNoPuede={motivoNoPuede}
                      onMarcar={marcar}
                      guardando={guardando === l.clave}
                    />
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  )
}

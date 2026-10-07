import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart3,
  ShoppingBag,
  Factory,
  Headset,
  ChevronRight,
  PackageX,
  Layers,
  MessageCircleWarning,
  Clock3,
  BadgeDollarSign,
} from 'lucide-react'
import {
  diaSemanaLegible,
  partesLima,
  sumarIngresos,
  variacionPorcentual,
  ventanasComparacion,
  ventasPorHora,
  antiguedadLegible,
} from '@bakebrothers/domain'
import { useAuth } from '../context/AuthContext'
import { useAlertas } from '../context/AlertasContext'
import { useAtencion } from '../hooks/useAtencion'
import { supabase } from '../lib/supabase'
import { traerTodo, useDatosVivos } from '../lib/datos'
import { duracionLegible, formatoPrecio, horaLegible, saludoSegunHora } from '../utils/formato'
import { Cargando, EncabezadoBloque, ErrorCarga, Kpi, Portada, Tarjeta } from '../components/bakeos/ui'
import GraficoArea, { etiquetaHora } from '../components/bakeos/GraficoArea'

const consultaPedidos = (desde, hasta) => () =>
  supabase
    .from('orders')
    .select('total, estado, creado_en')
    .gte('creado_en', desde.toISOString())
    .lte('creado_en', hasta.toISOString())
    .order('creado_en', { ascending: true })

// Datos del Resumen. Los KPIs del día salen de metricas_kpis (la función que ya
// existe, con la definición única de "ingreso"). La comparación contra la
// semana anterior NO puede usarla: metricas_kpis corta por día completo, no por
// hora. En vez de duplicar esa lógica en una segunda función SQL, los dos
// cortes (hoy hasta ahora / semana anterior hasta la misma hora de Lima) se
// suman con la MISMA definición de ingreso del dominio (`cuentaComoIngreso`,
// la lista que metricas_kpis ya replica) sobre los pedidos de esas ventanas.
async function cargarResumen(ahora) {
  const v = ventanasComparacion(ahora)
  const hoy = partesLima(ahora).fecha
  const [kpis, pedidosHoy, pedidosAnterior, enCurso] = await Promise.all([
    supabase.rpc('metricas_kpis', { p_desde: hoy, p_hasta: hoy, p_sede_id: null }).single(),
    traerTodo(consultaPedidos(v.hoy.desde, v.hoy.hasta)),
    traerTodo(consultaPedidos(v.semanaAnterior.desde, v.semanaAnterior.hasta)),
    traerTodo(() => supabase.from('orders').select('estado').in('estado', ['confirmed', 'paid', 'in_production'])),
  ])
  if (kpis.error) throw kpis.error
  return {
    kpis: kpis.data,
    pedidosHoy,
    pedidosAnterior,
    enProduccion: enCurso.filter((p) => p.estado === 'in_production').length,
    porIniciar: enCurso.filter((p) => p.estado !== 'in_production').length,
    ventanas: v,
  }
}

function seriePorHora(pedidosHoy, ahora) {
  const filas = ventasPorHora(pedidosHoy)
  const horaActual = partesLima(ahora).hora
  const inicio = Math.min(10, filas[0]?.hora ?? 10)
  const fin = Math.max(horaActual, filas.at(-1)?.hora ?? 0, inicio + 5)
  const porHora = new Map(filas.map((f) => [f.hora, f]))
  return Array.from({ length: Math.min(fin, 23) - inicio + 1 }, (_, i) => {
    const hora = inicio + i
    return { hora, ventas: porHora.get(hora)?.ventas ?? 0 }
  })
}

// Prioridades del día = las mismas alertas reales del Control Tower, en un orden
// fijo y explícito (lo que se entrega hoy primero) — sin puntajes.
function prioridades(alertas, ahora) {
  if (!alertas) return []
  const items = []
  if (alertas.paraHoySinEmpezar.length)
    items.push({
      icono: Clock3,
      titulo: `${alertas.paraHoySinEmpezar.length} pedido${alertas.paraHoySinEmpezar.length > 1 ? 's' : ''} para hoy sin empezar`,
      detalle: alertas.paraHoySinEmpezar
        .slice(0, 3)
        .map((p) => `${p.numero} · ${p.horario_entrega}`)
        .join(' · '),
      a: '/produccion',
      accion: 'Ir a producción',
    })
  if (alertas.escaladasSinAtender.length)
    items.push({
      icono: MessageCircleWarning,
      titulo: `${alertas.escaladasSinAtender.length} conversación${alertas.escaladasSinAtender.length > 1 ? 'es' : ''} esperando a una persona`,
      detalle: `La más antigua, ${antiguedadLegible(alertas.escaladasSinAtender[0].ultimo_mensaje_en, ahora)}`,
      a: '/conversaciones',
      accion: 'Atender',
    })
  if (alertas.pagadosSinEmpezar.length)
    items.push({
      icono: BadgeDollarSign,
      titulo: `${alertas.pagadosSinEmpezar.length} pedido${alertas.pagadosSinEmpezar.length > 1 ? 's' : ''} pagado${alertas.pagadosSinEmpezar.length > 1 ? 's' : ''} sin empezar`,
      detalle: `El más antiguo, ${antiguedadLegible(alertas.pagadosSinEmpezar[0].actualizado_en, ahora)}`,
      a: '/produccion',
      accion: 'Ir a producción',
    })
  if (alertas.combosPorRevisar.length)
    items.push({
      icono: Layers,
      titulo: `${alertas.combosPorRevisar.length} combo${alertas.combosPorRevisar.length > 1 ? 's' : ''} por revisar`,
      detalle: alertas.combosPorRevisar.slice(0, 3).map((p) => p.numero).join(' · '),
      a: '/pedidos',
      accion: 'Revisar',
    })
  if (alertas.agotados.length)
    items.push({
      icono: PackageX,
      titulo: `${alertas.agotados.length} producto${alertas.agotados.length > 1 ? 's' : ''} agotado${alertas.agotados.length > 1 ? 's' : ''}`,
      detalle: alertas.agotados
        .slice(0, 3)
        .map((s) => s.producto)
        .join(' · '),
      a: '/stock',
      accion: 'Ver stock',
    })
  return items
}

export default function Resumen() {
  const { perfil } = useAuth()
  const { alertas, ahora } = useAlertas()
  const { resumen: atencion } = useAtencion()
  const { datos, error } = useDatosVivos(() => cargarResumen(ahora), {
    tablas: ['orders'],
    deps: [ahora.getTime()],
  })

  const diaAnterior = datos ? diaSemanaLegible(datos.ventanas.fechaSemanaAnterior) : ''
  const horaCorte = horaLegible(ahora)
  const comparacion = useMemo(() => {
    if (!datos) return null
    const hoy = sumarIngresos(datos.pedidosHoy)
    const anterior = sumarIngresos(datos.pedidosAnterior)
    return { hoy, anterior, variacion: variacionPorcentual(hoy, anterior) }
  }, [datos])

  const serie = useMemo(() => (datos ? seriePorHora(datos.pedidosHoy, ahora) : []), [datos, ahora])
  const horaPico = useMemo(() => {
    const conVentas = serie.filter((p) => p.ventas > 0)
    return conVentas.length ? conVentas.reduce((a, b) => (b.ventas > a.ventas ? b : a)) : null
  }, [serie])

  const saludo = saludoSegunHora(ahora)
  const nombre = perfil?.nombre ?? (perfil?.rol === 'admin' ? null : `Equipo ${perfil?.sedeNombre ?? ''}`.trim())
  const titulo = nombre ? `${saludo}, ${nombre}` : saludo
  const lista = prioridades(alertas, ahora)

  const detalleVentas = !comparacion
    ? ''
    : comparacion.variacion === null
      ? `Sin ventas el ${diaAnterior} anterior hasta las ${horaCorte} para comparar`
      : `${comparacion.variacion >= 0 ? '+' : '−'}${Math.abs(comparacion.variacion).toFixed(1)}% vs. ${diaAnterior} anterior hasta las ${horaCorte}`

  return (
    <>
      <Portada
        titulo={titulo}
        subtitulo={`Aquí tienes el pulso de ${perfil?.rol === 'admin' ? 'Bake Brothers' : (perfil?.sedeNombre ?? 'tu sede')} para tomar decisiones rápidas.`}
      />

      {error && <ErrorCarga mensaje={error} />}
      {!datos && !error && <Cargando />}

      {datos && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Kpi
              icono={BarChart3}
              etiqueta="Ventas de hoy"
              valor={formatoPrecio(datos.kpis.ingresos ?? 0)}
              detalle={detalleVentas}
            />
            <Kpi
              icono={ShoppingBag}
              tono="lila"
              etiqueta="Pedidos"
              valor={Number(datos.kpis.pedidos ?? 0)}
              detalle={`Ticket promedio ${formatoPrecio(datos.kpis.ticket_promedio ?? 0)}`}
            />
            <Kpi
              icono={Factory}
              tono="verde"
              etiqueta="Producción"
              valor={datos.enProduccion}
              detalle={`en producción · ${datos.porIniciar} por iniciar`}
            />
            <Kpi
              icono={Headset}
              tono="azul"
              etiqueta="Atención"
              valor={duracionLegible(atencion?.humana.promedioSegundos ?? null)}
              detalle={
                atencion?.humana.muestras
                  ? 'Primera respuesta humana · 30 días'
                  : 'Aún sin respuestas humanas registradas'
              }
            />
          </div>

          <Tarjeta className="mt-4 p-4">
            <EncabezadoBloque
              etiqueta="Ventas por hora"
              titulo={
                horaPico
                  ? `La hora más fuerte hasta ahora: ${etiquetaHora(horaPico.hora)} (${formatoPrecio(horaPico.ventas)})`
                  : 'Aún no hay ventas hoy'
              }
            />
            <GraficoArea puntos={serie} alt="Ventas de hoy por hora, en soles" />
            <p className="mt-2 text-[11px] leading-snug text-gris">
              Hora de Lima, hasta las {horaCorte} La comparación con el {diaAnterior} anterior es hasta esa misma
              hora, no contra el día completo.
              {comparacion && comparacion.anterior > 0 && (
                <> El {diaAnterior} anterior, a esa hora, se habían vendido {formatoPrecio(comparacion.anterior)}.</>
              )}
            </p>
          </Tarjeta>
        </>
      )}

      <Tarjeta className="mt-4 p-4">
        <EncabezadoBloque
          etiqueta="Hoy"
          titulo="Prioridades del día"
          derecha={
            <Link to="/control-tower" className="shrink-0 text-xs font-semibold text-acento-oscuro">
              Ver todas
            </Link>
          }
        />
        {!alertas ? (
          <Cargando texto="Revisando pendientes…" />
        ) : lista.length === 0 ? (
          <p className="py-2 text-sm text-gris">Sin pendientes críticos: no hay excepciones activas ahora mismo.</p>
        ) : (
          <ul className="divide-y divide-borde">
            {lista.slice(0, 4).map((it) => (
              <li key={it.titulo}>
                <Link to={it.a} className="flex items-center gap-3 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-acento-suave text-acento-oscuro">
                    <it.icono size={17} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-snug">{it.titulo}</span>
                    {it.detalle && <span className="block text-xs leading-snug text-gris">{it.detalle}</span>}
                  </span>
                  <span className="hidden shrink-0 rounded-full bg-acento-suave px-2.5 py-1 text-[11px] font-bold text-acento-oscuro sm:inline">
                    {it.accion}
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-gris" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </>
  )
}

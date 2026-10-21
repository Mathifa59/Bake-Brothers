import { Link } from 'react-router-dom'
import { ChevronRight, PackageX, Layers, MessageCircleWarning, BadgeDollarSign } from 'lucide-react'
import { antiguedadLegible } from '@bakebrothers/domain'
import { useAlertas } from '../context/AlertasContext'
import { Cargando, ErrorCarga, Hero, Pill, Portada, Tarjeta, EncabezadoBloque } from '../components/bakeos/ui'

const nombreCanal = { whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram' }

function Fila({ icono: Icono, titulo, detalle, a, accion }) {
  return (
    <li>
      <Link to={a} className="flex items-center gap-3 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-acento-suave text-acento-oscuro">
          <Icono size={17} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-snug">{titulo}</span>
          <span className="block text-xs leading-snug text-gris">{detalle}</span>
        </span>
        <span className="shrink-0 text-xs font-semibold text-acento-oscuro">{accion}</span>
        <ChevronRight size={16} className="shrink-0 text-gris" aria-hidden="true" />
      </Link>
    </li>
  )
}

/**
 * Control Tower: SOLO alertas reales, cada una con su dato y su antigüedad.
 * El prototipo mostraba una "salud operativa 86/100" — acá no hay ningún
 * puntaje: no existe una fórmula real que lo respalde, y un número inventado
 * es peor que ninguno.
 */
export default function ControlTower() {
  const { alertas, error, ahora } = useAlertas()

  return (
    <>
      <Portada titulo="Control Tower" subtitulo="Alertas y bloqueos" />

      <Hero className="mt-5">
        <Pill tono="prioridad">Control Tower</Pill>
        <h2 className="mt-4 text-xl font-semibold leading-snug">
          Lo que puede bloquear el día, antes de que bloquee el día.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-white/70">
          Excepciones reales, tomadas de los pedidos, el stock y las conversaciones de ahora mismo.
        </p>
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-widest text-white/60">Excepciones activas</p>
        <p className="mt-1 text-5xl font-bold leading-none">{alertas ? alertas.total : '—'}</p>
      </Hero>

      {error && <ErrorCarga mensaje={error} />}
      {!alertas && !error && <Cargando texto="Revisando…" />}

      {alertas && (
        <Tarjeta className="mt-4 p-4">
          <EncabezadoBloque
            etiqueta="Excepciones activas"
            titulo={
              alertas.total === 0
                ? 'Todo en orden: no hay excepciones activas'
                : `${alertas.total} cosa${alertas.total > 1 ? 's' : ''} requiere${alertas.total > 1 ? 'n' : ''} atención`
            }
            derecha={alertas.total > 0 ? <Pill tono="prioridad">Prioridad alta</Pill> : <Pill tono="ok">Normal</Pill>}
          />
          <ul className="divide-y divide-borde">
            {alertas.escaladasSinAtender.map((c) => (
              <Fila
                key={c.id}
                icono={MessageCircleWarning}
                titulo={`Conversación escalada sin atender · ${nombreCanal[c.canal] ?? c.canal}`}
                detalle={`Último mensaje ${antiguedadLegible(c.ultimo_mensaje_en, ahora)}${c.sede ? ` · ${c.sede}` : ''}`}
                a="/conversaciones"
                accion="Atender"
              />
            ))}
            {alertas.pagadosSinEmpezar.map((p) => (
              <Fila
                key={`pagado-${p.numero}`}
                icono={BadgeDollarSign}
                titulo={`Pedido ${p.numero} pagado, sin empezar`}
                detalle={`Pagado ${antiguedadLegible(p.actualizado_en, ahora)} · entrega ${p.fecha_entrega} ${p.horario_entrega}${p.cliente ? ` · ${p.cliente}` : ''}`}
                a="/produccion"
                accion="Iniciar"
              />
            ))}
            {alertas.combosPorRevisar.map((p) => (
              <Fila
                key={`combo-${p.numero}`}
                icono={Layers}
                titulo={`Combo por revisar en ${p.numero}`}
                detalle={`El bot vendió un combo con sustitución — confirmar antes de preparar · entrega ${p.fecha_entrega} ${p.horario_entrega}`}
                a="/pedidos"
                accion="Abrir pedido"
              />
            ))}
            {alertas.agotados.map((s) => (
              <Fila
                key={s.id}
                icono={PackageX}
                titulo={`Agotado: ${s.producto}${s.tamano ? ` (${s.tamano})` : ''}`}
                detalle={`Marcado como agotado${s.sede ? ` en ${s.sede}` : ''}`}
                a="/stock"
                accion="Ver stock"
              />
            ))}
          </ul>
        </Tarjeta>
      )}
    </>
  )
}

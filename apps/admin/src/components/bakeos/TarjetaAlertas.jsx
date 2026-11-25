import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeDollarSign, ChevronRight, Clock3, Layers, MessageCircleWarning, PackageX } from 'lucide-react'
import { antiguedadLegible } from '@bakebrothers/domain'
import { Cargando, EncabezadoBloque, ErrorCarga, Pill, Tarjeta } from './ui'

const nombreCanal = { whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram' }

// Los agotados pueden ser muchos: se ven los primeros y el resto se abre con un toque (nada se oculta del todo).
const AGOTADOS_VISIBLES = 5

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
 * Alertas del día, arriba del Resumen: SOLO excepciones reales, cada una con su dato y su antigüedad (nada de puntajes:
 * no hay una fórmula real que los respalde). Antes vivían en la pantalla «Control Tower»; el contador del menú está en
 * «Resumen». Las alertas salen de AlertasContext (una sola carga compartida con el menú y los avisos).
 */
export default function TarjetaAlertas({ alertas, error, ahora }) {
  const [verTodosLosAgotados, setVerTodosLosAgotados] = useState(false)

  if (error) return <ErrorCarga mensaje={error} />
  if (!alertas) {
    return (
      <Tarjeta className="mt-4 p-4">
        <Cargando texto="Revisando pendientes…" />
      </Tarjeta>
    )
  }

  const paraHoy = alertas.paraHoySinEmpezar
  const hay = alertas.total > 0 || paraHoy.length > 0
  const agotados = verTodosLosAgotados ? alertas.agotados : alertas.agotados.slice(0, AGOTADOS_VISIBLES)
  const titulo = !hay
    ? 'Todo en orden: no hay excepciones activas'
    : alertas.total > 0
      ? `${alertas.total} cosa${alertas.total > 1 ? 's' : ''} requiere${alertas.total > 1 ? 'n' : ''} atención`
      : 'Hay pedidos para hoy por empezar'

  return (
    <Tarjeta id="alertas" className="mt-4 p-4">
      <EncabezadoBloque
        etiqueta="Hoy · prioridades"
        titulo={titulo}
        derecha={hay ? <Pill tono="prioridad">Prioridad alta</Pill> : <Pill tono="ok">Normal</Pill>}
      />
      {hay && (
        <ul className="divide-y divide-borde">
          {paraHoy.length > 0 && (
            <Fila
              icono={Clock3}
              titulo={`${paraHoy.length} pedido${paraHoy.length > 1 ? 's' : ''} para hoy sin empezar`}
              detalle={paraHoy
                .slice(0, 3)
                .map((p) => `${p.numero} · ${p.horario_entrega}`)
                .join(' · ')}
              a="/produccion"
              accion="Ir a producción"
            />
          )}
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
          {alertas.pagosPorConfirmar.map((p) => (
            <Fila
              key={`pago-${p.numero}`}
              icono={BadgeDollarSign}
              titulo={`Pago por confirmar en ${p.numero}`}
              detalle={`El cliente mandó la captura de su pago · confirmar o rechazar${p.cliente ? ` · ${p.cliente}` : ''}${p.sede ? ` · ${p.sede}` : ' · sin sede'}`}
              a="/pedidos"
              accion="Revisar pago"
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
          {agotados.map((s) => (
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
      )}
      {alertas.agotados.length > AGOTADOS_VISIBLES && (
        <button
          type="button"
          onClick={() => setVerTodosLosAgotados((v) => !v)}
          aria-expanded={verTodosLosAgotados}
          className="mt-2 min-h-11 w-full rounded-xl border border-borde bg-hueso px-3 text-sm font-semibold"
        >
          {verTodosLosAgotados ? 'Ver menos agotados' : `Ver los ${alertas.agotados.length} agotados`}
        </button>
      )}
    </Tarjeta>
  )
}

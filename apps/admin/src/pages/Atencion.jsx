import { Bot, Info, UserRound } from 'lucide-react'
import { DIAS_ATENCION, useAtencion } from '../hooks/useAtencion'
import { duracionLegible } from '../utils/formato'
import { Cargando, EncabezadoBloque, ErrorCarga, Kpi, Portada, Tarjeta } from '../components/bakeos/ui'

const nombreCanal = { whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram' }
const nombreEstado = {
  activa: 'Con el bot',
  escalada: 'Esperando persona',
  atendida_por_operador: 'Atendida por el equipo',
  cerrada: 'Cerrada',
}

export default function Atencion() {
  const { resumen, filas, error, cargando } = useAtencion()

  return (
    <>
      <Portada titulo="Atención" subtitulo={`Tiempo de primera respuesta · últimos ${DIAS_ATENCION} días`} />

      {/* Aviso explícito: la métrica humana todavía no ve lo que el equipo
          responde desde el celular (Coexistence). Si se omitiera, el promedio
          parecería más lento o más vacío de lo que es. */}
      <div role="note" className="mt-5 flex gap-3 rounded-2xl border border-borde bg-lila-suave/60 p-4 text-sm leading-relaxed">
        <Info size={18} className="mt-0.5 shrink-0 text-lila" aria-hidden="true" />
        <p>
          <span className="font-semibold">La métrica humana aún no cuenta las respuestas desde el celular.</span> Solo
          mide lo que el equipo responde desde este panel. Cuando el WhatsApp de cada local esté conectado en modo
          Coexistence, esas respuestas también quedarán registradas y se sumarán aquí.
        </p>
      </div>

      {error && <ErrorCarga mensaje={error} />}
      {cargando && <Cargando />}

      {resumen && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Kpi
              icono={UserRound}
              tono="azul"
              etiqueta="Respuesta humana"
              valor={duracionLegible(resumen.humana.promedioSegundos)}
              detalle={
                resumen.humana.muestras
                  ? `Promedio en ${resumen.humana.muestras} conversación${resumen.humana.muestras > 1 ? 'es' : ''}`
                  : 'Sin respuestas humanas registradas'
              }
            />
            <Kpi
              icono={Bot}
              tono="lila"
              etiqueta="Respuesta del bot"
              valor={duracionLegible(resumen.bot.promedioSegundos)}
              detalle={
                resumen.bot.muestras
                  ? `Promedio en ${resumen.bot.muestras} conversación${resumen.bot.muestras > 1 ? 'es' : ''}`
                  : 'Sin respuestas del bot registradas'
              }
            />
          </div>

          <Tarjeta className="mt-4 p-4">
            <EncabezadoBloque etiqueta="Cómo se mide" />
            <ul className="space-y-1.5 text-xs leading-relaxed text-gris">
              <li>
                <span className="font-semibold text-tinta">Bot:</span> desde el primer mensaje del cliente hasta la
                primera respuesta del bot.
              </li>
              <li>
                <span className="font-semibold text-tinta">Humana:</span> desde que el bot derivó la conversación hasta
                la primera respuesta de una persona (si el bot no intervino, desde el primer mensaje del cliente).
              </li>
              <li>Cada conversación cuenta una sola vez. Se leen {resumen.conversaciones} conversaciones de los últimos {DIAS_ATENCION} días.</li>
            </ul>
          </Tarjeta>

          <Tarjeta className="mt-4 p-4">
            <EncabezadoBloque etiqueta="Conversaciones recientes" titulo="Detalle por conversación" />
            {filas.length === 0 ? (
              <p className="text-sm text-gris">No hay conversaciones en este período.</p>
            ) : (
              <ul className="divide-y divide-borde">
                {filas.slice(0, 15).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {nombreCanal[c.canal] ?? c.canal}
                        {c.sedes?.nombre ? ` · ${c.sedes.nombre}` : ''}
                      </p>
                      <p className="text-xs text-gris">{nombreEstado[c.estado] ?? c.estado}</p>
                    </div>
                    <div className="shrink-0 text-right text-xs text-gris">
                      <p>
                        Bot <span className="font-semibold text-tinta">{duracionLegible(c.tiempos.botSegundos)}</span>
                      </p>
                      <p>
                        Humana <span className="font-semibold text-tinta">{duracionLegible(c.tiempos.humanaSegundos)}</span>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </>
      )}
    </>
  )
}

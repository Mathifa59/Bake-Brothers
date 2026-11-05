import { Search } from 'lucide-react'
import { Pill } from '../bakeos/ui'
import {
  ESTADOS_BANDEJA,
  FILTROS_BANDEJA,
  haceCuanto,
  mensajesSinResponder,
  motivoDeConversacion,
  nombreDeConversacion,
  ultimoMensaje,
} from '../../utils/conversaciones'

/** Lista de la bandeja: filtros, local, buscador y una fila por conversación (lo que espera una persona, primero). */
export default function ListaConversaciones({
  conversaciones,
  todas,
  clientes,
  ahora,
  seleccionadoId,
  onSeleccionar,
  filtro,
  onFiltro,
  sedes,
  filtroSede,
  onFiltroSede,
  busqueda,
  onBusqueda,
}) {
  const cuenta = (f) => todas.filter(f.cumple).length
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Filtro de conversaciones" className="flex gap-1.5 overflow-x-auto sin-barra-scroll">
        {FILTROS_BANDEJA.map((f) => (
          <button
            key={f.clave}
            role="tab"
            aria-selected={filtro === f.clave}
            onClick={() => onFiltro(f.clave)}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors ${
              filtro === f.clave ? 'bg-tinta text-white' : 'border border-borde bg-hueso text-tinta'
            }`}
          >
            {f.etiqueta} <span className="opacity-70">{cuenta(f)}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Buscar conversación</span>
          <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-gris" />
          <input
            value={busqueda}
            onChange={(e) => onBusqueda(e.target.value)}
            placeholder="Buscar nombre, teléfono o mensaje"
            className="min-h-11 w-full rounded-xl border border-borde bg-hueso pl-9 pr-3 text-sm outline-none focus:border-acento"
          />
        </label>
        {sedes.length > 1 || sedes.length === 1 ? (
          <select
            value={filtroSede}
            onChange={(e) => onFiltroSede(e.target.value)}
            aria-label="Filtrar por local"
            className="min-h-11 rounded-xl border border-borde bg-hueso px-3 text-sm font-semibold outline-none focus:border-acento sm:w-auto"
          >
            <option value="">Todos los locales</option>
            <option value="sin">Sin local</option>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {conversaciones.length === 0 ? (
        <p className="rounded-2xl border border-borde bg-hueso p-6 text-center text-sm text-gris">
          {todas.length === 0 ? 'Todavía no hay conversaciones.' : 'No hay conversaciones con ese filtro.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {conversaciones.map((c) => {
            const estado = ESTADOS_BANDEJA[c.estado] ?? ESTADOS_BANDEJA.activa
            const ultimo = ultimoMensaje(c)
            const sinLeer = mensajesSinResponder(c)
            const motivo = motivoDeConversacion(c)
            return (
              <li key={c.id}>
                <button
                  onClick={() => onSeleccionar(c.id)}
                  aria-current={seleccionadoId === c.id ? 'true' : undefined}
                  className={`flex min-h-[72px] w-full flex-col gap-1.5 rounded-2xl border p-3.5 text-left transition-colors ${
                    seleccionadoId === c.id ? 'border-acento bg-acento-suave' : 'border-borde bg-hueso hover:bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-[15px] font-semibold">{nombreDeConversacion(c, clientes)}</span>
                    <span className="shrink-0 text-xs text-gris">{haceCuanto(c.ultimo_mensaje_en, ahora)}</span>
                  </div>
                  <p className="line-clamp-1 text-sm text-gris">
                    {ultimo ? `${ultimo.rol === 'cliente' ? '' : ultimo.rol === 'bot' ? 'Bot: ' : `${ultimo.autor ?? 'Equipo'}: `}${ultimo.texto}` : 'Sin mensajes todavía'}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Pill tono={estado.tono}>{estado.texto}</Pill>
                    {motivo && <Pill tono="neutro">{motivo.etiqueta}</Pill>}
                    <Pill tono="neutro">{c.sedes?.nombre ?? 'Sin local'}</Pill>
                    {sinLeer > 0 && (
                      <span
                        aria-label={`${sinLeer} mensajes sin responder`}
                        className="ml-auto grid min-w-[22px] place-items-center rounded-full bg-acento-oscuro px-1.5 text-[11px] font-bold leading-[22px] text-white"
                      >
                        {sinLeer}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

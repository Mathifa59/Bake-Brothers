import { useMemo, useState } from 'react'
import { Bell, ChevronRight, Star, UserPlus } from 'lucide-react'
import { NOMBRE_DE_PERFIL } from '@bakebrothers/domain'
import { useAuth } from '../context/AuthContext'
import { useEquipo, useSedes } from '../hooks/useEquipo'
import { haceCuanto, mensajeDeErrorEquipo } from '../utils/equipo'
import { Cargando, ErrorCarga, Pill, Portada, Tarjeta } from '../components/bakeos/ui'
import HojaCrear from '../components/equipo/HojaCrear'
import HojaCuenta from '../components/equipo/HojaCuenta'
import Historial from '../components/equipo/Historial'

/**
 * Equipo (solo Administración): todas las cuentas del panel, con su perfil, local, avisos y estado. Se crean con
 * usuario y contraseña definidos aquí (sin correos de invitación), se editan, se desactivan y se reactivan; nunca se
 * borran. Cada cambio queda en el historial. Ver docs/perfiles-equipo.md.
 */
export default function Equipo() {
  const { session } = useAuth()
  const { cuentas, authDisponible, cargando, error, recargar } = useEquipo()
  const sedes = useSedes()
  const [pestana, setPestana] = useState('cuentas')
  const [creando, setCreando] = useState(false)
  const [abiertaId, setAbiertaId] = useState(null)

  const abierta = useMemo(() => cuentas.find((c) => c.id === abiertaId) ?? null, [cuentas, abiertaId])
  const activas = cuentas.filter((c) => c.activo)
  const inactivas = cuentas.filter((c) => !c.activo)

  return (
    <div className="pb-10">
      <Portada titulo="Equipo" subtitulo="Las cuentas de quienes usan Bake OS: qué ven, en qué local y qué avisos reciben." accion={false}>
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tinta px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <UserPlus size={16} aria-hidden="true" />
          Nueva cuenta
        </button>
      </Portada>

      <div className="mt-5 grid grid-cols-2 gap-1.5 rounded-xl bg-borde/60 p-1" role="tablist" aria-label="Equipo">
        {[
          ['cuentas', `Cuentas${cuentas.length ? ` (${cuentas.length})` : ''}`],
          ['historial', 'Historial'],
        ].map(([id, texto]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={pestana === id}
            onClick={() => setPestana(id)}
            className={`min-h-11 rounded-lg text-sm font-semibold transition-colors ${pestana === id ? 'bg-hueso shadow-sm' : 'text-gris'}`}
          >
            {texto}
          </button>
        ))}
      </div>

      {pestana === 'historial' ? (
        <div className="mt-4">
          <Historial sedes={sedes} />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {!authDisponible && !cargando && !error && (
            <p role="status" className="rounded-xl bg-acento-suave px-3.5 py-3 text-sm text-acento-oscuro">
              Falta la llave de Supabase en el servidor (<code>SUPABASE_SERVICE_ROLE_KEY</code>). Se ven las cuentas, pero no su correo ni su último ingreso, y no se pueden crear ni cambiar.
            </p>
          )}
          {cargando && <Cargando texto="Leyendo las cuentas…" />}
          {error && <ErrorCarga mensaje={mensajeDeErrorEquipo(error)} />}
          {!cargando && !error && cuentas.length === 0 && <p className="py-8 text-center text-sm text-gris">Todavía no hay cuentas.</p>}

          <ul className="flex flex-col gap-3">
            {activas.map((c) => (
              <TarjetaCuenta key={c.id} cuenta={c} esYo={c.id === session?.user?.id} onAbrir={() => setAbiertaId(c.id)} />
            ))}
          </ul>

          {inactivas.length > 0 && (
            <>
              <h2 className="pt-3 text-[10.5px] font-bold uppercase tracking-wide text-gris">Desactivadas ({inactivas.length})</h2>
              <ul className="flex flex-col gap-3">
                {inactivas.map((c) => (
                  <TarjetaCuenta key={c.id} cuenta={c} esYo={false} onAbrir={() => setAbiertaId(c.id)} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {creando && <HojaCrear sedes={sedes} onCerrar={() => setCreando(false)} onCreada={recargar} />}
      {abierta && (
        <HojaCuenta
          key={abierta.id}
          cuenta={abierta}
          sedes={sedes}
          esYo={abierta.id === session?.user?.id}
          onCerrar={() => setAbiertaId(null)}
          onCambio={recargar}
        />
      )}
    </div>
  )
}

function TarjetaCuenta({ cuenta, esYo, onAbrir }) {
  const entra = cuenta.usuario ?? cuenta.correo
  const ultimo = cuenta.ultimoIngreso ? `Último ingreso ${haceCuanto(cuenta.ultimoIngreso)}` : 'Todavía no ha entrado'
  return (
    <li>
      <button type="button" onClick={onAbrir} className="block w-full text-left">
        <Tarjeta className={`flex items-center gap-3 transition-colors hover:border-acento ${cuenta.activo ? '' : 'opacity-70'}`}>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="truncate text-[15px] font-bold">{cuenta.nombre ?? entra ?? 'Sin nombre'}</p>
              {esYo && <Pill>Tú</Pill>}
              <Pill tono={cuenta.activo ? 'ok' : 'prioridad'}>{cuenta.activo ? 'Activa' : 'Desactivada'}</Pill>
            </div>
            {entra && cuenta.nombre && <p className="mt-0.5 truncate text-xs text-gris">{entra}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {cuenta.perfiles.map((p) => (
                <Pill key={p} tono={p === 'administracion' ? 'lila' : 'neutro'}>
                  {NOMBRE_DE_PERFIL[p] ?? p}
                </Pill>
              ))}
              {cuenta.sedeNombre && <Pill>{cuenta.sedeNombre}</Pill>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gris">
              {cuenta.esEncargado && (
                <span className="inline-flex items-center gap-1">
                  <Star size={12} aria-hidden="true" /> Encargado
                </span>
              )}
              {(cuenta.avisaOrdenes || cuenta.avisaPagos) && (
                <span className="inline-flex items-center gap-1">
                  <Bell size={12} aria-hidden="true" />
                  {[cuenta.avisaOrdenes && 'órdenes', cuenta.avisaPagos && 'pagos'].filter(Boolean).join(' y ')}
                </span>
              )}
              <span>{ultimo}</span>
            </div>
          </div>
          <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-gris" />
        </Tarjeta>
      </button>
    </li>
  )
}

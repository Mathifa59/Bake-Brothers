import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BellRing, MessageCircle, UserRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useAlertas } from '../context/AlertasContext'
import { useAvisos } from '../context/AvisosContext'
import { useAhora } from '../lib/datos'
import { haceCuanto } from '../utils/conversaciones'
import { Cargando, ErrorCarga, Pill, Portada, Tarjeta } from '../components/bakeos/ui'
import AvisosCelular from '../components/bakeos/AvisosCelular'

/** Centro de avisos (la campana): lo que entró y una persona tiene que atender, lo más nuevo arriba. */
export default function Avisos() {
  const { perfil } = useAuth()
  const { alertas } = useAlertas()
  const { avisos, error, marcarVistos, vistosAlEntrar, sinVer } = useAvisos()
  const ahora = useAhora(30_000)
  const navigate = useNavigate()

  // Al abrir el centro, lo que había se da por visto (se sigue resaltando lo que era nuevo al entrar).
  useEffect(() => {
    if (!avisos || sinVer === 0) return
    const t = setTimeout(marcarVistos, 1500)
    return () => clearTimeout(t)
  }, [avisos, sinVer, marcarVistos])

  const esNuevo = (a) => vistosAlEntrar.current && new Date(a.creado_en) > new Date(vistosAlEntrar.current)
  const totalAlertas = alertas?.total ?? 0

  return (
    <>
      <Portada titulo="Avisos" subtitulo="Lo que entró y espera a una persona" accion={false} />
      <div className="space-y-3 py-4 pb-10">
        <AvisosCelular compacto />

        {perfil?.rol === 'admin' && totalAlertas > 0 && (
          <Tarjeta className="flex items-center justify-between gap-3 p-3">
            <p className="text-sm">
              <span className="font-semibold">{totalAlertas}</span> alerta{totalAlertas > 1 ? 's' : ''} del día
              <span className="text-gris"> en el Control Tower.</span>
            </p>
            <Link to="/control-tower" className="shrink-0 text-xs font-bold text-acento-oscuro">
              Ver alertas
            </Link>
          </Tarjeta>
        )}

        {error && <ErrorCarga mensaje={`No se pudieron cargar los avisos: ${error}`} />}
        {!avisos && !error && <Cargando texto="Cargando avisos…" />}
        {avisos && avisos.length === 0 && (
          <Tarjeta className="text-center text-sm text-gris">Todavía no hay avisos. Cuando entre un mensaje que espere a una persona, aparece aquí.</Tarjeta>
        )}
        {avisos && avisos.length > 0 && (
          <ul className="space-y-2">
            {avisos.map((a) => {
              const Icono = a.tipo === 'esperando_persona' ? UserRound : MessageCircle
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => navigate(a.conversacion_id ? `/conversaciones?c=${a.conversacion_id}` : '/conversaciones')}
                    className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors ${
                      esNuevo(a) ? 'border-acento bg-acento-suave' : 'border-borde bg-hueso'
                    }`}
                  >
                    <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${a.tipo === 'esperando_persona' ? 'bg-acento-suave text-acento-oscuro' : 'bg-lila-suave text-lila'}`}>
                      <Icono size={18} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-[15px] font-semibold leading-snug">{a.titulo}</span>
                        <span className="shrink-0 text-xs text-gris">{haceCuanto(a.creado_en, ahora)}</span>
                      </span>
                      <span className="mt-0.5 block text-sm text-gris">{a.cuerpo}</span>
                      {esNuevo(a) && <Pill tono="prioridad" className="mt-2">Nuevo</Pill>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {avisos && avisos.length >= 40 && <p className="text-center text-xs text-gris">Se muestran los 40 más recientes.</p>}
        <p className="flex items-center justify-center gap-1.5 pt-2 text-xs text-gris">
          <BellRing size={13} aria-hidden="true" /> Con el panel instalado y los avisos activados, también te llegan con el celular bloqueado.
        </p>
      </div>
    </>
  )
}

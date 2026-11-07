import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, Users } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useConfiguracionBot } from '../../hooks/useConfiguracionBot'
import { Tarjeta } from './ui'

/**
 * Interruptor «Bot activo / apagado» (solo dirección lo cambia). Apagado, los mensajes de WhatsApp van directo a
 * Conversaciones como «esperando persona» y el bot no responde nada: los atiende el equipo desde el panel.
 */
export function InterruptorBot({ configuracion }) {
  const { perfil } = useAuth()
  const esAdmin = perfil?.rol === 'admin'
  const { config, guardar } = configuracion
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const activo = config?.bot_activo === true

  const cambiar = async () => {
    if (!esAdmin || guardando || !config) return
    // Encender el bot es lo delicado (vuelve a responder solo y a usar Claude): se confirma.
    if (!activo && !window.confirm('¿Encender el bot? Empezará a responder solo los mensajes de WhatsApp (usa Claude).')) return
    setGuardando(true)
    setError(await guardar({ bot_activo: !activo }))
    setGuardando(false)
  }

  return (
    <Tarjeta className="space-y-3">
      <div className="flex items-center gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${activo ? 'bg-ok-suave text-ok' : 'bg-borde/70 text-gris'}`}>
          {activo ? <Bot size={20} aria-hidden="true" /> : <Users size={20} aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold">{activo ? 'Bot activo' : 'Bot apagado'}</p>
          <p className="text-xs text-gris">
            {activo
              ? 'El bot responde solo y pasa al equipo lo que no puede resolver.'
              : 'Los mensajes de WhatsApp llegan a Conversaciones y los responde el equipo.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={activo}
          aria-label="Bot de WhatsApp"
          disabled={!esAdmin || guardando || !config}
          onClick={cambiar}
          className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-60 ${activo ? 'bg-ok' : 'bg-gris/50'}`}
        >
          <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${activo ? 'left-7' : 'left-1'}`} />
        </button>
      </div>
      {!esAdmin && <p className="text-xs text-gris">Solo dirección puede cambiarlo.</p>}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </Tarjeta>
  )
}

/** Franja de aviso arriba de Conversaciones cuando el bot está apagado (para que el equipo sepa que nadie responde solo). */
export function AvisoBotApagado() {
  const { perfil } = useAuth()
  const { config } = useConfiguracionBot()
  if (!config || config.bot_activo) return null
  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-borde bg-acento-suave px-3.5 py-3 text-sm">
      <p className="text-acento-oscuro">
        <span className="font-bold">Bot apagado:</span> cada mensaje lo responde una persona del equipo.
      </p>
      {perfil?.rol === 'admin' && (
        <Link to="/ajustes" className="shrink-0 text-xs font-bold text-acento-oscuro underline">
          Ajustes
        </Link>
      )}
    </div>
  )
}

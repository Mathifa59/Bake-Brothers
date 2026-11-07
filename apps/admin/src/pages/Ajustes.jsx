import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useConfiguracionBot } from '../hooks/useConfiguracionBot'
import { InterruptorBot } from '../components/bakeos/InterruptorBot'
import { Cargando, ErrorCarga, Portada, Tarjeta } from '../components/bakeos/ui'
import AvisosCelular, { InstalarPanel } from '../components/bakeos/AvisosCelular'

const MAX_BIENVENIDA = 1000

function Bienvenida({ configuracion }) {
  const { perfil } = useAuth()
  const esAdmin = perfil?.rol === 'admin'
  const { config, guardar } = configuracion
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState(null)

  useEffect(() => {
    if (config) setTexto(config.mensaje_bienvenida)
  }, [config])

  if (!config) return null
  const activa = config.bienvenida_activa === true
  const cambiado = texto.trim() !== config.mensaje_bienvenida
  const valido = texto.trim().length > 0 && texto.length <= MAX_BIENVENIDA

  const aplicar = async (cambios) => {
    setGuardando(true)
    const error = await guardar(cambios)
    setMensaje(error ? { tipo: 'error', texto: error } : { tipo: 'ok', texto: 'Guardado.' })
    setGuardando(false)
  }

  return (
    <Tarjeta className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold">Mensaje de bienvenida automático</p>
          <p className="text-xs text-gris">
            Con el bot apagado, se manda este texto fijo (sin IA) al primer mensaje de cada cliente, una vez cada 12 horas.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={activa}
          aria-label="Mensaje de bienvenida automático"
          disabled={!esAdmin || guardando}
          onClick={() => aplicar({ bienvenida_activa: !activa })}
          className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-60 ${activa ? 'bg-ok' : 'bg-gris/50'}`}
        >
          <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${activa ? 'left-7' : 'left-1'}`} />
        </button>
      </div>
      <label className="block text-sm font-semibold" htmlFor="texto-bienvenida">
        Texto
      </label>
      <textarea
        id="texto-bienvenida"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value)
          setMensaje(null)
        }}
        readOnly={!esAdmin}
        rows={4}
        maxLength={MAX_BIENVENIDA}
        className="w-full rounded-xl border border-borde bg-hueso p-3 text-base outline-none focus:border-acento"
      />
      {esAdmin && (
        <button
          type="button"
          disabled={!cambiado || !valido || guardando}
          onClick={() => aplicar({ mensaje_bienvenida: texto.trim() })}
          className="h-12 w-full rounded-xl bg-tinta text-base font-semibold text-white transition-opacity disabled:opacity-40"
        >
          {guardando ? 'Guardando…' : 'Guardar texto'}
        </button>
      )}
      {mensaje && (
        <p role={mensaje.tipo === 'error' ? 'alert' : 'status'} className={`text-sm ${mensaje.tipo === 'error' ? 'text-red-700' : 'font-semibold text-ok'}`}>
          {mensaje.texto}
        </p>
      )}
    </Tarjeta>
  )
}

/** Ajustes del panel: el interruptor del bot y su mensaje de bienvenida (dirección); los avisos del celular, para todos. */
export default function Ajustes() {
  const configuracion = useConfiguracionBot()
  return (
    <>
      <Portada titulo="Ajustes" subtitulo="Bot de WhatsApp y avisos" accion={false} />
      <div className="space-y-4 py-4 pb-10">
        {configuracion.error && !configuracion.config && (
          <ErrorCarga mensaje={`No se pudo leer la configuración del bot: ${configuracion.error}`} />
        )}
        {configuracion.cargando && <Cargando texto="Cargando…" />}
        {configuracion.config && (
          <>
            <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-gris">Bot de WhatsApp</h2>
            <InterruptorBot configuracion={configuracion} />
            <Bienvenida configuracion={configuracion} />
          </>
        )}
        <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-gris">Avisos en este celular</h2>
        <AvisosCelular />
        <InstalarPanel />
      </div>
    </>
  )
}

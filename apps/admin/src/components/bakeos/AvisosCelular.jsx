import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, BellOff, Download, Share, SquarePlus } from 'lucide-react'
import { activarPush, alCambiarInstalacion, desactivarPush, estadoPush, estaInstalado, esIOS, instalarPanel, puedeInstalarDirecto } from '../../lib/push'
import { probarPush } from '../../lib/apiClient'
import { Tarjeta } from './ui'

const MENSAJES_ERROR = {
  PUSH_NO_CONFIGURADO: 'Los avisos al celular todavía no están configurados en el servidor. Avísale a quien administra el sistema.',
  SIN_DISPOSITIVOS: 'Este celular todavía no tiene los avisos activados.',
}
const mensajeDe = (err) => MENSAJES_ERROR[err?.codigo] ?? err?.message ?? 'No se pudo completar la acción.'

function useEstadoPush() {
  const [estado, setEstado] = useState(null)
  const refrescar = useCallback(() => estadoPush().then(setEstado).catch(() => setEstado('no-soportado')), [])
  useEffect(() => {
    refrescar()
    document.addEventListener('visibilitychange', refrescar)
    return () => document.removeEventListener('visibilitychange', refrescar)
  }, [refrescar])
  return [estado, refrescar]
}

/**
 * Los avisos al celular (notificaciones push) de ESTA persona en ESTE dispositivo. `compacto` = la franja corta que se
 * muestra arriba del centro de avisos solo cuando falta activarlos; sin `compacto`, la tarjeta completa de Ajustes.
 */
export default function AvisosCelular({ compacto = false }) {
  const [estado, refrescar] = useEstadoPush()
  const [trabajando, setTrabajando] = useState(false)
  const [mensaje, setMensaje] = useState(null)

  const ejecutar = async (accion, exito) => {
    setTrabajando(true)
    setMensaje(null)
    try {
      await accion()
      if (exito) setMensaje({ tipo: 'ok', texto: exito })
    } catch (err) {
      setMensaje({ tipo: 'error', texto: mensajeDe(err) })
    } finally {
      setTrabajando(false)
      refrescar()
    }
  }

  if (!estado) return null
  if (compacto && (estado === 'activo' || estado === 'no-soportado')) return null

  const activar = () => ejecutar(activarPush, 'Listo: los avisos están activados en este celular.')

  if (compacto) {
    return (
      <Tarjeta className="flex items-center justify-between gap-3 border-acento bg-acento-suave p-3">
        <p className="text-sm text-acento-oscuro">
          <span className="font-bold">Activa los avisos</span> para enterarte de cada mensaje aunque el celular esté bloqueado.
        </p>
        {estado === 'inactivo' ? (
          <button type="button" disabled={trabajando} onClick={activar} className="h-10 shrink-0 rounded-xl bg-tinta px-3 text-xs font-semibold text-white disabled:opacity-50">
            Activar
          </button>
        ) : (
          <Link to="/ajustes" className="shrink-0 text-xs font-bold text-acento-oscuro underline">
            Cómo
          </Link>
        )}
      </Tarjeta>
    )
  }

  const textos = {
    activo: ['Avisos activados en este celular', 'Te llega una notificación por cada mensaje nuevo y por cada conversación que espera a una persona.'],
    inactivo: ['Avisos desactivados en este celular', 'Actívalos para enterarte de los mensajes aunque tengas el celular bloqueado.'],
    bloqueado: ['Avisos bloqueados', 'Negaste el permiso. Para activarlos, cambia el permiso de notificaciones de este sitio en los ajustes del teléfono o del navegador.'],
    instalar: ['Instala el panel para recibir avisos', 'En iPhone los avisos solo funcionan con el panel instalado en la pantalla de inicio (mira «Instalar el panel» abajo) y abierto desde ese ícono.'],
    'no-soportado': ['Este navegador no recibe avisos', 'Prueba con Chrome (Android) o con el panel instalado (iPhone).'],
  }
  const [titulo, detalle] = textos[estado]

  return (
    <Tarjeta className="space-y-3">
      <div className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${estado === 'activo' ? 'bg-ok-suave text-ok' : 'bg-borde/70 text-gris'}`}>
          {estado === 'activo' ? <Bell size={20} aria-hidden="true" /> : <BellOff size={20} aria-hidden="true" />}
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold">{titulo}</p>
          <p className="text-xs text-gris">{detalle}</p>
        </div>
      </div>
      {estado === 'inactivo' && (
        <button type="button" disabled={trabajando} onClick={activar} className="h-12 w-full rounded-xl bg-tinta text-base font-semibold text-white disabled:opacity-50">
          {trabajando ? 'Activando…' : 'Activar avisos en este celular'}
        </button>
      )}
      {estado === 'activo' && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={trabajando}
            onClick={() => ejecutar(probarPush, 'Enviado. Si bloqueas el celular, debería llegarte en unos segundos.')}
            className="h-11 rounded-xl bg-tinta text-sm font-semibold text-white disabled:opacity-50"
          >
            Enviar aviso de prueba
          </button>
          <button
            type="button"
            disabled={trabajando}
            onClick={() => ejecutar(desactivarPush, 'Avisos desactivados en este celular.')}
            className="h-11 rounded-xl border border-borde text-sm font-semibold text-gris disabled:opacity-50"
          >
            Desactivar
          </button>
        </div>
      )}
      {mensaje && (
        <p role={mensaje.tipo === 'error' ? 'alert' : 'status'} className={`text-sm ${mensaje.tipo === 'error' ? 'rounded-xl bg-red-50 p-3 text-red-700' : 'font-semibold text-ok'}`}>
          {mensaje.texto}
        </p>
      )}
    </Tarjeta>
  )
}

/** Cómo instalar el panel como app (Android: botón; iPhone: Compartir → Agregar a inicio). */
export function InstalarPanel() {
  const [, forzar] = useState(0)
  useEffect(() => alCambiarInstalacion(() => forzar((n) => n + 1)), [])
  const instalado = estaInstalado()
  const [aviso, setAviso] = useState(null)

  return (
    <Tarjeta className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-borde/70 text-gris">
          <Download size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold">{instalado ? 'El panel está instalado' : 'Instalar el panel'}</p>
          <p className="text-xs text-gris">
            {instalado
              ? 'Ya lo abres desde el ícono de tu celular, como una app.'
              : 'Queda como una app en tu pantalla de inicio, se abre sin barra del navegador y es lo que permite los avisos en iPhone.'}
          </p>
        </div>
      </div>
      {!instalado && puedeInstalarDirecto() && (
        <button
          type="button"
          onClick={async () => setAviso((await instalarPanel()) ? 'Instalado.' : 'No se instaló.')}
          className="h-12 w-full rounded-xl bg-tinta text-base font-semibold text-white"
        >
          Instalar el panel
        </button>
      )}
      {!instalado && !puedeInstalarDirecto() && esIOS() && (
        <ol className="space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <Share size={16} aria-hidden="true" className="shrink-0 text-gris" /> Toca <b>Compartir</b> en la barra de Safari.
          </li>
          <li className="flex items-center gap-2">
            <SquarePlus size={16} aria-hidden="true" className="shrink-0 text-gris" /> Elige <b>Agregar a pantalla de inicio</b>.
          </li>
          <li>Abre el panel desde el ícono nuevo y vuelve aquí a activar los avisos.</li>
        </ol>
      )}
      {!instalado && !puedeInstalarDirecto() && !esIOS() && (
        <p className="text-sm text-gris">En el menú del navegador (⋮) elige <b>Instalar app</b> o <b>Agregar a la pantalla de inicio</b>.</p>
      )}
      {aviso && <p role="status" className="text-sm font-semibold text-ok">{aviso}</p>}
    </Tarjeta>
  )
}

import { useEffect, useState } from 'react'
import { Check, Copy, Eye, EyeOff, Shuffle, X } from 'lucide-react'
import { generarContrasena, PERFILES_EDITABLES, PERFILES_DE_LOCAL } from '../../utils/equipo'

/** Hoja que sube desde abajo en celular y se centra en escritorio (mismo patrón que el selector de plantillas). */
/**
 * `aviso` (errores o confirmaciones de una acción) va FIJO arriba del botón de abajo, no al final del contenido: en un
 * celular la persona está mirando el botón, y un mensaje escondido más arriba parecería que no pasó nada.
 */
export function Hoja({ titulo, onCerrar, children, pie, aviso }) {
  useEffect(() => {
    const alTeclear = (e) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onCerrar])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/50 sm:items-center" role="presentation" onClick={onCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-hueso shadow-xl sm:max-w-lg sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-borde px-4 py-3">
          <h2 className="min-w-0 flex-1 truncate pl-1 text-base font-bold">{titulo}</h2>
          <button onClick={onCerrar} aria-label="Cerrar" className="grid h-11 w-11 place-items-center rounded-xl text-gris">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">{children}</div>
        {(pie || aviso) && (
          <div className="shrink-0 space-y-2 border-t border-borde px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            {aviso}
            {pie}
          </div>
        )}
      </div>
    </div>
  )
}

export const claseEntrada =
  'min-h-11 w-full rounded-xl border border-borde bg-white px-3.5 text-base outline-none focus:border-acento focus:ring-2 focus:ring-acento/20 disabled:bg-borde/40 disabled:text-gris'

export function Campo({ etiqueta, ayuda, children, htmlFor }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold">
        {etiqueta}
      </label>
      {children}
      {ayuda && <p className="text-xs text-gris">{ayuda}</p>}
    </div>
  )
}

/** Interruptor grande (44 px de alto) con texto y ayuda. */
export function Interruptor({ activo, onCambio, etiqueta, ayuda, deshabilitado }) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{etiqueta}</p>
        {ayuda && <p className="text-xs text-gris">{ayuda}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        aria-label={etiqueta}
        disabled={deshabilitado}
        onClick={() => onCambio(!activo)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50 ${activo ? 'bg-ok' : 'bg-gris/50'}`}
      >
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${activo ? 'left-7' : 'left-1'}`} />
      </button>
    </div>
  )
}

/** Perfiles de la cuenta: una casilla por perfil (el acceso es la unión). El transitorio solo se muestra si la cuenta ya lo tiene. */
export function SelectorPerfiles({ valor, onCambio, tieneTransitorio, bloquearAdministracion }) {
  const alternar = (id) => onCambio(valor.includes(id) ? valor.filter((p) => p !== id) : [...valor, id])
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-semibold">Perfiles</legend>
      {PERFILES_EDITABLES.map((p) => {
        const marcado = valor.includes(p.id)
        const bloqueado = p.id === 'administracion' && bloquearAdministracion
        return (
          <label
            key={p.id}
            className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-3 ${marcado ? 'border-acento bg-acento-suave/50' : 'border-borde bg-white'} ${bloqueado ? 'opacity-70' : ''}`}
          >
            <input type="checkbox" checked={marcado} disabled={bloqueado} onChange={() => alternar(p.id)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#D86820]" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{p.nombre}</span>
              <span className="block text-xs text-gris">
                {p.ayuda}
                {bloqueado && ' No puedes quitarte Administración a ti mismo.'}
              </span>
            </span>
          </label>
        )
      })}
      {tieneTransitorio && (
        <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-borde bg-white p-3">
          <input type="checkbox" checked={valor.includes('empleado_temporal')} onChange={() => alternar('empleado_temporal')} className="mt-0.5 h-5 w-5 shrink-0 accent-[#D86820]" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Empleado (acceso anterior, temporal)</span>
            <span className="block text-xs text-gris">Es el acceso de las cuentas viejas; se retira cuando las cuentas nuevas estén probadas.</span>
          </span>
        </label>
      )}
    </fieldset>
  )
}

/** ¿Hace falta elegir un local con estos perfiles? */
export const necesitaLocal = (perfiles) => !perfiles.includes('administracion') && perfiles.some((p) => PERFILES_DE_LOCAL.includes(p))

/** Contraseña: campo con mostrar/ocultar y botón «Generar». */
export function CampoContrasena({ id, valor, onCambio, autoFocus }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="flex gap-2">
      <div className="relative min-w-0 flex-1">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          autoComplete="new-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          className={`${claseEntrada} pr-12`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
          className="absolute right-0 top-0 grid h-11 w-11 place-items-center text-gris"
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          onCambio(generarContrasena())
          setVisible(true)
        }}
        className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-borde bg-white px-3 text-sm font-semibold"
      >
        <Shuffle size={16} aria-hidden="true" />
        Generar
      </button>
    </div>
  )
}

/** Botón «Copiar» que avisa cuando copió. */
export function BotonCopiar({ texto, etiqueta = 'Copiar' }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto)
          setCopiado(true)
          setTimeout(() => setCopiado(false), 1800)
        } catch {
          // sin permiso de portapapeles: la persona puede seleccionar el texto a mano
        }
      }}
      className="flex min-h-11 items-center gap-1.5 rounded-xl border border-borde bg-white px-3 text-sm font-semibold"
    >
      {copiado ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      {copiado ? 'Copiado' : etiqueta}
    </button>
  )
}

export function MensajeError({ texto }) {
  if (!texto) return null
  return (
    <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
      {texto}
    </p>
  )
}

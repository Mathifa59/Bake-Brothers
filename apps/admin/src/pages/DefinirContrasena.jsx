import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

// Se muestra cuando alguien llega por el enlace de un correo de invitación o de recuperación de contraseña (la
// sesión ya viene en el enlace). Nadie más conoce ni ve la contraseña: la elige la propia persona.
export const LARGO_MINIMO_CONTRASENA = 10

export function validarContrasena(contrasena, repetida) {
  if (contrasena.length < LARGO_MINIMO_CONTRASENA) return `Usa al menos ${LARGO_MINIMO_CONTRASENA} caracteres.`
  if (contrasena !== repetida) return 'Las dos contraseñas no coinciden.'
  return null
}

export default function DefinirContrasena() {
  const { session, definirContrasena, logout } = useAuth()
  const [contrasena, setContrasena] = useState('')
  const [repetida, setRepetida] = useState('')
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e) => {
    e.preventDefault()
    const problema = validarContrasena(contrasena, repetida)
    if (problema) {
      setError(problema)
      return
    }
    setError(null)
    setEnviando(true)
    const { error: fallo } = await definirContrasena(contrasena)
    setEnviando(false)
    if (fallo) {
      setError(fallo.message)
      return
    }
    // Contraseña guardada: la sesión sigue abierta; se entra a la pantalla de inicio de su rol.
    window.location.hash = '#/inicio'
  }

  const campo = 'w-full rounded-xl border border-borde bg-white px-4 py-2.5 text-sm outline-none focus:border-acento focus:ring-2 focus:ring-acento/20'

  return (
    <div className="grid min-h-screen place-items-center bg-crema px-4">
      <div className="w-full max-w-sm rounded-3xl border border-borde/60 bg-white p-8 shadow-sm">
        <img src="/img/logo-bakebrothers.png" alt="Bake Brothers" width={99} height={56} className="mx-auto h-14 w-[99px]" />
        <h1 className="mt-3 text-center text-sm font-semibold text-caramelo">Define tu contraseña</h1>
        <p className="mt-1 text-center text-sm text-gris">
          {session?.user?.email ? <>Para entrar con <span className="font-semibold text-tinta">{session.user.email}</span>.</> : 'Para entrar al panel.'}
        </p>

        <form onSubmit={enviar} className="mt-6 space-y-4">
          <div>
            <label htmlFor="nueva" className="mb-1 block text-xs font-bold uppercase tracking-wide text-gris">Contraseña nueva</label>
            <input id="nueva" type="password" required autoComplete="new-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} className={campo} />
            <p className="mt-1 text-xs text-gris">Al menos {LARGO_MINIMO_CONTRASENA} caracteres.</p>
          </div>
          <div>
            <label htmlFor="repetida" className="mb-1 block text-xs font-bold uppercase tracking-wide text-gris">Repite la contraseña</label>
            <input id="repetida" type="password" required autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} className={campo} />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}

          <button type="submit" disabled={enviando} className="w-full rounded-xl bg-tinta px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-black disabled:opacity-60">
            {enviando ? 'Guardando…' : 'Guardar y entrar'}
          </button>
          <button type="button" onClick={logout} className="w-full text-center text-xs font-semibold text-gris underline">
            Cancelar y salir
          </button>
        </form>
      </div>
    </div>
  )
}

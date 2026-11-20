import { useState } from 'react'
import { correoDeAcceso, DOMINIO_EQUIPO_POR_DEFECTO } from '@bakebrothers/domain'
import { useAuth } from '../context/AuthContext'

// Dominio del correo interno de las cuentas creadas desde Equipo (se completa solo si escriben el usuario sin «@»).
const DOMINIO_EQUIPO = import.meta.env.VITE_DOMINIO_EQUIPO || DOMINIO_EQUIPO_POR_DEFECTO

export default function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e) => {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    const { error } = await login(correoDeAcceso(email, DOMINIO_EQUIPO), password)
    setEnviando(false)
    if (error) setError(error.message)
  }

  return (
    <div className="grid min-h-screen place-items-center bg-crema px-4">
      <div className="w-full max-w-sm rounded-3xl border border-borde/60 bg-white p-8 shadow-sm">
        <img
          src="/img/logo-bakebrothers.png"
          alt="Bake Brothers"
          width={99}
          height={56}
          className="mx-auto h-14 w-[99px]"
        />
        <p className="mt-3 text-center text-sm font-semibold text-caramelo">Panel del equipo</p>
        <p className="mt-1 text-center text-sm text-gris">Acceso solo para el equipo.</p>

        <form onSubmit={enviar} className="mt-6 space-y-4">
          <div>
            <label htmlFor="usuario-o-correo" className="mb-1 block text-xs font-bold uppercase tracking-wide text-gris">Usuario o correo</label>
            <input
              id="usuario-o-correo"
              type="text"
              required
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-borde bg-white px-4 py-2.5 text-sm outline-none focus:border-acento focus:ring-2 focus:ring-acento/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gris">Contraseña</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-borde bg-white px-4 py-2.5 text-sm outline-none focus:border-acento focus:ring-2 focus:ring-acento/20"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={enviando}
            className="w-full rounded-xl bg-tinta px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-black disabled:opacity-60"
          >
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}

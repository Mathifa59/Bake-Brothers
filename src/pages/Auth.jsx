import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import Input from '../components/Input'
import Logo from '../components/Logo'

function MarcoAuth({ titulo, subtitulo, children, pie }) {
  return (
    <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-4 py-14">
      <div className="w-full">
        <div className="mb-7 flex justify-center">
          <Logo tamano="lg" />
        </div>
        <div className="anim-fade-up rounded-[2rem] border border-borde/60 bg-white p-7 shadow-sm md:p-8">
          <h1 className="font-display text-3xl font-semibold">{titulo}</h1>
          <p className="mt-1.5 text-sm text-gris">{subtitulo}</p>
          <div className="mt-6">{children}</div>
        </div>
        {pie && <div className="mt-5 text-center text-sm text-gris">{pie}</div>}
      </div>
    </div>
  )
}

export function Login() {
  const navigate = useNavigate()
  return (
    <MarcoAuth
      titulo="¡Hola de nuevo! 👋"
      subtitulo="Ingresa para ver tus pedidos y comprar más rápido."
      pie={
        <>
          ¿Aún no tienes cuenta?{' '}
          <Link to="/registro" className="font-bold text-acento hover:underline">Regístrate gratis</Link>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); navigate('/cuenta') }} className="space-y-4">
        <Input label="Correo electrónico" type="email" required placeholder="tucorreo@ejemplo.com" />
        <Input label="Contraseña" type="password" required placeholder="••••••••" />
        <div className="flex items-center justify-between text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="h-4 w-4 rounded accent-acento" />
            <span className="text-gris">Recordarme</span>
          </label>
          <Link to="/recuperar" className="font-semibold text-acento hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        <Button tamano="lg" type="submit" className="w-full">Ingresar</Button>
      </form>
    </MarcoAuth>
  )
}

export function Registro() {
  const navigate = useNavigate()
  return (
    <MarcoAuth
      titulo="Crea tu cuenta 🧁"
      subtitulo="Guarda tus datos, revisa tus pedidos y entérate primero de las ofertas."
      pie={
        <>
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="font-bold text-acento hover:underline">Inicia sesión</Link>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); navigate('/cuenta') }} className="space-y-4">
        <Input label="Nombre completo" required placeholder="Tu nombre" />
        <Input label="Correo electrónico" type="email" required placeholder="tucorreo@ejemplo.com" />
        <Input label="Teléfono" type="tel" placeholder="999 999 999" />
        <Input label="Contraseña" type="password" required placeholder="Mínimo 8 caracteres" />
        <Button tamano="lg" type="submit" className="w-full">Crear cuenta</Button>
        <p className="text-center text-xs text-gris">
          Al registrarte aceptas nuestros términos y política de privacidad.
        </p>
      </form>
    </MarcoAuth>
  )
}

export function Recuperar() {
  const [enviado, setEnviado] = useState(false)
  return (
    <MarcoAuth
      titulo="Recuperar contraseña 🔑"
      subtitulo="Te enviaremos un enlace para crear una nueva contraseña."
      pie={
        <Link to="/login" className="font-bold text-acento hover:underline">← Volver a iniciar sesión</Link>
      }
    >
      {enviado ? (
        <div className="anim-pop rounded-2xl bg-emerald-50 p-6 text-center ring-1 ring-emerald-200">
          <span className="text-4xl">📬</span>
          <p className="mt-3 text-sm font-semibold text-emerald-800">
            ¡Listo! Si el correo existe en nuestro sistema, recibirás el enlace en unos minutos.
          </p>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); setEnviado(true) }} className="space-y-4">
          <Input label="Correo electrónico" type="email" required placeholder="tucorreo@ejemplo.com" />
          <Button tamano="lg" type="submit" className="w-full">Enviar enlace</Button>
        </form>
      )}
    </MarcoAuth>
  )
}

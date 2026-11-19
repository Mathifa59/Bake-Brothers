import { Link } from 'react-router-dom'

/** Ruta que no existe dentro del sitio (el HTML directo a una ruta inexistente lo atiende public/404.html con estado 404). */
export default function NoEncontrada() {
  return (
    <section className="page-container max-w-3xl py-24 text-center sm:py-32">
      <h1 className="font-display text-4xl font-semibold text-tinta sm:text-5xl">Esta página no existe</h1>
      <p className="mt-4 leading-relaxed text-gris">Puede que el enlace esté mal escrito o que ya no esté disponible.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/" className="rounded-full bg-tinta px-6 py-3 text-sm font-semibold text-white">
          Ir al inicio
        </Link>
        <Link to="/menu" className="rounded-full border border-tinta/20 px-6 py-3 text-sm font-semibold text-tinta">
          Ver el menú
        </Link>
      </div>
    </section>
  )
}

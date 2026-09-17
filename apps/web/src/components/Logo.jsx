import { Link } from 'react-router-dom'

// El logo real ya trae el wordmark "Bake Brothers · Pastelería Artesanal"
// dibujado en la imagen, sobre fondo claro — en el footer (fondo oscuro) se
// envuelve en una tarjeta blanca para que no se vea cortado.
export default function Logo({ claro = false, tamano = 'md' }) {
  const alto = tamano === 'lg' ? 'h-14' : 'h-11'
  return (
    <Link to="/" className="group flex items-center" aria-label="Bake Brothers — Inicio">
      <img
        src="/img/logo-bakebrothers.jpg"
        alt="Bake Brothers — Pastelería Artesanal"
        className={`${alto} w-auto rounded-lg transition-transform group-hover:rotate-1 ${claro ? 'bg-white p-1.5' : ''}`}
      />
    </Link>
  )
}

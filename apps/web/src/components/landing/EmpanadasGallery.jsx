import { empanadas } from '../../config/landing'
import EmpanadaCard from './EmpanadaCard'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'

// Antes esto pineaba la sección y traducía la fila en horizontal atada al
// scroll vertical — funcionaba, pero en la práctica se sentía confuso
// (feedback real del cliente: "hay como para deslizar horizontal y
// vertical"). Se reemplazó por una cinta que se mueve sola (marquee),
// mecánica mucho más simple y sin scrollbars propios en ningún breakpoint.
//
// Con prefers-reduced-motion no se anima nada — lista simple con scroll
// horizontal nativo, controlado por el usuario.
export default function EmpanadasGallery() {
  const reducido = usePrefersReducedMotion()
  const items = reducido ? empanadas : [...empanadas, ...empanadas]

  return (
    <section className="overflow-hidden bg-hueso py-20 sm:py-28">
      <div className="mb-10 px-6 sm:px-12 lg:px-20">
        <h2 className="font-display text-4xl font-semibold text-tinta sm:text-5xl">Empanadas BigBro</h2>
        <p className="mt-3 max-w-md text-gris">Masa dorada y relleno generoso — elegí tu sabor y te las dejamos listas.</p>
      </div>

      {reducido ? (
        <div className="no-scrollbar flex snap-x snap-mandatory gap-5 overflow-x-auto px-6 pb-2 sm:px-12 lg:px-20">
          {items.map((empanada) => (
            <div key={empanada.id} className="snap-start">
              <EmpanadaCard empanada={empanada} />
            </div>
          ))}
        </div>
      ) : (
        <div className="anim-marquee-empanadas flex w-max gap-5">
          {items.map((empanada, i) => (
            <EmpanadaCard key={`${empanada.id}-${i}`} empanada={empanada} />
          ))}
        </div>
      )}
    </section>
  )
}

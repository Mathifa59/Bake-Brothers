import { empanadas } from '../../config/landing'
import EmpanadaCard from './EmpanadaCard'

// Grilla simple, sin scroll propio ni movimiento automático — a pedido real
// del cliente ("dale un espacio a cada una para que resalten más", "no
// quiero un carrusel"). Cada empanada visible de una, con aire real
// alrededor (gap generoso), en vez de competir por espacio en una fila que
// se mueve o se desliza.
export default function EmpanadasGallery() {
  return (
    <section className="bg-hueso py-20 sm:py-28">
      <div className="mb-10 px-6 sm:px-12 lg:px-20">
        <h2 className="font-display text-4xl font-semibold text-tinta sm:text-5xl">Empanadas BigBro</h2>
        <p className="mt-3 max-w-md text-gris">Masa dorada y relleno generoso — elegí tu sabor y te las dejamos listas.</p>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-10 px-6 sm:grid-cols-3 sm:gap-x-8 sm:gap-y-14 sm:px-12 lg:px-20 xl:grid-cols-4 xl:gap-x-10">
        {empanadas.map((empanada) => (
          <EmpanadaCard key={empanada.id} empanada={empanada} />
        ))}
      </div>
    </section>
  )
}

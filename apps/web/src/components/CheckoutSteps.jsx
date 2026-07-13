import { Check } from 'lucide-react'

export default function CheckoutSteps({ pasos, actual }) {
  return (
    <ol className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar">
      {pasos.map((paso, i) => {
        const completado = i < actual
        const activo = i === actual
        return (
          <li key={paso} className="flex flex-1 items-center gap-1 min-w-0 last:flex-none">
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <span
                className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold transition-all ${
                  completado
                    ? 'bg-acento text-white'
                    : activo
                      ? 'bg-tinta text-white ring-4 ring-acento/25'
                      : 'border-2 border-borde bg-white text-gris'
                }`}
              >
                {completado ? <Check size={16} /> : i + 1}
              </span>
              <span
                className={`hidden whitespace-nowrap text-[11px] font-bold uppercase tracking-wide sm:block ${
                  activo ? 'text-tinta' : completado ? 'text-acento-oscuro' : 'text-gris/60'
                }`}
              >
                {paso}
              </span>
            </div>
            {i < pasos.length - 1 && (
              <span
                className={`mx-1 mb-0 h-[2px] flex-1 rounded sm:mb-5 ${completado ? 'bg-acento' : 'bg-borde'}`}
                aria-hidden="true"
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

import { Minus, Plus } from 'lucide-react'

/** Contador − / número / + con botones de 44 px (se usa con el pulgar, de pie, en la cocina). */
export default function Stepper({ valor, onCambio, etiqueta, max = 9999 }) {
  const n = Number(valor) || 0
  const poner = (v) => onCambio(Math.max(0, Math.min(max, Math.round(v) || 0)))
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => poner(n - 1)}
        disabled={n === 0}
        aria-label={`Quitar uno de ${etiqueta}`}
        className="grid h-11 w-11 place-items-center rounded-xl border border-borde bg-hueso text-tinta disabled:opacity-30"
      >
        <Minus size={18} aria-hidden="true" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min="0"
        value={n === 0 ? '' : n}
        placeholder="0"
        onChange={(e) => poner(e.target.value)}
        onFocus={(e) => e.target.select()}
        aria-label={`Cantidad de ${etiqueta}`}
        className={`h-11 w-16 rounded-xl border bg-hueso text-center text-base font-bold outline-none focus:border-acento ${
          n > 0 ? 'border-acento' : 'border-borde'
        }`}
      />
      <button
        type="button"
        onClick={() => poner(n + 1)}
        aria-label={`Agregar uno de ${etiqueta}`}
        className="grid h-11 w-11 place-items-center rounded-xl border border-borde bg-hueso text-tinta"
      >
        <Plus size={18} aria-hidden="true" />
      </button>
    </div>
  )
}

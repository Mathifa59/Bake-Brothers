import { opcionesDeHora, aOpcionDeHora } from '../../utils/ordenes'

/**
 * Selector de hora de despacho/entrega: de 15 en 15 minutos (7:30, 7:45, 8:00…), en vez de escribirla. Guarda el
 * texto en el formato que entiende el servidor («7:30 am», «1:30 pm»). Si el valor que llega (la hora habitual de un
 * cliente, o una orden anterior) no cae en la rejilla, se muestra igual como una opción más: no se pierde.
 */
export default function SelectorHora({ id, value, onChange, vacio = null, className = '' }) {
  const actual = value ? aOpcionDeHora(value) : ''
  const opciones = opcionesDeHora()
  const fueraDeRejilla = actual && !opciones.some((o) => o.valor === actual)
  return (
    <select
      id={id}
      value={actual}
      onChange={(e) => onChange(e.target.value)}
      className={`h-12 w-full rounded-xl border border-borde bg-hueso px-3 text-base outline-none focus:border-acento ${className}`}
    >
      {vacio && <option value="">{vacio}</option>}
      {fueraDeRejilla && <option value={actual}>{actual}</option>}
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.etiqueta}
        </option>
      ))}
    </select>
  )
}

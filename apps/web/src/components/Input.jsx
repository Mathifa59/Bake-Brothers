export default function Input({
  label,
  textarea = false,
  opciones = null,
  className = '',
  ...props
}) {
  const base =
    'w-full rounded-2xl border border-borde bg-white px-4 py-3 text-sm text-tinta placeholder:text-gris/60 outline-none transition-all focus:border-acento focus:ring-2 focus:ring-acento/20'

  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="mb-1.5 block text-xs font-semibold tracking-wide text-tinta/70 uppercase">
          {label}
        </span>
      )}
      {opciones ? (
        <select className={`${base} appearance-none cursor-pointer`} {...props}>
          {opciones.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : textarea ? (
        <textarea rows={4} className={`${base} resize-none`} {...props} />
      ) : (
        <input className={base} {...props} />
      )}
    </label>
  )
}

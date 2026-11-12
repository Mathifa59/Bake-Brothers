import { useRef } from 'react'
import { Camera, Images, Star, Trash2 } from 'lucide-react'
import FotoProducto from '../bakeos/FotoProducto'

/**
 * Fotos de un producto: varias, con una principal (la que ven el bot y la web). Se pueden tomar con la cámara del celular
 * o elegir de la galería; se achican a menos de 1 MB antes de subirse (utils/imagenes.js).
 */
export default function FotosProducto({ fotos, ocupado, error, onAgregar, onPrincipal, onQuitar }) {
  const camara = useRef(null)
  const galeria = useRef(null)
  const elegir = (e) => {
    const archivos = [...(e.target.files ?? [])]
    e.target.value = '' // permite volver a elegir el mismo archivo
    if (archivos.length) onAgregar(archivos)
  }
  const boton = 'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-borde bg-white px-3 text-sm font-semibold disabled:opacity-50'

  return (
    <div className="flex flex-col gap-3">
      {fotos.length === 0 ? (
        <p className="rounded-xl bg-borde/40 px-3.5 py-3 text-sm text-gris">Todavía no tiene fotos.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {fotos.map((f) => (
            <li key={f.id} className="relative flex flex-col gap-1">
              <div className={`overflow-hidden rounded-xl ${f.principal ? 'ring-2 ring-acento' : ''}`}>
                <FotoProducto url={f.url} nombre="Foto" className="aspect-square h-auto w-full" />
              </div>
              {f.principal && <span className="absolute left-1 top-1 rounded-md bg-acento-oscuro px-1.5 py-0.5 text-[10px] font-bold text-white">Principal</span>}
              <div className="flex gap-1">
                {!f.principal && (
                  <button
                    type="button"
                    onClick={() => onPrincipal(f)}
                    disabled={ocupado}
                    aria-label="Usar como foto principal"
                    className="grid min-h-11 flex-1 place-items-center rounded-lg border border-borde bg-white text-gris disabled:opacity-50"
                  >
                    <Star size={16} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onQuitar(f)}
                  disabled={ocupado}
                  aria-label="Quitar esta foto"
                  className="grid min-h-11 flex-1 place-items-center rounded-lg border border-borde bg-white text-red-700 disabled:opacity-50"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <button type="button" className={boton} disabled={ocupado} onClick={() => camara.current?.click()}>
          <Camera size={17} aria-hidden="true" /> Tomar foto
        </button>
        <button type="button" className={boton} disabled={ocupado} onClick={() => galeria.current?.click()}>
          <Images size={17} aria-hidden="true" /> Galería
        </button>
      </div>
      <input ref={camara} type="file" accept="image/*" capture="environment" className="hidden" onChange={elegir} aria-label="Tomar foto con la cámara" />
      <input ref={galeria} type="file" accept="image/*" multiple className="hidden" onChange={elegir} aria-label="Elegir fotos de la galería" />
      {ocupado && <p className="text-sm text-gris" role="status">Procesando la foto…</p>}
      {error && <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2 text-sm text-red-700">{error}</p>}
    </div>
  )
}

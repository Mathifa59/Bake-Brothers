import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Copy, Plus, X } from 'lucide-react'
import FotosProducto from './FotosProducto'

const AREAS = [
  ['', 'Sin área'],
  ['pasteleria', 'Pastelería'],
  ['empanaderia', 'Empanadería'],
  ['cocina', 'Cocina'],
  ['empaque', 'Empaque'],
]

const campoBase = 'min-h-11 rounded-xl border border-borde bg-white px-3 text-[15px] outline-none focus:border-acento'
const campo = `${campoBase} w-full`

function Interruptor({ activo, onClick, etiqueta, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={disabled}
      onClick={onClick}
      className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50 ${activo ? 'bg-green-600' : 'bg-borde'}`}
    >
      <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${activo ? 'left-7' : 'left-1'}`} />
    </button>
  )
}
export { Interruptor }

const vacio = (tipo) => ({ id: null, nombre: '', tipo, descripcion: '', disponible: true, area_produccion: '', familia_operativa: '', sabor: '', precio_base: '' })

/**
 * Hoja para crear o editar un producto: datos, tamaños o sabores (cada uno con su precio, activo/oculto y orden) y fotos.
 * Los tamaños que ya existen no se borran: se ocultan (el stock y los pedidos pueden referenciarlos).
 */
export default function EditorProducto({
  producto, // null = nuevo
  familias,
  familiaInicial,
  valoresFamiliaOperativa,
  guardando,
  errorGuardar,
  fotosOcupado,
  errorFotos,
  onGuardar,
  onDuplicar,
  onCerrar,
  onAgregarFotos,
  onPrincipal,
  onQuitarFoto,
}) {
  const [datos, setDatos] = useState(() => (producto ? { ...producto, descripcion: producto.descripcion ?? '', area_produccion: producto.area_produccion ?? '', familia_operativa: producto.familia_operativa ?? '', sabor: producto.sabor ?? '' } : vacio(familiaInicial ?? familias[0])))
  const [filas, setFilas] = useState(() =>
    (producto?.product_sizes ?? []).map((t) => ({ ...t, precio: t.precio ?? '', nuevo: false }))
  )
  const [clase, setClase] = useState(() => producto?.product_sizes?.[0]?.clase ?? 'tamano')
  const [errorLocal, setErrorLocal] = useState(null)
  const etiquetaVariante = clase === 'sabor' ? 'sabor' : 'tamaño'

  const cambiar = (k, v) => setDatos((d) => ({ ...d, [k]: v }))
  const cambiarFila = (i, k, v) => setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, [k]: v } : f)))
  const mover = (i, delta) =>
    setFilas((fs) => {
      const j = i + delta
      if (j < 0 || j >= fs.length) return fs
      const copia = [...fs]
      ;[copia[i], copia[j]] = [copia[j], copia[i]]
      return copia
    })

  const guardar = async () => {
    setErrorLocal(null)
    if (!datos.nombre.trim()) return setErrorLocal('Escribe el nombre del producto.')
    if (filas.length === 0 && !(Number(datos.precio_base) > 0)) return setErrorLocal('Escribe el precio.')
    for (const f of filas) {
      if (!f.tamano.trim()) return setErrorLocal(`Falta el nombre de un ${etiquetaVariante}.`)
      if (f.activo !== false && !(Number(f.precio) > 0)) return setErrorLocal(`Falta el precio de «${f.tamano}» (o márcalo como oculto).`)
    }
    await onGuardar(datos, filas.map((f) => ({ ...f, clase })))
  }

  const sugerencias = useMemo(() => [...new Set(valoresFamiliaOperativa)].sort(), [valoresFamiliaOperativa])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-crema" role="dialog" aria-modal="true" aria-label={producto ? `Editar ${producto.nombre}` : 'Nuevo producto'}>
      <div className="flex shrink-0 items-center gap-2 border-b border-borde bg-hueso px-4 py-2.5">
        <button onClick={onCerrar} aria-label="Cerrar sin guardar" className="-ml-2 grid h-11 w-11 place-items-center rounded-xl text-gris">
          <X size={20} aria-hidden="true" />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-base font-bold">{producto ? producto.nombre : 'Nuevo producto'}</h2>
        {producto && (
          <button onClick={() => onDuplicar(producto)} disabled={guardando} className="flex min-h-11 items-center gap-1.5 rounded-xl border border-borde bg-white px-3 text-sm font-semibold disabled:opacity-50">
            <Copy size={15} aria-hidden="true" /> Duplicar
          </button>
        )}
      </div>

      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Nombre</span>
            <input className={campo} value={datos.nombre} onChange={(e) => cambiar('nombre', e.target.value)} />
          </label>

          <div className="flex items-center justify-between gap-3 rounded-2xl border border-borde bg-hueso p-3.5">
            <div>
              <p className="text-sm font-bold">{datos.disponible ? 'Activo' : 'Oculto'}</p>
              <p className="text-xs text-gris">{datos.disponible ? 'Se ofrece en el bot, en los pedidos y en Stock.' : 'No aparece en el bot, en los pedidos ni en Stock. No se borra.'}</p>
            </div>
            <Interruptor activo={datos.disponible} onClick={() => cambiar('disponible', !datos.disponible)} etiqueta="Producto activo" />
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Familia</span>
            <select className={campo} value={datos.tipo} disabled={Boolean(producto)} onChange={(e) => cambiar('tipo', e.target.value)}>
              {familias.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
            {producto && <span className="text-xs text-gris">La familia de un producto ya creado no se cambia desde aquí.</span>}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Descripción</span>
            <textarea className={`${campo} min-h-[5.5rem] py-2.5`} rows={3} value={datos.descripcion} onChange={(e) => cambiar('descripcion', e.target.value)} />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold">Área de producción</span>
              <select className={campo} value={datos.area_produccion} onChange={(e) => cambiar('area_produccion', e.target.value)}>
                {AREAS.map(([v, t]) => (
                  <option key={v} value={v}>{t}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold">Familia operativa</span>
              <input className={campo} list="familias-operativas" value={datos.familia_operativa} onChange={(e) => cambiar('familia_operativa', e.target.value.toUpperCase())} placeholder="PASTELERIA" />
              <datalist id="familias-operativas">
                {sugerencias.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold">Sabor (código)</span>
              <input className={campo} value={datos.sabor} onChange={(e) => cambiar('sabor', e.target.value.toUpperCase())} placeholder="Solo empanadas" />
            </label>
          </div>

          {/* Tamaños o sabores */}
          <section className="flex flex-col gap-3 rounded-2xl border border-borde bg-hueso p-3.5" aria-label="Tamaños o sabores">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold">{clase === 'sabor' ? 'Sabores' : 'Tamaños'} y precios</h3>
              <div role="group" aria-label="Qué son las opciones" className="flex gap-1 rounded-xl border border-borde bg-white p-1">
                {[['tamano', 'Tamaños'], ['sabor', 'Sabores']].map(([v, t]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={clase === v}
                    onClick={() => setClase(v)}
                    className={`min-h-9 rounded-lg px-3 text-xs font-bold ${clase === v ? 'bg-tinta text-white' : 'text-gris'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {filas.length === 0 ? (
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold">Precio (S/)</span>
                <input className={campo} inputMode="decimal" value={datos.precio_base} onChange={(e) => cambiar('precio_base', e.target.value)} placeholder="0.00" />
                <span className="text-xs text-gris">Sin tamaños ni sabores el producto tiene un solo precio. Agrega abajo si tiene varios.</span>
              </label>
            ) : (
              <ul className="flex flex-col gap-2">
                {filas.map((f, i) => (
                  <li key={f.id ?? `nuevo-${i}`} className={`flex flex-col gap-2 rounded-xl border border-borde bg-white p-2.5 ${f.activo === false ? 'opacity-60' : ''}`}>
                    <div className="flex gap-2">
                      <input aria-label={`Nombre del ${etiquetaVariante}`} className={`${campoBase} min-w-0 flex-1`} value={f.tamano} onChange={(e) => cambiarFila(i, 'tamano', e.target.value)} placeholder={clase === 'sabor' ? 'Fresa' : 'Mini 16 cm'} />
                      <input aria-label={`Precio de ${f.tamano || etiquetaVariante}`} className={`${campoBase} w-24 shrink-0`} inputMode="decimal" value={f.precio} onChange={(e) => cambiarFila(i, 'precio', e.target.value)} placeholder="S/" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Interruptor activo={f.activo !== false} onClick={() => cambiarFila(i, 'activo', f.activo === false)} etiqueta={`${f.tamano || etiquetaVariante} activo`} />
                      <span className="text-xs text-gris">{f.activo === false ? 'Oculto' : 'Activo'}</span>
                      <span className="flex-1" />
                      <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)} className="grid h-11 w-11 place-items-center rounded-lg border border-borde text-gris disabled:opacity-30"><ArrowUp size={16} aria-hidden="true" /></button>
                      <button type="button" aria-label="Bajar" disabled={i === filas.length - 1} onClick={() => mover(i, 1)} className="grid h-11 w-11 place-items-center rounded-lg border border-borde text-gris disabled:opacity-30"><ArrowDown size={16} aria-hidden="true" /></button>
                      {f.nuevo && (
                        <button type="button" aria-label="Quitar" onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))} className="grid h-11 w-11 place-items-center rounded-lg border border-borde text-red-700"><X size={16} aria-hidden="true" /></button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setFilas((fs) => [...fs, { id: null, tamano: '', precio: '', activo: true, nuevo: true }])}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-dashed border-borde bg-white text-sm font-semibold"
            >
              <Plus size={16} aria-hidden="true" /> Agregar {etiquetaVariante}
            </button>
          </section>

          {/* Fotos */}
          <section className="flex flex-col gap-3 rounded-2xl border border-borde bg-hueso p-3.5" aria-label="Fotos">
            <h3 className="text-sm font-bold">Fotos</h3>
            {producto ? (
              <FotosProducto fotos={producto.product_photos ?? []} ocupado={fotosOcupado} error={errorFotos} onAgregar={onAgregarFotos} onPrincipal={onPrincipal} onQuitar={onQuitarFoto} />
            ) : (
              <p className="rounded-xl bg-borde/40 px-3.5 py-3 text-sm text-gris">Guarda el producto y podrás subirle fotos.</p>
            )}
          </section>
        </div>
      </div>

      <div className="shrink-0 border-t border-borde bg-hueso p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          {(errorLocal || errorGuardar) && (
            <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2 text-sm text-red-700">
              {errorLocal ?? errorGuardar}
            </p>
          )}
          <button onClick={guardar} disabled={guardando} className="min-h-12 w-full rounded-xl bg-tinta px-4 text-[15px] font-semibold text-white disabled:opacity-50">
            {guardando ? 'Guardando…' : producto ? 'Guardar cambios' : 'Crear producto'}
          </button>
        </div>
      </div>
    </div>
  )
}

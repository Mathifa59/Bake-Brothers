import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { nombreDeArea } from '@bakebrothers/domain'
import { supabase } from '../lib/supabase'
import { Cargando, ErrorCarga, Portada, Tarjeta } from '../components/bakeos/ui'

const ENTRA_A_VITRINA = (modo) => modo === 'vitrina' || modo === 'ambos'

// Una fila por producto (o por tamaño, si el producto se hace en varios) que se produce para vitrina.
function armarSkus(productos) {
  const skus = []
  for (const p of productos) {
    const tamanos = (p.product_sizes ?? []).filter((t) => t.precio !== null && t.visible_publico !== false)
    if (tamanos.length === 0) {
      if (ENTRA_A_VITRINA(p.modo_produccion)) skus.push({ key: p.id, productId: p.id, productSizeId: null, nombre: p.nombre, area: p.area_produccion })
    } else {
      for (const t of tamanos) {
        if (ENTRA_A_VITRINA(t.modo_produccion ?? p.modo_produccion)) {
          skus.push({ key: `${p.id}:${t.id}`, productId: p.id, productSizeId: t.id, nombre: `${p.nombre} — ${t.tamano}`, area: p.area_produccion })
        }
      }
    }
  }
  return skus.sort((a, b) => nombreDeArea(a.area).localeCompare(nombreDeArea(b.area), 'es') || a.nombre.localeCompare(b.nombre, 'es'))
}

function FilaPlan({ sku, fila, onGuardar }) {
  const [cantidad, setCantidad] = useState(fila ? String(fila.cantidad) : '')
  const [domingo, setDomingo] = useState(fila?.cantidad_domingo !== null && fila?.cantidad_domingo !== undefined ? String(fila.cantidad_domingo) : '')
  const cambiado = cantidad !== (fila ? String(fila.cantidad) : '') || domingo !== (fila?.cantidad_domingo !== null && fila?.cantidad_domingo !== undefined ? String(fila.cantidad_domingo) : '')
  return (
    <li className="rounded-2xl border border-borde bg-hueso p-3.5">
      <p className="text-[15px] font-semibold leading-snug">{sku.nombre}</p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <label className="text-xs font-semibold text-gris">
          Cada día
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            onBlur={() => cambiado && onGuardar(sku, fila, cantidad, domingo)}
            placeholder="Sin plan"
            className="mt-1 h-11 w-full rounded-xl border border-borde bg-hueso px-3 text-base font-bold text-tinta outline-none focus:border-acento"
          />
        </label>
        <label className="text-xs font-semibold text-gris">
          Domingo
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={domingo}
            onChange={(e) => setDomingo(e.target.value)}
            onBlur={() => cambiado && onGuardar(sku, fila, cantidad, domingo)}
            placeholder="Igual"
            disabled={cantidad === ''}
            className="mt-1 h-11 w-full rounded-xl border border-borde bg-hueso px-3 text-base font-bold text-tinta outline-none focus:border-acento disabled:opacity-40"
          />
        </label>
      </div>
    </li>
  )
}

/**
 * Plan fijo de vitrina por sede y producto — solo la dirección lo edita (la base lo hace cumplir con RLS). Es lo que se
 * produce cada día para tener en tienda, aparte de lo que piden los pedidos. El domingo puede ser una cantidad distinta
 * (vacío = igual que los demás días; 0 = no se produce el domingo).
 */
export default function PlanVitrina() {
  const [sedes, setSedes] = useState([])
  const [sedeId, setSedeId] = useState('')
  const [productos, setProductos] = useState(null)
  const [filas, setFilas] = useState(new Map())
  const [error, setError] = useState(null)
  const [guardado, setGuardado] = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('sedes').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('products').select('id, nombre, modo_produccion, area_produccion, product_sizes(id, tamano, precio, modo_produccion, visible_publico)').order('nombre'),
    ]).then(([s, p]) => {
      if (s.error || p.error) return setError((s.error ?? p.error).message)
      setSedes(s.data)
      setProductos(p.data)
      if (s.data.length) setSedeId(s.data[0].id)
    })
  }, [])

  const cargarFilas = (sede) => {
    if (!sede) return
    supabase
      .from('plan_vitrina')
      .select('id, product_id, product_size_id, cantidad, cantidad_domingo, actualizado_en')
      .eq('sede_id', sede)
      .then(({ data, error: err }) => {
        if (err) return setError(err.message)
        setFilas(new Map(data.map((f) => [f.product_size_id ? `${f.product_id}:${f.product_size_id}` : f.product_id, f])))
      })
  }
  useEffect(() => cargarFilas(sedeId), [sedeId])

  const skus = useMemo(() => (productos ? armarSkus(productos) : []), [productos])

  const guardar = async (sku, fila, cantidadTxt, domingoTxt) => {
    setError(null)
    setGuardado(null)
    const cantidad = cantidadTxt === '' ? null : Number(cantidadTxt)
    const domingo = domingoTxt === '' ? null : Number(domingoTxt)
    const invalido = (n) => n !== null && (!Number.isInteger(n) || n < 0)
    if (invalido(cantidad) || invalido(domingo)) return setError('Las cantidades tienen que ser números enteros, 0 o más.')

    let resultado
    if (cantidad === null) {
      // Sin cantidad = sin plan para ese producto.
      resultado = fila ? await supabase.from('plan_vitrina').delete().eq('id', fila.id) : { error: null }
    } else if (fila) {
      resultado = await supabase.from('plan_vitrina').update({ cantidad, cantidad_domingo: domingo, actualizado_en: new Date().toISOString() }).eq('id', fila.id)
    } else {
      resultado = await supabase
        .from('plan_vitrina')
        .insert({ sede_id: sedeId, product_id: sku.productId, product_size_id: sku.productSizeId, cantidad, cantidad_domingo: domingo })
    }
    if (resultado.error) return setError(`No se pudo guardar el plan: ${resultado.error.message}`)
    setGuardado(sku.nombre)
    cargarFilas(sedeId)
  }

  const grupos = []
  for (const s of skus) {
    const nombre = nombreDeArea(s.area)
    const g = grupos.find((x) => x.nombre === nombre)
    if (g) g.skus.push(s)
    else grupos.push({ nombre, skus: [s] })
  }

  return (
    <>
      <Portada titulo="Plan de vitrina" subtitulo="Lo que se produce cada día para tener en tienda" accion={false} />
      <Link to="/produccion" className="mt-3 inline-flex h-10 items-center gap-1.5 text-sm font-semibold text-gris">
        <ArrowLeft size={16} aria-hidden="true" />
        Volver a Producción
      </Link>

      {error && <ErrorCarga mensaje={error} />}
      {!productos && !error && <Cargando />}
      {productos && (
        <div className="pb-8">
          <label className="mt-3 block text-sm font-semibold" htmlFor="pv-sede">
            Local
          </label>
          <select
            id="pv-sede"
            value={sedeId}
            onChange={(e) => setSedeId(e.target.value)}
            className="mt-1 h-12 w-full rounded-xl border border-borde bg-hueso px-3 text-base font-semibold outline-none focus:border-acento"
          >
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-gris">Cada día = cantidad fija. Domingo: déjalo vacío si es igual, o pon otra cantidad (0 = no se produce). Se guarda al salir de la casilla.</p>
          <p role="status" className="mt-1 h-4 text-xs font-semibold text-ok">
            {guardado ? `Guardado: ${guardado}` : ''}
          </p>

          {skus.length === 0 ? (
            <Tarjeta className="mt-3 text-center text-sm text-gris">No hay productos marcados para vitrina.</Tarjeta>
          ) : (
            grupos.map((g) => (
              <div key={g.nombre} className="mt-4">
                <h3 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-gris">{g.nombre}</h3>
                <ul className="space-y-2">
                  {g.skus.map((s) => {
                    const fila = filas.get(s.key)
                    return <FilaPlan key={`${sedeId}:${s.key}:${fila?.actualizado_en ?? 'nuevo'}`} sku={s} fila={fila} onGuardar={guardar} />
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </>
  )
}

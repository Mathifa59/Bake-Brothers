import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { traerTodo } from '../lib/datos'
import { listarUnidades, mensajeDeErrorUnidades } from '../lib/unidadesApi'
import { armarSkus } from '../utils/unidades'
import { Cargando, ErrorCarga, Portada } from '../components/bakeos/ui'
import Salidas from '../components/unidades/Salidas'
import Reporte from '../components/unidades/Reporte'
import Precios from '../components/unidades/Precios'

/**
 * Unidades de negocio: la Venta en la calle (le compra a Bake a precio interno y revende) y los Mayoristas (sus órdenes
 * se valorizan al precio interno). Todo lo que sale de producción queda registrado y contado, aunque no se facture.
 *  · Salidas — Administración y Órdenes: planificar el día anterior, confirmar lo que salió y anotar lo que volvió.
 *  · Reporte y Precios — solo Administración: valor a precio interno, pagos y saldo por día; lista de precios internos.
 */
export default function Unidades() {
  const { perfil } = useAuth()
  const esAdmin = perfil?.rol === 'admin'
  const [pestana, setPestana] = useState('salidas')
  const [unidades, setUnidades] = useState(null)
  const [sedes, setSedes] = useState([])
  const [catalogo, setCatalogo] = useState({ productos: [], tamanos: [] })
  const [error, setError] = useState(null)

  useEffect(() => {
    listarUnidades()
      .then((d) => setUnidades(d.unidades))
      .catch((err) => setError(mensajeDeErrorUnidades(err)))
    supabase
      .from('sedes')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => setSedes(data ?? []))
    Promise.all([
      traerTodo(() => supabase.from('products').select('id, nombre, tipo').eq('disponible', true).order('nombre')),
      traerTodo(() => supabase.from('product_sizes').select('id, product_id, tamano, orden, visible_publico').eq('activo', true)),
    ])
      .then(([productos, tamanos]) => setCatalogo({ productos, tamanos }))
      .catch(() => setCatalogo({ productos: [], tamanos: [] }))
  }, [])

  const skus = useMemo(() => armarSkus(catalogo.productos, catalogo.tamanos), [catalogo])
  // Los mayoristas se registran en Órdenes; acá solo se valorizan. Las salidas son de las demás unidades.
  const pestanas = [['salidas', 'Salidas'], ...(esAdmin ? [['reporte', 'Reporte'], ['precios', 'Precios']] : [])]

  return (
    <div className="pb-10">
      <Portada titulo="Unidades" subtitulo="Lo que sale de producción para la calle y los mayoristas, a precio interno." accion={false} />

      {pestanas.length > 1 && (
        <div className="mt-5 grid gap-1.5 rounded-xl bg-borde/60 p-1" style={{ gridTemplateColumns: `repeat(${pestanas.length}, minmax(0, 1fr))` }} role="tablist" aria-label="Unidades">
          {pestanas.map(([id, texto]) => (
            <button key={id} type="button" role="tab" aria-selected={pestana === id} onClick={() => setPestana(id)} className={`min-h-11 rounded-lg text-sm font-semibold transition-colors ${pestana === id ? 'bg-hueso shadow-sm' : 'text-gris'}`}>
              {texto}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4">
        {error && <ErrorCarga mensaje={error} />}
        {!unidades && !error && <Cargando texto="Cargando…" />}
        {unidades && pestana === 'salidas' && <Salidas unidades={unidades} sedes={sedes} skus={skus} esAdmin={esAdmin} />}
        {unidades && esAdmin && pestana === 'reporte' && <Reporte unidades={unidades} />}
        {unidades && esAdmin && pestana === 'precios' && <Precios unidades={unidades} />}
      </div>
    </div>
  )
}

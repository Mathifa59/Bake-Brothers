import { usePedidos } from '../hooks/usePedidos'
import TablaPedidos from '../components/TablaPedidos'

export default function Pedidos() {
  const { pedidos, error, guardando, cambiarEstado } = usePedidos()

  if (error) return <p className="p-6 text-sm text-red-600">Error al cargar pedidos: {error}</p>
  if (!pedidos) return <p className="p-6 text-sm text-gris">Cargando pedidos…</p>

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-bold">Pedidos</h1>
      <TablaPedidos pedidos={pedidos} guardando={guardando} onCambiarEstado={cambiarEstado} />
    </div>
  )
}

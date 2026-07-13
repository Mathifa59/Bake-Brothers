// Colores Tailwind por estado legible del pedido (UI pura, no dominio).
// Las claves corresponden a lo que devuelve estadoLegible() de @bakebrothers/domain.

export const coloresEstado = {
  Pendiente: 'bg-amber-100 text-amber-800',
  'Pendiente de pago': 'bg-amber-100 text-amber-800',
  Confirmado: 'bg-sky-100 text-sky-800',
  Pagado: 'bg-teal-100 text-teal-800',
  'En preparación': 'bg-orange-100 text-orange-800',
  'Listo para recoger': 'bg-violet-100 text-violet-800',
  'En camino': 'bg-violet-100 text-violet-800',
  Entregado: 'bg-emerald-100 text-emerald-800',
  Cancelado: 'bg-red-100 text-red-700',
}

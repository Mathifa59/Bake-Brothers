// Helpers puros de presentación (antes vivían en data/mock.js).

export const formatoPrecio = (n) => `S/ ${Number(n).toFixed(2)}`

export const descuentoDe = (p) =>
  p.precioAnterior ? Math.round((1 - p.precio / p.precioAnterior) * 100) : 0

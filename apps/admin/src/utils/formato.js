export const formatoPrecio = (valor) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(valor)

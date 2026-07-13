import { createContext, useContext, useMemo, useState } from 'react'
import { calcularPrecioLinea, calcularTotales } from '@bakebrothers/domain'

const CartContext = createContext(null)

export function CartProvider({ children }) {
  const [items, setItems] = useState([])
  const [drawerAbierto, setDrawerAbierto] = useState(false)
  const [cupon, setCupon] = useState(null)
  const [ultimoPedido, setUltimoPedido] = useState(null)

  // Cada línea del carrito es única por producto + tamaño + extras
  const claveDe = (productoId, tamano, extras) =>
    `${productoId}|${tamano || ''}|${(extras || []).slice().sort().join(',')}`

  const agregarItem = (producto, cantidad = 1, tamano = null, extras = []) => {
    const clave = claveDe(producto.id, tamano, extras)
    setItems((prev) => {
      const existente = prev.find((i) => i.clave === clave)
      if (existente) {
        return prev.map((i) =>
          i.clave === clave ? { ...i, cantidad: i.cantidad + cantidad } : i
        )
      }
      return [...prev, { clave, producto, cantidad, tamano, extras }]
    })
    setDrawerAbierto(true)
  }

  const quitarItem = (clave) =>
    setItems((prev) => prev.filter((i) => i.clave !== clave))

  const cambiarCantidad = (clave, delta) =>
    setItems((prev) =>
      prev
        .map((i) =>
          i.clave === clave ? { ...i, cantidad: Math.max(0, i.cantidad + delta) } : i
        )
        .filter((i) => i.cantidad > 0)
    )

  const vaciarCarrito = () => {
    setItems([])
    setCupon(null)
  }

  // El cálculo de precios vive en @bakebrothers/domain — única fuente de verdad.
  const precioLinea = (item) =>
    calcularPrecioLinea({
      precioBase: item.producto.precio,
      tamano: item.tamano,
      cantidadExtras: item.extras?.length || 0,
    })

  const totales = useMemo(
    () =>
      calcularTotales({
        lineas: items.map((i) => ({ precioLinea: precioLinea(i), cantidad: i.cantidad })),
        cupon: cupon ? { tipo: 'porcentaje', valor: 10 } : null,
      }),
    [items, cupon]
  )

  const cantidadTotal = items.reduce((acc, i) => acc + i.cantidad, 0)

  const aplicarCupon = (codigo) => {
    if (codigo.trim().toUpperCase() === 'BAKE10') {
      setCupon({ codigo: 'BAKE10', descripcion: '10% de descuento' })
      return true
    }
    return false
  }

  return (
    <CartContext.Provider
      value={{
        items,
        cantidadTotal,
        agregarItem,
        quitarItem,
        cambiarCantidad,
        vaciarCarrito,
        precioLinea,
        totales,
        cupon,
        aplicarCupon,
        quitarCupon: () => setCupon(null),
        drawerAbierto,
        abrirDrawer: () => setDrawerAbierto(true),
        cerrarDrawer: () => setDrawerAbierto(false),
        ultimoPedido,
        setUltimoPedido,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => useContext(CartContext)

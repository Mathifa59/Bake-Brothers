import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'

// Catálogo del tenant cargado desde la API (o del catálogo local en modo
// demo). `ofertas` y `destacados` se derivan del array de productos.
const CatalogContext = createContext(null)

export function CatalogProvider({ children }) {
  const [productos, setProductos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const cargar = () => {
    setCargando(true)
    setError(null)
    Promise.all([api.getProductos(), api.getCategorias()])
      .then(([p, c]) => {
        setProductos(p)
        setCategorias(c)
      })
      .catch((e) => setError(e))
      .finally(() => setCargando(false))
  }

  useEffect(cargar, [])

  const ofertas = useMemo(() => productos.filter((p) => p.precioAnterior), [productos])
  const destacados = useMemo(() => productos.filter((p) => p.popular).slice(0, 8), [productos])

  return (
    <CatalogContext.Provider
      value={{ productos, categorias, ofertas, destacados, cargando, error, recargar: cargar }}
    >
      {children}
    </CatalogContext.Provider>
  )
}

export const useCatalogo = () => useContext(CatalogContext)

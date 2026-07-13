import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'

// Catálogo del tenant cargado desde la API (reemplaza los arrays de mock.js).
// `ofertas` y `destacados` se derivan igual que lo hacía mock.js a nivel de módulo.
const CatalogContext = createContext(null)

export function CatalogProvider({ children }) {
  const [productos, setProductos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [distritos, setDistritos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const cargar = () => {
    setCargando(true)
    setError(null)
    Promise.all([api.getProductos(), api.getCategorias(), api.getDistritos()])
      .then(([p, c, d]) => {
        setProductos(p)
        setCategorias(c)
        setDistritos(d)
      })
      .catch((e) => setError(e))
      .finally(() => setCargando(false))
  }

  useEffect(cargar, [])

  const ofertas = useMemo(() => productos.filter((p) => p.precioAnterior), [productos])
  const destacados = useMemo(() => productos.filter((p) => p.popular).slice(0, 8), [productos])

  return (
    <CatalogContext.Provider
      value={{ productos, categorias, distritos, ofertas, destacados, cargando, error, recargar: cargar }}
    >
      {children}
    </CatalogContext.Provider>
  )
}

export const useCatalogo = () => useContext(CatalogContext)

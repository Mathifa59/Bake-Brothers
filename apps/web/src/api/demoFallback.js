// Respaldo local: se activa cuando la API (apps/api) no está configurada —
// hoy es el caso siempre (VITE_API_URL sin definir), así que la tienda
// funciona como vitrina informativa con el catálogo de data/mock.js.
import { productos as productosMock, categorias as categoriasMock } from '../data/mock'

export const getProductos = () => Promise.resolve(productosMock)

export const getProducto = (id) => Promise.resolve(productosMock.find((p) => p.id === id) ?? null)

export const getCategorias = () => Promise.resolve(categoriasMock)

// Respaldo local: se activa SOLO cuando la API (apps/api) es inalcanzable por
// red (p. ej. en producción, mientras no tenga despliegue público). Reproduce
// el mismo catálogo y la misma simulación de pedido que existían antes de
// conectar Postgres, con las mismas formas de datos (DTOs) que ya devuelve la
// API real, para que ninguna página tenga que saber en qué modo está.
import { calcularPrecioLinea, calcularTotales } from '@bakebrothers/domain'
import {
  productos as productosMock,
  categorias as categoriasMock,
  distritos as distritosMock,
  pedidosSimulados,
  extrasDisponibles,
} from '../data/mock'

const precioDeExtra = (slug) => extrasDisponibles.find((e) => e.slug === slug)?.precio ?? 8

// ——— Catálogo ———
export const getProductos = () => Promise.resolve(productosMock)

export const getProducto = (id) => Promise.resolve(productosMock.find((p) => p.id === id) ?? null)

export const getCategorias = () => Promise.resolve(categoriasMock)

export const getDistritos = () => Promise.resolve(distritosMock)

export const getDisponibilidad = (fecha, tipo) =>
  Promise.resolve({ fecha, tipo, cupoMaximo: null, unidadesReservadas: 0, cupoDisponible: null })

// ——— Pedidos (en memoria; solo dura mientras la pestaña sigue abierta) ———
const estadoDeMock = (estado) => (estado === 'Pendiente' ? 'Confirmado' : estado)

const parseEntrega = (texto) =>
  texto.startsWith('Delivery — ')
    ? { tipoEntrega: 'delivery', distrito: texto.replace('Delivery — ', '') }
    : { tipoEntrega: 'tienda', distrito: null }

let pedidosDemo = pedidosSimulados.map((p, i) => {
  const { tipoEntrega, distrito } = parseEntrega(p.entrega)
  return {
    numero: p.id,
    estado: 'confirmed',
    estadoLegible: estadoDeMock(p.estado),
    canal: 'web',
    tipoEntrega,
    distrito,
    direccion: null,
    fechaEntrega: p.fecha,
    horario: '',
    nota: null,
    metodoPago: 'contraentrega',
    cuponCodigo: null,
    subtotal: p.total,
    descuentoCupon: 0,
    delivery: 0,
    total: p.total,
    creadoEn: new Date(Date.now() - (pedidosSimulados.length - i) * 86_400_000).toISOString(),
    cliente: { nombre: 'Mathias Vásquez', telefono: '987654321' },
    items: p.items.map((it) => ({ ...it, tamano: null, extras: [] })),
  }
})

export const getPedidos = () =>
  Promise.resolve([...pedidosDemo].sort((a, b) => new Date(b.creadoEn) - new Date(a.creadoEn)))

export const getPedido = (numero) =>
  Promise.resolve(pedidosDemo.find((p) => p.numero === numero) ?? null)

// Misma forma de respuesta que `POST /api/orders` (201), calculada en el
// cliente con el mismo paquete de dominio que usa la API real.
export const crearPedido = (pedido) => {
  const productosPorId = new Map(productosMock.map((p) => [p.id, p]))

  const itemsValorizados = pedido.items.map((item) => {
    const producto = productosPorId.get(item.productoId)
    const precioUnitario = calcularPrecioLinea({
      precioBase: producto?.precio ?? 0,
      tamano: item.tamano,
      preciosExtras: item.extras.map(precioDeExtra),
    })
    return {
      nombre: producto?.nombre ?? item.productoId,
      cantidad: item.cantidad,
      precio: precioUnitario,
      tamano: item.tamano,
      extras: item.extras,
      emoji: producto?.emoji ?? '🧁',
    }
  })

  const totales = calcularTotales({
    lineas: itemsValorizados.map((i) => ({ precioLinea: i.precio, cantidad: i.cantidad })),
    cupon: pedido.cuponCodigo === 'BAKE10' ? { tipo: 'porcentaje', valor: 10 } : null,
    tarifaDelivery: pedido.tipoEntrega === 'tienda' ? 0 : undefined,
  })

  const numero = `BB-${Math.floor(2450 + Math.random() * 500)}`
  pedidosDemo = [
    {
      numero,
      estado: 'confirmed',
      estadoLegible: 'Confirmado',
      canal: 'web',
      tipoEntrega: pedido.tipoEntrega,
      distrito: pedido.distrito ?? null,
      direccion: pedido.direccion ?? null,
      fechaEntrega: pedido.fechaEntrega,
      horario: pedido.horario,
      nota: pedido.nota ?? null,
      metodoPago: pedido.metodoPago,
      cuponCodigo: pedido.cuponCodigo ?? null,
      creadoEn: new Date().toISOString(),
      cliente: { nombre: pedido.cliente.nombre, telefono: pedido.cliente.telefono },
      items: itemsValorizados,
      ...totales,
    },
    ...pedidosDemo,
  ]

  return Promise.resolve({ numero, estado: 'confirmed', ...totales, items: itemsValorizados })
}

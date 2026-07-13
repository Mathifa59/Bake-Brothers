import { useEffect } from 'react'
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom'
import { CartProvider } from './context/CartContext'
import { CatalogProvider, useCatalogo } from './context/CatalogContext'
import Header from './components/Header'
import Footer from './components/Footer'
import CartDrawer from './components/CartDrawer'
import WhatsAppFloat from './components/WhatsAppFloat'
import Home from './pages/Home'
import Catalogo from './pages/Catalogo'
import ProductoDetalle from './pages/ProductoDetalle'
import Carrito from './pages/Carrito'
import Checkout from './pages/Checkout'
import Ofertas from './pages/Ofertas'
import Catering from './pages/Catering'
import Nosotros from './pages/Nosotros'
import Contacto from './pages/Contacto'
import { Login, Registro, Recuperar } from './pages/Auth'
import { MiCuenta, MisPedidos, PedidoDetalle } from './pages/Cuenta'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

// Espera el catálogo antes de montar las rutas (los datos ahora llegan de la API).
function CatalogGate({ children }) {
  const { cargando, error, recargar } = useCatalogo()
  if (cargando) {
    return (
      <div className="grid min-h-screen place-items-center bg-crema">
        <div className="text-center">
          <span className="anim-float inline-block text-7xl">🧁</span>
          <p className="mt-4 font-display text-xl font-semibold text-tinta">Horneando el catálogo…</p>
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-crema px-4">
        <div className="max-w-md rounded-3xl border border-borde/60 bg-white p-8 text-center shadow-sm">
          <span className="text-6xl">🫥</span>
          <h1 className="mt-4 font-display text-2xl font-semibold">No pudimos cargar la tienda</h1>
          <p className="mt-2 text-sm text-gris">
            Verifica que la API esté corriendo (<code>pnpm dev:api</code>) e inténtalo de nuevo.
          </p>
          <button
            onClick={recargar}
            className="mt-5 rounded-full bg-acento px-6 py-3 text-sm font-bold text-white transition-all hover:brightness-105 active:scale-[0.98] cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }
  return children
}

export default function App() {
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CatalogProvider>
      <CartProvider>
        <ScrollToTop />
        <CatalogGate>
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/catalogo" element={<Catalogo />} />
              <Route path="/producto/:id" element={<ProductoDetalle />} />
              <Route path="/carrito" element={<Carrito />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/ofertas" element={<Ofertas />} />
              <Route path="/catering" element={<Catering />} />
              <Route path="/nosotros" element={<Nosotros />} />
              <Route path="/contacto" element={<Contacto />} />
              <Route path="/login" element={<Login />} />
              <Route path="/registro" element={<Registro />} />
              <Route path="/recuperar" element={<Recuperar />} />
              <Route path="/cuenta" element={<MiCuenta />} />
              <Route path="/cuenta/pedidos" element={<MisPedidos />} />
              <Route path="/cuenta/pedidos/:id" element={<PedidoDetalle />} />
              <Route path="*" element={<Home />} />
            </Routes>
          </main>
          <Footer />
          <CartDrawer />
          <WhatsAppFloat />
        </div>
        </CatalogGate>
      </CartProvider>
      </CatalogProvider>
    </HashRouter>
  )
}

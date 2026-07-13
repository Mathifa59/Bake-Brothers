import { useEffect } from 'react'
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom'
import { CartProvider } from './context/CartContext'
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

export default function App() {
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CartProvider>
        <ScrollToTop />
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
      </CartProvider>
    </HashRouter>
  )
}

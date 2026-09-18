import { HashRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Pedidos from './pages/Pedidos'
import Stock from './pages/Stock'
import Clientes from './pages/Clientes'
import Atribucion from './pages/Atribucion'
import Conversaciones from './pages/Conversaciones'

function Layout({ children }) {
  const { perfil, logout } = useAuth()
  const location = useLocation()
  const enlace = (ruta, texto) => (
    <Link
      to={ruta}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
        location.pathname === ruta ? 'bg-tinta text-white' : 'text-tinta/70 hover:bg-borde/40'
      }`}
    >
      {texto}
    </Link>
  )
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-borde/60 bg-white px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="font-bold">Bake Brothers</span>
          {enlace('/pedidos', 'Pedidos')}
          {enlace('/stock', 'Stock')}
          {enlace('/clientes', 'Clientes')}
          {enlace('/atribucion', 'Atribución')}
          {enlace('/conversaciones', 'Conversaciones')}
        </div>
        <div className="flex items-center gap-3 text-sm text-gris">
          <span className="capitalize">{perfil?.rol}</span>
          <button onClick={logout} className="rounded-full border border-borde px-3 py-1.5 font-semibold hover:bg-borde/30">
            Salir
          </button>
        </div>
      </header>
      {children}
    </div>
  )
}

// Espera a saber si hay sesión y, si la hay, a leer el perfil (rol/sede) en
// usuarios_dashboard antes de decidir qué mostrar.
function ConGuardia({ children }) {
  const { session, perfil, cargando } = useAuth()

  if (cargando) {
    return <div className="grid min-h-screen place-items-center text-sm text-gris">Cargando…</div>
  }
  if (!session) return <Navigate to="/login" replace />
  if (!perfil) {
    return (
      <div className="grid min-h-screen place-items-center px-4 text-center">
        <div>
          <p className="font-bold">Tu cuenta no tiene acceso al panel.</p>
          <p className="mt-1 text-sm text-gris">Pedile a un admin que te dé de alta en usuarios_dashboard.</p>
        </div>
      </div>
    )
  }
  return <Layout>{children}</Layout>
}

function RutaLogin() {
  const { session, cargando } = useAuth()
  if (cargando) return null
  if (session) return <Navigate to="/pedidos" replace />
  return <Login />
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<RutaLogin />} />
          <Route path="/pedidos" element={<ConGuardia><Pedidos /></ConGuardia>} />
          <Route path="/stock" element={<ConGuardia><Stock /></ConGuardia>} />
          <Route path="/clientes" element={<ConGuardia><Clientes /></ConGuardia>} />
          <Route path="/atribucion" element={<ConGuardia><Atribucion /></ConGuardia>} />
          <Route path="/conversaciones" element={<ConGuardia><Conversaciones /></ConGuardia>} />
          <Route path="*" element={<Navigate to="/pedidos" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}

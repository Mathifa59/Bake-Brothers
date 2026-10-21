import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import LayoutBakeOS from './components/bakeos/LayoutBakeOS'
import Login from './pages/Login'
import Resumen from './pages/Resumen'
import ControlTower from './pages/ControlTower'
import Pedidos from './pages/Pedidos'
import NuevoPedido from './pages/NuevoPedido'
import Produccion from './pages/Produccion'
import Stock from './pages/Stock'
import Clientes from './pages/Clientes'
import Atencion from './pages/Atencion'
import Atribucion from './pages/Atribucion'
import Conversaciones from './pages/Conversaciones'
import Metricas from './pages/Metricas'
import Simulador from './pages/Simulador'

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
          <p className="mt-1 text-sm text-gris">Pídele a un admin que te dé de alta en usuarios_dashboard.</p>
        </div>
      </div>
    )
  }
  return <LayoutBakeOS>{children}</LayoutBakeOS>
}

function RutaLogin() {
  const { session, cargando } = useAuth()
  if (cargando) return null
  if (session) return <Navigate to="/resumen" replace />
  return <Login />
}

const protegida = (elemento) => <ConGuardia>{elemento}</ConGuardia>

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<RutaLogin />} />
          <Route path="/resumen" element={protegida(<Resumen />)} />
          <Route path="/control-tower" element={protegida(<ControlTower />)} />
          <Route path="/pedidos" element={protegida(<Pedidos />)} />
          <Route path="/nuevo-pedido" element={protegida(<NuevoPedido />)} />
          <Route path="/produccion" element={protegida(<Produccion />)} />
          <Route path="/stock" element={protegida(<Stock />)} />
          <Route path="/clientes" element={protegida(<Clientes />)} />
          <Route path="/atencion" element={protegida(<Atencion />)} />
          <Route path="/conversaciones" element={protegida(<Conversaciones />)} />
          <Route path="/metricas" element={protegida(<Metricas />)} />
          <Route path="/atribucion" element={protegida(<Atribucion />)} />
          <Route path="/simulador" element={protegida(<Simulador />)} />
          <Route path="*" element={<Navigate to="/resumen" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}

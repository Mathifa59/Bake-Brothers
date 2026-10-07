import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

// session: la sesión de Supabase Auth (null = no logueado).
// perfil: { rol, sedeId, sedeNombre, nombre } leído de usuarios_dashboard tras el login — null
// mientras carga, o si el usuario se autenticó pero no tiene fila ahí (no
// tiene acceso al panel, aunque su login en Supabase Auth sea válido).
export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = todavía no se sabe
  const [perfil, setPerfil] = useState(null)
  const [cargandoPerfil, setCargandoPerfil] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, nuevaSession) => {
      setSession(nuevaSession)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Depende del ID del usuario, no del objeto `session`: supabase-js emite un
  // evento (SIGNED_IN/TOKEN_REFRESHED) con una sesión nueva cada vez que la
  // pestaña vuelve a primer plano, y con el objeto como dependencia eso
  // volvía a "Cargando…" y reiniciaba TODA la pantalla (y sus consultas) sin
  // que cambiara nada del usuario.
  const userId = session?.user?.id
  useEffect(() => {
    if (!userId) {
      setPerfil(null)
      return
    }
    setCargandoPerfil(true)
    // `nombre` (migración 0031) es opcional. Si el panel llega a producción
    // antes que esa migración, la consulta con la columna falla — en vez de
    // dejar a todo el equipo sin acceso, se reintenta sin ella (saludo
    // genérico) hasta que la migración esté aplicada.
    const leerPerfil = async () => {
      const consulta = (columnas) =>
        supabase.from('usuarios_dashboard').select(columnas).eq('id', userId).maybeSingle()
      let { data, error } = await consulta('rol, sede_id, nombre, sedes(nombre)')
      if (error && /nombre/i.test(error.message) && /column|columna/i.test(error.message)) {
        ;({ data, error } = await consulta('rol, sede_id, sedes(nombre)'))
      }
      if (error) {
        console.error('No se pudo leer usuarios_dashboard', error)
        setPerfil(null)
      } else {
        setPerfil(
          data
            ? { rol: data.rol, sedeId: data.sede_id, sedeNombre: data.sedes?.nombre ?? null, nombre: data.nombre ?? null }
            : null
        )
      }
      setCargandoPerfil(false)
    }
    leerPerfil()
  }, [userId])

  const login = (email, password) => supabase.auth.signInWithPassword({ email, password })
  const logout = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider
      value={{
        session,
        perfil,
        cargando: session === undefined || (session && cargandoPerfil),
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

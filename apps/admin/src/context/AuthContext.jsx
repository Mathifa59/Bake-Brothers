import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

// session: la sesión de Supabase Auth (null = no logueado).
// perfil: { rol, sedeId } leído de usuarios_dashboard tras el login — null
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

  useEffect(() => {
    if (!session) {
      setPerfil(null)
      return
    }
    setCargandoPerfil(true)
    supabase
      .from('usuarios_dashboard')
      .select('rol, sede_id')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('No se pudo leer usuarios_dashboard', error)
          setPerfil(null)
        } else {
          setPerfil(data ? { rol: data.rol, sedeId: data.sede_id } : null)
        }
        setCargandoPerfil(false)
      })
  }, [session])

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

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, CLAVE_DEFINIR_CONTRASENA } from '../lib/supabase'

const AuthContext = createContext(null)

// session: la sesión de Supabase Auth (null = no logueado).
// perfil: { rol, sedeId, sedeNombre, nombre } leído de usuarios_dashboard tras el login — null
// mientras carga, o si el usuario se autenticó pero no tiene fila ahí (no
// tiene acceso al panel, aunque su login en Supabase Auth sea válido).
export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = todavía no se sabe
  const [perfil, setPerfil] = useState(null)
  const [cargandoPerfil, setCargandoPerfil] = useState(false)
  // true cuando la persona llegó por un enlace de invitación o de recuperación: antes de usar el panel tiene que
  // definir su contraseña (ver pages/DefinirContrasena.jsx).
  const [definiendoContrasena, setDefiniendoContrasena] = useState(() => {
    try {
      return sessionStorage.getItem(CLAVE_DEFINIR_CONTRASENA) === '1'
    } catch {
      return false
    }
  })
  const terminarDefinirContrasena = () => {
    try {
      sessionStorage.removeItem(CLAVE_DEFINIR_CONTRASENA)
    } catch {
      // nada que limpiar
    }
    setDefiniendoContrasena(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((evento, nuevaSession) => {
      if (evento === 'PASSWORD_RECOVERY') {
        try {
          sessionStorage.setItem(CLAVE_DEFINIR_CONTRASENA, '1')
        } catch {
          // sin sessionStorage: el estado en memoria alcanza mientras no se recargue
        }
        setDefiniendoContrasena(true)
      }
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

  // Un enlace vencido o ya usado no deja sesión: no hay nada que definir, se vuelve al login normal.
  useEffect(() => {
    if (session === null && definiendoContrasena) terminarDefinirContrasena()
  }, [session, definiendoContrasena])

  const definirContrasena = async (password) => {
    const respuesta = await supabase.auth.updateUser({ password })
    if (!respuesta.error) terminarDefinirContrasena()
    return respuesta
  }

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
        definiendoContrasena: Boolean(session) && definiendoContrasena,
        definirContrasena,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

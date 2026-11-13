import { createClient } from '@supabase/supabase-js'

// La anon key es pública a propósito (ver .env.example) — la seguridad real
// la hacen las políticas RLS activadas en 0011_rls_dashboard.sql, no esta key.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://umyaytrojtbdvdzbrily.supabase.co'
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVteWF5dHJvanRiZHZkemJyaWx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2MjUzMDQsImV4cCI6MjEwNTIwMTMwNH0.wX6Gj7R0HxxSliSgUBjBMx7lWicsvG3BqJY6Gi6VhHA'

// Un enlace de invitación o de recuperación de contraseña entra con la sesión puesta en el `#` de la URL
// (#access_token=…&type=recovery|invite). supabase-js lo consume y lo borra al crearse el cliente, así que se
// anota ANTES de crearlo: el panel tiene que pedir una contraseña nueva en vez de entrar sin ninguna.
export const CLAVE_DEFINIR_CONTRASENA = 'bb_definir_contrasena'
try {
  const hash = window.location.hash
  if (/access_token=/.test(hash) && /type=(recovery|invite)\b/.test(hash)) sessionStorage.setItem(CLAVE_DEFINIR_CONTRASENA, '1')
} catch {
  // sin sessionStorage (modo privado estricto): el evento PASSWORD_RECOVERY de supabase-js cubre el caso de recuperación
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

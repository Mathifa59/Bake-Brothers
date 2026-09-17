import { createClient } from '@supabase/supabase-js'

// La anon key es pública a propósito (ver .env.example) — la seguridad real
// la hacen las políticas RLS activadas en 0011_rls_dashboard.sql, no esta key.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://umyaytrojtbdvdzbrily.supabase.co'
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVteWF5dHJvanRiZHZkemJyaWx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2MjUzMDQsImV4cCI6MjEwNTIwMTMwNH0.wX6Gj7R0HxxSliSgUBjBMx7lWicsvG3BqJY6Gi6VhHA'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

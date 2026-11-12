/**
 * Funciones del panel que existen en el código pero están apagadas hasta que se necesiten.
 * Se activan con una variable de Vite al construir (Vercel → Environment Variables → Redeploy).
 *
 * VITE_MIFACT_ACTIVO=true  → vuelve el menú «Mifact» (importador del catálogo) y su ruta. Solo admin.
 */
export const MIFACT_ACTIVO = import.meta.env.VITE_MIFACT_ACTIVO === 'true'

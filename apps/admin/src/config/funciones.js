/**
 * Funciones del panel que existen en el código pero están apagadas hasta que se necesiten.
 * Se activan con una variable de Vite al construir (Vercel → Environment Variables → Redeploy).
 *
 * VITE_MIFACT_ACTIVO=true      → aparece el botón «Comprobante» (emitir boleta o factura) en cada pedido facturable.
 *                                Solo administración.
 * VITE_MIFACT_IMPORTADOR=true  → aparece la pestaña «Códigos de Mifact» dentro de Catálogo (importar los códigos de
 *                                producto desde el Excel de Mifact). Solo administración. Apagada a propósito: la tabla
 *                                de códigos se identifica por almacén y no por empresa, así que no debe usarse con el
 *                                Excel de Santa Marina hasta ajustarla (ver CLAUDE.md, «Pendiente: códigos de Mifact»).
 */
export const MIFACT_ACTIVO = import.meta.env.VITE_MIFACT_ACTIVO === 'true'
export const MIFACT_IMPORTADOR = import.meta.env.VITE_MIFACT_IMPORTADOR === 'true'

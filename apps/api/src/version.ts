/**
 * Versión (commit) del código que está corriendo, para poder verificar desde fuera —sin entrar a Coolify— qué
 * despliegue está arriba: `GET /health` → `{"ok":true,"commit":"25a7044"}`.
 *
 * Coolify entrega el commit desplegado como SOURCE_COMMIT (el Dockerfile lo recibe además como argumento de
 * construcción). Solo se expone el hash corto (7 caracteres hexadecimales): un valor que no tenga forma de hash se
 * descarta, nunca se devuelve tal cual lo que haya en la variable. Sin variable: «desconocido».
 */
export function commitDesplegado(entorno: NodeJS.ProcessEnv = process.env): string {
  const crudo = (entorno.SOURCE_COMMIT ?? entorno.GIT_COMMIT_SHA ?? '').trim()
  return /^[0-9a-f]{7,40}$/i.test(crudo) ? crudo.slice(0, 7).toLowerCase() : 'desconocido'
}

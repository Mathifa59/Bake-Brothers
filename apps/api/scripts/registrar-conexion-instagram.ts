/**
 * Conecta la cuenta de Instagram de Bake Brothers a las respuestas automáticas (tabla instagram_conexion). Igual que
 * whatsapp:registrar: el token va por variable de entorno (no por argumento, para que no quede en el historial del shell)
 * y se guarda cifrado con WHATSAPP_TOKEN_ENCRYPTION_KEY. Pasos completos en docs/respuestas-automaticas-instagram.md.
 *
 * Desde apps/api, con DATABASE_URL y WHATSAPP_TOKEN_ENCRYPTION_KEY en .env:
 *
 *   Token de usuario del sistema / de página (recomendado, no vence):
 *     INSTAGRAM_TOKEN_A_REGISTRAR=<token> pnpm instagram:registrar -- \
 *       --ig <id de la cuenta de Instagram> --page <id de la página de Facebook> --usuario bakebrothers.pe
 *
 *   Token de «Instagram API con inicio de sesión de Instagram» (vence a los 60 días):
 *     INSTAGRAM_TOKEN_A_REGISTRAR=<token> pnpm instagram:registrar -- --ig <id> --tipo instagram_login --usuario bakebrothers.pe
 */
import { parseArgs } from 'node:util'
import { pool } from '../src/db.js'
import { cifrarTokenWhatsApp } from '../src/bot/tokensWhatsApp.js'
import { guardarConexionInstagram } from '../src/repositories/respuestasAutomaticasRepo.js'

const { values } = parseArgs({
  options: {
    ig: { type: 'string' },
    page: { type: 'string' },
    usuario: { type: 'string' },
    tipo: { type: 'string', default: 'facebook_login' },
  },
})

const token = process.env.INSTAGRAM_TOKEN_A_REGISTRAR
const tipo = values.tipo
if (tipo !== 'facebook_login' && tipo !== 'instagram_login') {
  console.error('--tipo debe ser "facebook_login" (por defecto) o "instagram_login".')
  process.exit(1)
}
if (!values.ig || !token || (tipo === 'facebook_login' && !values.page)) {
  console.error('Faltan datos: --ig, la variable INSTAGRAM_TOKEN_A_REGISTRAR y, con facebook_login, --page.')
  process.exit(1)
}

try {
  await guardarConexionInstagram(pool, {
    igUserId: values.ig,
    usuario: values.usuario?.replace(/^@/, '') ?? null,
    tipo,
    pageId: values.page ?? null,
    tokenCifrado: cifrarTokenWhatsApp(token),
  })
  console.log(`Instagram conectado: ${values.usuario ? '@' + values.usuario.replace(/^@/, '') : values.ig} (${tipo}).`)
} finally {
  await pool.end()
}

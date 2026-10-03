import { z } from 'zod'
import { parsearClaveCifrado } from './bot/cifrado.js'

const schema = z
  .object({
    DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
    PORT: z.coerce.number().default(3001),
    DEFAULT_TENANT_SLUG: z.string().default('bake-brothers'),
    NODE_ENV: z.string().optional(),
    // Token que Meta manda en la verificación GET /webhook (hub.verify_token).
    // Lo definimos nosotros, no Meta — se pega tal cual en el dashboard de la
    // app de Meta cuando se configure el webhook (Semana 2, con credenciales reales).
    META_VERIFY_TOKEN: z.string().min(1).default('cambiame'),
    // Versión de la Graph API para las llamadas a Meta (envío, intercambio de
    // código, suscripción…). Configurable para no recompilar al subir de versión.
    META_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/, 'META_GRAPH_VERSION debe verse como v21.0').default('v21.0'),
    // Clave AES-256 (32 bytes en hex o base64) con la que se cifran en la base los
    // tokens de negocio de WhatsApp (whatsapp_conexiones.token_cifrado). OBLIGATORIA
    // en producción — ver superRefine abajo. Generar una:
    //   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    WHATSAPP_TOKEN_ENCRYPTION_KEY: z.string().optional(),
    // Coexistence: horas sin mensajes humanos tras las que el bot retoma una
    // conversación que un humano atendió desde el celular (echo). Ver
    // debeAutoRetornarAlBot en packages/domain.
    AUTO_RETORNO_BOT_HORAS: z.coerce.number().positive().default(3),
  })
  .superRefine((valores, ctx) => {
    const clave = valores.WHATSAPP_TOKEN_ENCRYPTION_KEY
    if (clave !== undefined && clave !== '' && !parsearClaveCifrado(clave)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['WHATSAPP_TOKEN_ENCRYPTION_KEY'],
        message: 'debe ser una clave AES-256 válida: 32 bytes en hex (64 caracteres) o base64',
      })
    }
    // Falla al ARRANCAR, no al primer envío: sin clave, ninguna respuesta del
    // bot ni de la bandeja podría salir, y descubrirlo recién cuando llega un
    // cliente real es tarde.
    if (valores.NODE_ENV === 'production' && (clave === undefined || clave === '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['WHATSAPP_TOKEN_ENCRYPTION_KEY'],
        message: 'es obligatoria en producción (cifra los tokens de negocio de WhatsApp)',
      })
    }
  })

// safeParse + mensaje legible en vez de un ZodError crudo: lo que se ve en los
// logs de Coolify cuando la API no arranca tiene que decir QUÉ variable falta.
const resultado = schema.safeParse(process.env)
if (!resultado.success) {
  const detalle = resultado.error.issues.map((i) => `  - ${i.path.join('.') || '(general)'}: ${i.message}`).join('\n')
  throw new Error(`Configuración de entorno inválida — la API no arranca:\n${detalle}`)
}

export const env = resultado.data

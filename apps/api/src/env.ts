import { z } from 'zod'
import { parsearClaveCifrado } from './bot/cifrado.js'

// Texto libre de una variable de entorno: recortado, y la secuencia literal «barra + n» (dos caracteres) se vuelve un
// salto de línea (así se puede escribir en una sola línea en Coolify y que el cliente lo vea en varias líneas en WhatsApp).
const textoLibre = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === undefined ? v : v.split(String.raw`\n`).join('\n')))

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
    // Distritos a los que se hace delivery de TIENDA (lista separada por comas). Configuración del negocio:
    // el valor por defecto es el de la ficha real (catalogo-real-bake-brothers.md, sección 0). El bot no
    // toma un pedido de delivery a un distrito que no esté acá. Una lista vacía desactiva la restricción.
    DISTRITOS_DELIVERY: z
      .string()
      .default('Chorrillos, Surco, Miraflores, San Isidro, Villa el Salvador, San Juan de Miraflores, La Victoria, Jesús María, Lince'),
    // Modelo de Claude de la conversación del bot y de la lectura de capturas de pago (ver bot/modelos.ts). Vacío =
    // Sonnet (el probado). Pasar a Haiku: BOT_MODELO=claude-haiku-5-5 (después de volver a probar, docs/cambio-a-haiku.md).
    BOT_MODELO: z.string().trim().optional(),
    BOT_MODELO_CAPTURAS: z.string().trim().optional(),
    // Datos para pagar por adelantado (texto libre: Yape, BCP, Interbank y su titular). Hay DOS razones sociales
    // (ver packages/domain/src/cobros.ts):
    //   · DATOS_PAGO        = Baker Brothers E.I.R.L. → recojo en Santa Marina (y todo delivery, que lo cobra una persona).
    //   · DATOS_PAGO_CEDROS = Corporación Hermanos Loarte S.A.C. → recojo en Cedros.
    // Si el que corresponde está, el bot se los da al cliente apenas registra el pedido; si NO está, el bot avisa que
    // una persona se los envía y la conversación pasa al equipo. NUNCA se usan los de una razón social para el local de
    // la otra. No llevan secretos, pero tampoco van en el código. Texto libre en una línea: la secuencia «barra n» se vuelve salto de línea.
    DATOS_PAGO: textoLibre,
    DATOS_PAGO_CEDROS: textoLibre,
    // Embedded Signup de Meta (conectar números desde el dashboard): NO se terminó de construir y el plan
    // vigente no lo usa (el número del bot se registra a mano). Reservado y APAGADO; hoy ninguna ruta lo lee.
    WHATSAPP_EMBEDDED_SIGNUP: z.enum(['true', 'false']).default('false'),
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
    // Ya NO es obligatoria para arrancar (2026-11-13): mientras no haya un número de WhatsApp conectado no hay ningún
    // token que cifrar, y la API (panel, pedidos, conversaciones a mano) tiene que funcionar sin WhatsApp. Si falta,
    // server.ts lo avisa en el log (ver avisosDeArranque.ts) y claveCifradoTokens() falla visible al primer uso real
    // (registrar o usar un token), nunca devuelve una clave inventada. Si está, sí tiene que ser válida (arriba).
  })

// safeParse + mensaje legible en vez de un ZodError crudo: lo que se ve en los
// logs de Coolify cuando la API no arranca tiene que decir QUÉ variable falta.
const resultado = schema.safeParse(process.env)
if (!resultado.success) {
  const detalle = resultado.error.issues.map((i) => `  - ${i.path.join('.') || '(general)'}: ${i.message}`).join('\n')
  throw new Error(`Configuración de entorno inválida — la API no arranca:\n${detalle}`)
}

export const env = resultado.data

import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  PORT: z.coerce.number().default(3001),
  DEFAULT_TENANT_SLUG: z.string().default('bake-brothers'),
  ADMIN_KEY: z.string().min(1).default('cambiame'),
  // Token que Meta manda en la verificación GET /webhook (hub.verify_token).
  // Lo definimos nosotros, no Meta — se pega tal cual en el dashboard de la
  // app de Meta cuando se configure el webhook (Semana 2, con credenciales reales).
  META_VERIFY_TOKEN: z.string().min(1).default('cambiame'),
})

export const env = schema.parse(process.env)

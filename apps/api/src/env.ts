import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  PORT: z.coerce.number().default(3001),
  DEFAULT_TENANT_SLUG: z.string().default('bake-brothers'),
  ADMIN_KEY: z.string().min(1).default('cambiame'),
})

export const env = schema.parse(process.env)

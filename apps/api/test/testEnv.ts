// DATABASE_URL "de mentira" que vitest.config.ts inyecta cuando nadie pasa
// una real. env.ts exige DATABASE_URL para no explotar al importarse —
// incluso rutas que no tocan la base (GET /webhook) pasan por ahí porque
// importan app.ts. botTools.test.ts compara contra este valor exacto para
// saber si de verdad hay un Postgres real detrás antes de intentar conectarse.
export const DATABASE_URL_PLACEHOLDER = 'postgresql://localhost:5432/sin-bd-real-solo-tests-sin-bd'

export const META_VERIFY_TOKEN_DE_PRUEBA = 'token-de-prueba-webhook'

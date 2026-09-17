# syntax=docker/dockerfile:1
#
# ============================================================================
# Dockerfile — apps/api (Bake Brothers)
#
# apps/api vive en un monorepo pnpm y depende de packages/domain vía
# "workspace:*" — un Dockerfile genérico de Node que solo copie apps/api se
# rompe: @bakebrothers/domain no existiría ni estaría buildeado. Este
# Dockerfile instala el workspace completo y buildea packages/domain ANTES
# que apps/api, en pasos explícitos (no se confía en que `pnpm -r build`
# respete el orden topológico dentro de una sola capa de Docker).
#
# Se construye desde la RAÍZ del repo (no desde apps/api/):
#   docker build -f apps/api/Dockerfile -t bakebrothers-api .
#
# NO corre migraciones al iniciar — eso se hace a mano (Supabase MCP / psql)
# contra la BD real. El CMD solo levanta la API.
# ============================================================================

FROM node:22-alpine AS base
RUN corepack enable

# ---------------------------------------------------------------- deps ----
# Solo manifiestos + lockfile: esta capa solo se invalida cuando cambian
# dependencias, no en cada cambio de código fuente.
FROM base AS deps
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/domain/package.json ./packages/domain/package.json
# --filter "@bakebrothers/api..." = el paquete + todo lo que depende de él
# transitivamente (packages/domain) — instala eso, no apps/web (React/Vite
# no hacen falta para esta imagen), pero pnpm sigue viendo el workspace
# completo (necesita el package.json de apps/web para que el lockfile,
# generado contra el monorepo entero, no quede "desincronizado").
#
# --ignore-scripts: packages/domain tiene un lifecycle "prepare" que corre
# tsc — en esta capa solo copiamos package.json (sin tsconfig.json ni src/,
# a propósito, para que la capa de deps solo se invalide si cambian
# dependencias). El build real de domain/api se hace explícito más abajo.
RUN pnpm install --frozen-lockfile --ignore-scripts --filter "@bakebrothers/api..."

# ---------------------------------------------------------------- build ---
FROM deps AS build
WORKDIR /repo
COPY tsconfig.base.json ./
COPY packages/domain ./packages/domain
COPY apps/api ./apps/api
RUN pnpm --filter @bakebrothers/domain build
RUN pnpm --filter @bakebrothers/api build
# `pnpm deploy` empaqueta apps/api + sus dependencias de workspace ya
# resueltas (packages/domain compilado) en un directorio autocontenido, solo
# con dependencias de producción — sin devDependencies (typescript, tsx) ni
# el resto del monorepo.
RUN pnpm --filter @bakebrothers/api deploy --prod /repo/deploy

# -------------------------------------------------------------- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
# node:22-alpine no trae curl ni un wget que le funcione al healthcheck de
# Coolify (falla con "curl: not found" / "wget: ...Connection refused") —
# lo necesita para poder healthcheckear /health desde dentro del contenedor.
RUN apk add --no-cache curl
WORKDIR /app
COPY --from=build /repo/deploy .
EXPOSE 3001
# DATABASE_URL, PORT, DEFAULT_TENANT_SLUG, ADMIN_KEY: los inyecta Coolify
# como variables de entorno reales del contenedor (ver apps/api/.env.example
# para la lista) — por eso el arranque NO usa `node --env-file=.env` como el
# script "start" de package.json (pensado para local): en producción no hay
# ningún .env en la imagen, y ese flag falla si el archivo no existe.
CMD ["node", "dist/server.js"]

# CLAUDE.md — Bake Brothers

> Documento de contexto persistente del proyecto. Léelo completo al inicio de cada sesión.
> Si tomas una decisión relevante o cambias el rumbo, actualiza este archivo.
> El plan maestro original está en `plan bb.md` (secciones 5-7 describen bot y dashboard).

---

## 1. Qué es esto

Plataforma multi-tenant de pedidos para pastelerías. **Bake Brothers es el tenant #1** de un
producto vendible a cualquier pastelería/restaurante/florería. Tres consumidores sobre un
mismo núcleo:

```
WhatsApp del cliente ──► Servicio de bot ──┐
                                           ├──► API + Postgres ──► Dashboard del negocio
Tienda web (React) ────────────────────────┘
```

### La regla que ordena todo el proyecto

> **El cálculo de precios, la anticipación mínima, la capacidad de producción y la máquina
> de estados viven SOLO en `packages/domain`. El front, la API, el bot y el dashboard lo
> importan. Nunca se duplica esta lógica.**

## 2. Estado actual: FASE 0 COMPLETADA (2026-07-11)

Monorepo pnpm funcionando de punta a punta: la tienda web lee de Postgres vía la API y los
pedidos se registran de verdad.

```
apps/
├── web/        Front React 18 + Vite 6 + Tailwind v4 (JSX, SIN TypeScript — no migrar)
│   ├── src/api/client.js          fetch wrapper (VITE_API_URL, X-Tenant-Slug)
│   ├── src/context/CatalogContext.jsx  productos/categorías/distritos desde la API
│   ├── src/context/CartContext.jsx     carrito; precios vía @bakebrothers/domain
│   ├── src/utils/formato.js       formatoPrecio/descuentoDe (antes en mock.js)
│   └── src/data/mock.js           SOLO queda como fuente de: extrasDisponibles (UI),
│                                  paquetesCatering y testimonios + input del seed.
├── api/        Fastify 5 + zod + pg (TypeScript, ESM)
│   ├── migrations/                0001 esquema+RLS · 0002 seed (GENERADO) · 0003 orden
│   ├── scripts/seed-from-mock.mjs regenera 0002 desde mock.js (no editar 0002 a mano)
│   └── src/                       env, db (withTenantTx), repositories/, routes/
packages/
└── domain/     TS puro sin I/O — ÚNICA fuente de verdad de reglas + tests vitest (48)
    ├── pricing.ts        precioPorTamano, calcularPrecioLinea, calcularTotales…
    ├── availability.ts   cumpleAnticipacionMinima, hayCupoDisponible, cupoRestante
    └── orderStatus.ts    ESTADOS_PEDIDO, puedeTransicionar, estadoLegible
```

**Cómo correr:** `pnpm install` · `pnpm dev` (web :5173) · `pnpm dev:api` (API :3001) ·
`pnpm test`. La API necesita `apps/api/.env` (ver `.env.example`; el `.env` local ya existe
y NO se versiona).

**Supabase:** proyecto `bake-brothers` (id `kxqadxazziybqzqzodrx`, us-east-1, plan free).
La API se conecta por el session pooler con el rol **`app_api`** (no dueño de tablas →
siempre sujeto a RLS). El rol `postgres` (MCP/migraciones) bypassa RLS solo para
administración — mismo modelo que service_role de Supabase.

## 3. Decisiones tomadas (no re-litigar)

| Decisión | Detalle |
|---|---|
| BD | Postgres vía Supabase. RLS habilitado en TODA tabla de negocio con política `tenant_id = current_setting('app.tenant_id')::uuid`. |
| Tenant por request | Header `X-Tenant-Slug` → uuid → `withTenantTx()` abre transacción y fija el GUC `app.tenant_id` (transaccional, no se filtra entre requests del pool). |
| API | Node + TS + Fastify + zod (validación manual con `schema.parse`, sin type-providers). Sin ORM: `pg` a pelo. |
| Identificadores | `id` interno uuid; el **slug** es el id público (el front usa `torta-chocolate`, nunca uuids). DTOs de la API con los MISMOS nombres de campo que usaba mock.js — por eso los componentes visuales no se tocaron. |
| Anticipación | **Por producto** (`products.anticipacion_horas`), NO por categoría: el mock real la contradice (tres-leches es Torta con 24h). Regla horas = hasta las 00:00 del día de entrega (conservador). `corte_mismo_dia` (12 pm) se guarda pero NO se valida aún — simplificación consciente de Fase 0. |
| Capacidad | `production_capacity` (tenant, categoría, fecha, cupo_maximo, bloqueado). Sin fila = sin límite. Reservado se calcula con SUM sobre order_items de pedidos no cancelados (sin contadores mutables → sin drift). |
| Precios | El cliente HTTP jamás manda precios: solo productoId+tamano+extras+cantidad. `POST /api/orders` recalcula todo con domain. `order_items.precio_unitario` queda congelado (snapshot). |
| Números de pedido | `order_sequences` por tenant, incremento atómico → `BB-2450`, `BB-2451`… |
| Estados | draft → confirmed → payment_pending → paid → in_production → out_for_delivery → delivered, cancelled desde cualquier estado previo a delivered. `confirmed → in_production` permitido (contraentrega). Web crea pedidos en `confirmed` (sin pasarela real aún). |
| Cupones | Tabla `coupons` (BAKE10 = 10% sembrado). El front solo da feedback optimista; la validación real es del servidor. |
| Front | JSX sin TypeScript, NO migrar. Consume `@bakebrothers/domain` como JS compilado (dist/), no escribe TS. |

## 4. API (puerto 3001)

- `GET /api/products` · `/api/products/:slug` · `/api/categories` · `/api/delivery-zones`
- `GET /api/availability?date=YYYY-MM-DD&type=<slug-categoria>` → cupos
- `POST /api/orders` → valida catálogo/tamaños/extras (400), anticipación (**422**),
  cupo (**409**), zona (400), cupón (400); recalcula totales; crea customer+order+items. 201.
- `GET /api/orders?telefono=&correo=&limite=` · `GET /api/orders/:numero`
- `PATCH /api/orders/:numero/status` — header `X-Admin-Key` (placeholder hasta el dashboard),
  valida `puedeTransicionar` (409 si inválida).

Errores: `{ error: 'CODIGO_EN_MAYUSCULAS', ... }`. Zod → 400 `{ error: 'VALIDACION', detalles }`.

## 5. Verificado en Fase 0 (criterios de aceptación)

- ✅ `pnpm test`: 48 tests de domain (tamaños con redondeo, extras, BAKE10, delivery
  gratis en el umbral exacto, anticipación 12h vs 48h, cupos, transiciones de estado).
- ✅ Tienda web idéntica leyendo de Postgres (recorrido completo: catálogo → detalle →
  carrito+cupón → checkout 5 pasos → pedido BB-2451 en BD → visible en Mis Pedidos).
- ✅ Torta con 12h de anticipación → 422 ANTICIPACION_INSUFICIENTE.
- ✅ 3 tortas con cupo 2 → 409 SIN_CUPO_DISPONIBLE.
- ✅ Aislamiento multi-tenant en ambas direcciones (tenant de prueba creado, verificado y
  eliminado): un tenant no ve productos ni pedidos del otro (RLS + WHERE explícito).
- ✅ `get_advisors` de Supabase: cero warnings de seguridad.

**Cambio de UX visible:** "Mis pedidos" ya no muestra los 5 pedidos simulados; muestra los
pedidos reales del tenant (auth sigue siendo cosmética — sin filtro por usuario hasta tener
auth real). `pedidosSimulados` sigue en mock.js pero ya no se usa.

## 6. Deuda conocida / pendientes de fases siguientes

- Auth real (login web es cosmético; `GET /api/orders` lista pedidos del tenant sin filtrar por usuario).
- Validación de `corte_mismo_dia` (pedidos "mismo día antes de las 12 pm").
- `paquetesCatering`, `testimonios` y el formulario de cotización de catering siguen
  estáticos/simulados (no hay tabla; decidir en fase del dashboard).
- `payments`, `conversations`, `messages`, `users` (tablas de fases 1-3, ver `plan bb.md` §8).
- Los INSERT de order_items van en loop (suficiente a este volumen; batch si crece).

## 7. Roadmap (una fase por sesión — ver detalle en `plan bb.md` §9)

- ✅ **Fase 0 — Cimiento**: monorepo + domain + Postgres multi-tenant + API + front conectado.
- **Fase 1 — Bot WhatsApp (happy path)**: webhook Cloud API oficial de Meta, dedupe por
  `wa_message_id`, máquina de estados en BD, pedidos por el MISMO flujo de POST /api/orders.
  Redactar plantillas de Meta y enviarlas a aprobación DE INMEDIATO (tardan).
- **Fase 2 — Dashboard** (`apps/admin`, React+TS): Kanban con Supabase Realtime + sonido.
  El clip de venta: un pedido por WhatsApp aparece solo en el dashboard.
- **Fase 3 — Producción real**: pagos Yape/Plin con captura, plantillas por cambio de
  estado, bandeja de conversaciones + handoff, CRUD de catálogo.
- **Fase 4 — Producto**: NLU con LLM, métricas, onboarding de tenant #2 sin tocar código.

## 8. Reglas de trabajo

- Antes de escribir código, lee el repo y presenta un plan. Espera OK.
- Una fase por sesión. No adelantes trabajo de fases siguientes.
- No agregar librerías innecesarias. No migrar el front a TypeScript.
- Nada de lógica de precios/reglas fuera de `packages/domain`.
- Nada específico de Bake Brothers hardcodeado: va en configuración del tenant (BD).
- El seed 0002 se REGENERA con `pnpm --filter @bakebrothers/api seed:generate`, nunca se edita a mano.
- Al terminar una fase, actualizar este archivo.

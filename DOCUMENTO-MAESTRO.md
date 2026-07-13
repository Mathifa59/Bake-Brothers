# 🧁 Bake Brothers — Documento maestro

> Plataforma multi-tenant de pedidos para pastelerías. **Bake Brothers es el tenant #1**
> de un producto vendible a cualquier negocio de repostería, con una tienda web, un bot de
> WhatsApp y un dashboard de gestión sobre un mismo núcleo.
>
> **Estado:** Fase 0 completada · **Actualizado:** 11 jul 2026 · **Tenant:** `bake-brothers` · **Tests:** 48/48

Este documento es el resumen de alto nivel del proyecto. Para el contexto operativo del día
a día, ver [`CLAUDE.md`](./CLAUDE.md); para el plan maestro de fases, ver [`plan bb.md`](./plan%20bb.md).

---

## 1. Cómo encaja todo

Tres consumidores distintos, un solo núcleo de datos y reglas. Ninguno calcula precios por su
cuenta: todos importan el mismo paquete de dominio.

```
Tienda web (React) ────────────────────────┐
                                            ├──► API + Postgres ──► Dashboard del negocio
WhatsApp del cliente ──► Servicio de bot ───┘
```

### La regla que ordena todo el proyecto

> **El cálculo de precios, la anticipación mínima, la capacidad de producción y la máquina de
> estados viven SOLO en `packages/domain`. El front, la API, el bot y el dashboard lo importan.
> Nunca se duplica esta lógica.**

---

## 2. Estado actual: Fase 0 completada ✅

El cimiento está de pie: monorepo, dominio con las reglas de negocio, Postgres multi-tenant y
una API que la tienda web ya consume de punta a punta. **Los pedidos se registran de verdad.**

Los **4/4 criterios de aceptación** pasan (ver §8).

---

## 3. Stack tecnológico

Elegido para durar hasta el bot y el dashboard sin reescrituras. Nada de librerías de más; sin
ORM; el front se queda en JSX sin TypeScript a propósito.

| Capa | Tecnología | Notas |
|---|---|---|
| **Front · web** | React 18 · Vite 6 · Tailwind v4 · JSX (sin TS) · React Router (HashRouter) · Context API | Misma UI de antes; ahora lee de la API. Calendario propio, sin librería de fechas. |
| **Dominio** | TypeScript · Vitest · sin I/O | `@bakebrothers/domain`: funciones puras de precios, anticipación, capacidad y estados. 48 tests. Se compila a JS y lo consume el front. |
| **API** | Node · Fastify 5 · TypeScript · zod · pg (sin ORM) · ESM | Validación manual con `schema.parse`. Puerto 3001. |
| **Base de datos** | PostgreSQL · Supabase · RLS en toda tabla · rol `app_api` | Proyecto `bake-brothers` (us-east-1, plan free). Aislamiento por tenant a nivel de motor. |
| **Monorepo** | pnpm workspaces | `apps/web`, `apps/api`, `packages/domain`. |

---

## 4. Arquitectura del monorepo

```
bake-brothers/
├── apps/
│   ├── web/                        React + Vite — la tienda, movida tal cual
│   │   └── src/
│   │       ├── api/client.js            fetch → API (header X-Tenant-Slug)
│   │       ├── context/CatalogContext   catálogo desde la API
│   │       ├── context/CartContext      carrito (precios vía domain)
│   │       └── data/mock.js             solo extras/testimonios/catering ya
│   └── api/                        Fastify + zod + pg
│       ├── migrations/                  0001 esquema+RLS · 0002 seed · 0003 orden
│       ├── scripts/seed-from-mock.mjs   regenera el seed desde mock.js
│       └── src/                         env · db · repositories · routes
└── packages/
    └── domain/                     ← única fuente de verdad
        ├── pricing.ts                   precios y totales
        ├── availability.ts              anticipación y cupos
        └── orderStatus.ts               máquina de estados
```

---

## 5. Modelo de datos

12 tablas, **todas con `tenant_id` y RLS**. El `slug` es el id público; el uuid interno nunca
sale. Los precios de cada pedido quedan congelados (snapshot).

| Tabla | Qué guarda |
|---|---|
| `tenants` | El negocio y su config. Solo lectura para la API. |
| `categories` | Tortas, postres, dulces, salados, bocaditos, catering. |
| `products` | 26 productos. Anticipación **por producto**. |
| `product_sizes` | Personal / Mediano / Grande + factor. |
| `extras` | Dedicatoria, vela, decoración (S/8). |
| `customers` | Cruce web ↔ WhatsApp por teléfono. |
| `delivery_zones` | 11 distritos; tarifa por zona opcional. |
| `coupons` | `BAKE10` sembrado. Validación del servidor. |
| `production_capacity` | Cupo por día/categoría. Sin fila = sin límite. |
| `order_sequences` | Numeración atómica por tenant → `BB-2451`. |
| `orders` | Canal, estado, totales, entrega. |
| `order_items` | Producto, tamaño, extras, **precio congelado**. |

---

## 6. La API (puerto 3001)

El cliente jamás manda precios: solo qué, cuánto y cómo. `POST /api/orders` recalcula todo con
el dominio y valida en cadena.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/products` · `/api/products/:slug` | Catálogo del tenant, con los mismos campos que usaba el front antes. |
| `GET` | `/api/categories` · `/api/delivery-zones` | Categorías y distritos cubiertos. |
| `GET` | `/api/availability?date=&type=` | Cupo disponible de una categoría en una fecha. |
| `POST` | `/api/orders` | Valida catálogo/tamaños/extras (`400`), anticipación (`422`), cupo (`409`), zona y cupón; recalcula totales; crea cliente + pedido + items. → `201` |
| `GET` | `/api/orders` · `/api/orders/:numero` | Historial y detalle del pedido con su estado legible. |
| `PATCH` | `/api/orders/:numero/status` | Cambia el estado validando la transición (`409` si es inválida). Protegido con `X-Admin-Key` hasta que llegue el dashboard. |

Errores con forma `{ error: 'CODIGO_EN_MAYUSCULAS', ... }`. Zod → `400 { error: 'VALIDACION', detalles }`.

---

## 7. Reglas de negocio

Todo esto vive en `packages/domain`, con un test por regla. Cambiar un precio o una anticipación
es tocar un solo lugar.

- **Precio de cada línea** = `precio_base × factor (redondeado) + extras`
  - Factores de tamaño: Personal ×1 · Mediano ×1.35 · Grande ×1.7
  - Cada extra suma S/8
- **Delivery**: S/12, **gratis desde S/150** (evaluado después del descuento del cupón). Recojo en tienda no paga.
- **Cupón `BAKE10`**: 10% de descuento. El front da feedback optimista; la validación real y autoritativa es del servidor.
- **Anticipación mínima**: **por producto**, no por categoría → 0 / 24 / 48 / 72 / 120 / 168 h. Medida hasta las 00:00 del día de entrega (conservador).
- **Capacidad de producción**: cupo por día y categoría. Lo reservado se calcula sumando pedidos no cancelados — sin contadores mutables, sin drift.
- **Precio congelado**: cada `order_item` guarda su precio del momento. Si mañana sube la torta, los pedidos viejos no cambian.

### Máquina de estados del pedido

```
draft → confirmed → payment_pending → paid → in_production → out_for_delivery → delivered
                                                                              ↳ cancelled
```

- La web crea pedidos en `confirmed` (sin pasarela real aún).
- `confirmed → in_production` permitido para contraentrega.
- `cancelled` desde cualquier estado previo a `delivered`.

---

## 8. Criterios de aceptación · verificados

- ✅ **`pnpm test` pasa — 48 tests de dominio.** Tamaños con redondeo, extras, `BAKE10`, delivery gratis en el umbral exacto, anticipación 12h vs 48h, cupos, transiciones de estado.
- ✅ **La tienda funciona igual, leyendo de Postgres.** Recorrido completo probado en vivo: catálogo → detalle con tamaño+extra → carrito+cupón → checkout de 5 pasos → `BB-2451` en la BD → visible en “Mis pedidos”.
- ✅ **Torta a 12h de anticipación → rechazada** (`422 ANTICIPACION_INSUFICIENTE`). Y 3 tortas contra un cupo de 2 → `409 SIN_CUPO_DISPONIBLE`.
- ✅ **Ningún tenant lee datos de otro.** Verificado en ambas direcciones con un tenant de prueba (creado y eliminado). RLS + WHERE explícito. Advisors de Supabase: cero warnings.

---

## 9. Qué falta · deuda conocida

Nada de esto bloquea la Fase 0; son límites conscientes que se resuelven en las fases siguientes.

- **Autenticación real** — el login web es cosmético; “Mis pedidos” lista los del tenant sin filtrar por usuario.
- **Corte “mismo día antes de las 12 pm”** — se guarda en `corte_mismo_dia` pero todavía no se valida.
- **Catering aún estático** — paquetes, testimonios y el formulario de cotización siguen simulados; se deciden en la fase del dashboard.
- **Tablas de fases 1–3** — `payments`, `conversations`, `messages`, `users` aún no existen.
- **Optimizaciones menores** — los `order_items` se insertan en loop (suficiente a este volumen); `/availability` aún no está cableado al calendario.

---

## 10. Roadmap

Una fase por sesión. No se adelanta trabajo de fases siguientes.

| Fase | Nombre | Estado | Qué incluye |
|---|---|---|---|
| **0** | Cimiento | ✅ Completada | Monorepo + dominio + Postgres multi-tenant + API + front conectado. |
| **1** | Bot de WhatsApp | ▶ Siguiente | Webhook oficial de Meta, dedupe por mensaje, máquina de estados en BD. Los pedidos entran por el mismo flujo de la API. Plantillas de Meta a aprobación de inmediato (tardan). |
| **2** | Dashboard del negocio | Futuro | Kanban de pedidos en tiempo real con sonido. El clip que vende: un pedido de WhatsApp aparece solo en la pantalla. |
| **3** | Producción real | Futuro | Pagos Yape/Plin con captura, plantillas por cambio de estado, bandeja de conversaciones, CRUD de catálogo. |
| **4** | Producto | Futuro | NLU con LLM, métricas, y onboarding de un segundo tenant sin tocar código. |

---

## 11. Cómo se corre

```bash
pnpm install     # instala todo el monorepo
pnpm dev         # tienda web · http://localhost:5173
pnpm dev:api     # API · http://localhost:3001
pnpm test        # 48 tests de dominio
```

La API necesita `apps/api/.env` (hay un `.env.example`). El `.env` local ya existe y **no se versiona**.
El seed se regenera con `pnpm --filter @bakebrothers/api seed:generate` (nunca se edita `0002` a mano).

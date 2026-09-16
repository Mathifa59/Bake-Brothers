# CLAUDE.md — Bake Brothers

> Documento de contexto persistente del proyecto. Léelo completo al inicio de cada sesión.
> Si tomas una decisión relevante o cambias el rumbo, actualiza este archivo.
> `plan bb.md` es el plan original (tienda virtual multi-tenant) y quedó **obsoleto** —
> no lo uses como referencia de alcance. Este documento y `DOCUMENTO-MAESTRO.md` son
> la fuente de verdad actual.

---

## 1. Qué es esto — alcance renegociado (2026-09-16)

Proyecto **exclusivo y personalizado** para Bake Brothers (Corporación Hermanos Loarte
S.A.C.), pastelería con 2+ locales en Chorrillos, Lima. **No se revende a otros negocios** —
el modelo multi-tenant del plan original (`plan bb.md`) fue descartado.

Tres piezas:

1. **Landing institucional** (`apps/web`) — marca, catálogo referencial, accesos directos a
   WhatsApp/Facebook/Instagram. **Sin carrito, sin checkout, sin pasarela de pagos.**
2. **Bot omnicanal** (WhatsApp Business, Facebook Messenger, Instagram) sobre un único
   webhook de Meta. RAG sobre catálogo/promos/FAQs + toma de pedidos estructurada.
3. **Dashboard/CRM** — gestión de pedidos e inventario, roles por sede, atribución de
   marketing por canal.

### La regla que sigue ordenando el proyecto

> **El cálculo de precios y la anticipación mínima viven SOLO en `packages/domain`. El
> front, el bot y el dashboard lo importan. Nunca se duplica esta lógica.**
>
> Ya NO viven en domain: cupones/descuentos (retirados) ni cálculo automático de delivery
> (el operador lo cotiza a mano). La capacidad de producción y la máquina de estados de
> pedido siguen vigentes.

## 2. Estado actual: Semana 1 completada (2026-09-16)

Diagnóstico + poda del código obsoleto + diseño del esquema nuevo. **Nada de esto se
desplegó** (ver §8, fuera de alcance esta semana).

```
apps/
├── web/        Landing (React 18 + Vite 6 + Tailwind v4, JSX sin TypeScript)
│   └── src/
│       ├── api/client.js + demoFallback.js   solo lectura de catálogo (sin pedidos)
│       ├── context/CatalogContext.jsx        productos + categorías
│       ├── utils/whatsapp.js                 número y links de WhatsApp (VITE_WHATSAPP_NUMBER)
│       ├── data/mock.js                      catálogo + paquetesCatering + testimonios
│       │                                     + fuente del seed de la API
│       └── pages/                            Home, Catalogo, ProductoDetalle, Ofertas,
│                                              Catering, Nosotros, Contacto
│                                              (Carrito/Checkout/Auth/Cuenta: ELIMINADOS)
├── api/        Fastify + zod + pg (TypeScript, ESM) — SIN desplegar a internet
│   ├── migrations/            0001 esquema+RLS · 0002 seed · 0003 orden ·
│   │                          0004 rediseno_alcance (sedes/stock/combos/reglas_catering/
│   │                          usuarios_dashboard, fin de RLS multi-tenant)
│   └── src/                   env · db · repositories · routes (orders.ts ajustado:
│                              sin cupón, delivery ya no se calcula solo)
packages/
└── domain/     precioPorTamano, calcularPrecioLinea, calcularSubtotal, anticipación,
                 capacidad, máquina de estados. SIN cupón/delivery automático (retirado).
```

**Cómo correr:** `pnpm install` · `pnpm dev` (web :5173, corre en modo demo con catálogo
local — no necesita la API) · `pnpm dev:api` (API :3001, necesita `apps/api/.env` con
`DATABASE_URL`; no hay `.env` local en este entorno) · `pnpm test`.

**Supabase:** proyecto `bake-brothers` (id `kxqadxazziybqzqzodrx`, us-east-1, plan free).
**El conector de Supabase de esta sesión está invalidado — sin acceso a la BD real.** La
migración 0004 se escribió pero NO se aplicó a ningún Postgres real; hay que revisarla
contra la BD real antes de Semana 2.

## 3. Decisiones tomadas (no re-litigar)

| Decisión | Detalle |
|---|---|
| Multi-tenant | **Retirado.** `tenant_id` se conserva en cada tabla y `tenants` sigue existiendo con una sola fila (Bake Brothers) — decisión deliberada para no tocar cada FK/repositorio en cascada. Las políticas RLS `tenant_isolation` se eliminaron (0004): cero aislamiento entre negocios, porque solo hay uno. |
| Sedes | `sedes` (2+ locales), con `whatsapp_phone_number_id` para mapear un mensaje entrante de Meta a la sede correcta. |
| Stock | `stock` por sede y por SKU (producto, o producto+tamaño). `disponible` nunca null; `cantidad` opcional (null = no se lleva conteo exacto). |
| Cupones → combos | `coupons` (código genérico %/monto fijo) se eliminó. `combos` modela paquetes de precio fijo con canal permitido, si acepta cambios y una condición en texto libre. Aún sin CRUD ni datos — se cargan en Semana 3. |
| Delivery | Ya no se calcula automáticamente (`DELIVERY_FEE`/`FREE_DELIVERY_THRESHOLD` retirados de `packages/domain`). Lo cotiza el operador manualmente. `delivery_zones` se conserva (útil como referencia de cobertura). |
| Catering / semáforo | `reglas_catering` (por producto: unidades mínimas, si sale el mismo día, anticipación, si requiere auto, si hay que consultar domingos) alimenta `orders.estado_catering` (verde/amarillo/rojo). La función que lo calcula se construye en Semana 3 — hoy solo existe el modelo. |
| Roles del dashboard | `usuarios_dashboard` (id = `auth.users` de Supabase, rol admin/operador, sede). Las políticas RLS que filtran `orders`/`stock` por sede están redactadas pero **comentadas** — se activan en Semana 3 junto con el login real. |
| Marketing | `orders.campana` y `orders.ctwa_clid` existen en el modelo para Meta Ads (Semana 4), sin usarse todavía. |
| Identificadores | Igual que antes: `id` interno uuid, `slug` es el id público. |
| Front | JSX sin TypeScript, NO migrar. Vitrina informativa — todo CTA de pedido apunta a WhatsApp (`utils/whatsapp.js`), no hay carrito. |
| Precios | El cliente HTTP jamás manda precios. `POST /api/orders` sigue recalculando con `packages/domain`, pero ya no aplica cupón ni delivery automático — esos campos quedan en 0 hasta que el operador los ajuste. |

## 4. API (puerto 3001) — sin desplegar

Sin cambios de rutas respecto a antes, salvo:
- `POST /api/orders`: ya no acepta `cuponCodigo`; `canal` admite `'web' | 'whatsapp' | 'facebook' | 'instagram'`; la respuesta trae `descuentoCupon: 0, delivery: 0` (se completan manualmente después).
- El resto (`GET /api/products`, `/api/categories`, `/api/delivery-zones`, `/api/availability`, `GET/PATCH /api/orders`) sigue igual — esta API sigue sin desplegarse a internet ni siendo consumida por nada en producción.

## 5. Verificado en Semana 1

- ✅ `pnpm test`: tests de dominio ajustados (se quitaron los de cupón/delivery/totales; quedan tamaños, precio de línea, subtotal, anticipación, capacidad, máquina de estados).
- ✅ `pnpm build`: los tres paquetes (`domain`, `api`, `web`) compilan sin errores tras los cambios de esquema/dominio.
- ✅ Landing revisada página por página: sin referencias a carrito/checkout/cupón/login.
- ✅ Cadena `0001→0004` corrida de punta a punta contra Postgres 16 real en Docker (local, no Supabase) — ver detalle y evidencia en §6.
- ⚠️ Sigue pendiente correrla contra el Supabase real del proyecto antes de Semana 2.

## 6. Qué falta — deuda conocida

- **Cadena 0001→0004 validada localmente (Postgres 16 en Docker), falta contra Supabase real.**
  Se corrió limpia de punta a punta contra un contenedor Postgres 16 vanilla (no Supabase),
  con un `auth.users` mínimo creado a mano como fixture de prueba (Supabase ya lo provee de
  fábrica; Postgres vanilla no). Verificado con evidencia real, no solo revisando el
  catálogo: `orders_canal_check` acepta `facebook`/`instagram` (insert real), no quedan
  políticas `tenant_isolation` en `pg_policies` (solo sigue `tenants_read`), y los `grant`
  a `app_api` funcionan de verdad (`SET ROLE app_api` + INSERT/SELECT real) en `sedes`,
  `stock`, `combos`, `combo_items` y `reglas_catering`. **`usuarios_dashboard` deniega el
  acceso a `app_api`** (`permission denied`) — es lo esperado, esa tabla la gestiona
  Supabase Auth/el dashboard, no la API; no tiene grant a propósito.
  Al validar se encontró y arregló un bug real preexistente (no introducido en esta
  sesión): `0002_seed_bake_brothers.sql` insertaba usando `products.orden`, columna que
  recién se crea en `0003_products_orden.sql` — la cadena 0001→0002→0003 nunca se había
  corrido en orden estricto contra una BD limpia antes de esta prueba. Se corrigió
  adelantando `alter table products add column if not exists orden...` a 0002 y volviendo
  idempotente el mismo ALTER en 0003.
  **Pendiente real:** correr esto una vez contra el Supabase del proyecto (con su
  `auth.users` genuino, no el stub de prueba) antes de darlo por definitivamente bueno.
- **Combos sin CRUD ni datos** — el modelo existe, la carga es manual/dashboard en Semana 3.
- **Semáforo de catering sin calcular** — `reglas_catering` existe, la función que escribe `orders.estado_catering` se construye en Semana 3.
- **RLS por sede comentada** — se activa junto con el login real del dashboard (Semana 3).
- **`.env` de `apps/api` no existe en este entorno** — hace falta para correr la API en local.
- Deuda heredada de antes, sin resolver: auth real, `corte_mismo_dia` sin validar.

## 7. Roadmap (4 semanas — reemplaza el roadmap de fases de `plan bb.md`)

- ✅ **Semana 1 — Diagnóstico + poda + esquema**: landing sin carrito/checkout/auth, migración 0004 (sedes, stock, combos, reglas_catering, usuarios_dashboard, fin del multi-tenant), `packages/domain` sin cupón/delivery.
- **Semana 2 — Webhook de Meta + RAG**: webhook único (WhatsApp/Messenger/Instagram vía Meta), RAG sobre catálogo/promos/FAQs. Aplicar 0004 a Supabase real.
- **Semana 3 — Toma de pedidos por el bot + dashboard v1**: pedidos estructurados por el bot (mismo flujo de `POST /api/orders`), `apps/admin` con Kanban de pedidos y gestión de inventario, login real + RLS por sede, combos con CRUD, semáforo de catering calculado.
- **Semana 4 — Inventario + atribución + cierre**: `stock` conectado al flujo real, atribución de marketing (`campana`/`ctwa_clid`), cierre y entrega.

## 8. Reglas de trabajo

- Antes de escribir código, lee el repo y presenta un plan. Espera OK.
- Una semana por sesión. No adelantes trabajo de semanas siguientes (Semana 1 NO tocó
  webhook de Meta, RAG, `apps/admin` ni ningún despliegue).
- No agregar librerías innecesarias. No migrar el front a TypeScript.
- Nada de lógica de precios/reglas fuera de `packages/domain`.
- Nada específico de Bake Brothers hardcodeado en código — datos de contacto (WhatsApp,
  Instagram, Facebook) van en variables de entorno (`apps/web/.env.example`).
- El seed 0002 se REGENERA con `pnpm --filter @bakebrothers/api seed:generate`, nunca se
  edita a mano. 0002 sigue insertando en tablas que 0004 no toca (productos, categorías,
  tamaños, extras, zonas de delivery) — el generador ya no emite el insert de cupones.
- Al terminar una semana, actualizar este archivo.

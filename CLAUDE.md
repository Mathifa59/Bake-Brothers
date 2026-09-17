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
│   │                          usuarios_dashboard, fin de RLS multi-tenant) ·
│   │                          0005 retira delivery_zones (huérfana) ·
│   │                          0006 catálogo_real (58 productos reales, tamaños con precio
│   │                          absoluto, 13 combos, categorías reales) ·
│   │                          0007 catering_items (tabla propia para el semáforo de
│   │                          catering, reglas_catering repuntada, necesita_ticket) ·
│   │                          0008 fotos_catalogo_real (foto_url de 31 productos y 7
│   │                          combos con imágenes reales)
│   └── src/                   env · db · repositories · routes (orders.ts ajustado:
│                              sin cupón, delivery ya no se calcula solo; tamaño validado
│                              contra `product.tamanos` real, no un enum fijo;
│                              deliveryZonesRepo.ts/routes/deliveryZones.ts ELIMINADOS)
packages/
└── domain/     precioPorTamano, calcularPrecioLinea, calcularSubtotal, anticipación,
                 capacidad, máquina de estados. SIN cupón/delivery automático (retirado).
                 precioPorTamano acepta un precio de tamaño explícito (catálogo real,
                 sin relación de factor) que gana sobre el cálculo por factor legado.
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
| Cupones → combos | `coupons` (código genérico %/monto fijo) se eliminó. `combos` modela paquetes de precio fijo con canal permitido, si acepta cambios y una condición en texto libre. Los 13 combos reales están cargados (0006); `combo_items` solo se pobló para composiciones fijas o con un default nombrado — los 3 combos "sabor sujeto a stock, sin default" (Pack Petitbro, Pack 6/12 empanadas) quedan sin `combo_items`, descritos solo en `condicion_texto`. CRUD desde el dashboard sigue en Semana 3. |
| Delivery | Ya no se calcula automáticamente (`DELIVERY_FEE`/`FREE_DELIVERY_THRESHOLD` retirados de `packages/domain`). Lo cotiza el operador manualmente. `delivery_zones` se eliminó en 0005 (huérfana: nada la consultaba tras retirar el cálculo automático — ver §6). Si Semana 3+ necesita cobertura por zona, se diseña de nuevo con `sede_id`, no se resucita tal cual. |
| Tamaños con precio real | `product_sizes.tamano` dejó de ser un enum fijo (Personal/Mediano/Grande) — el catálogo real usa etiquetas heterogéneas (cm, peso, "caja x_"). `product_sizes.precio` guarda el precio absoluto por tamaño (sin relación de factor); `factor` queda nullable, sin usarse en datos nuevos. `packages/domain.precioPorTamano` acepta ese precio explícito y lo prioriza sobre el cálculo por factor. |
| Catering / semáforo | Los ítems de catering (sección 10 de la fuente real) viven en `catering_items`, tabla propia — **no** en `products` (decisión del cliente, 2026-09-17): casi ningún ítem de catering corresponde 1 a 1 con un producto de tienda. `reglas_catering.catering_item_id` apunta ahí (antes apuntaba a `products`, nunca se pobló por este mismo bloqueo). Los 14 ítems reales ya están cargados, incluyendo `necesita_ticket` (nullable: NULL donde la fuente no da un valor único para el ítem — ver `0007_catering_items.sql`). La función que calcula `orders.estado_catering` sigue en Semana 3. |
| Roles del dashboard | `usuarios_dashboard` (id = `auth.users` de Supabase, rol admin/operador, sede). Las políticas RLS que filtran `orders`/`stock` por sede están redactadas pero **comentadas** — se activan en Semana 3 junto con el login real. |
| Marketing | `orders.campana` y `orders.ctwa_clid` existen en el modelo para Meta Ads (Semana 4), sin usarse todavía. |
| Identificadores | Igual que antes: `id` interno uuid, `slug` es el id público. |
| Front | JSX sin TypeScript, NO migrar. Vitrina informativa — todo CTA de pedido apunta a WhatsApp (`utils/whatsapp.js`), no hay carrito. |
| Precios | El cliente HTTP jamás manda precios. `POST /api/orders` sigue recalculando con `packages/domain`, pero ya no aplica cupón ni delivery automático — esos campos quedan en 0 hasta que el operador los ajuste. |
| Imágenes reales | `imagenes/` (raíz del repo) es el material fuente, trackeado en git. Se wireó el mapeo de **confianza alta** solamente: 31 `products.foto_url` + 7 `combos.foto_url` (0008) + el logo real en `Logo.jsx`. 5 archivos quedaron explícitamente sin asignar (nombres sin señal, o ambigüedad de producto/sabor no resuelta — ver `0008_fotos_catalogo_real.sql`). Productos con 2 fotos candidatas (ej. tamaños/variantes distintos) solo tienen una wireada — `products.foto_url` es un único campo, sin galería. |

## 4. API (puerto 3001) — sin desplegar

Cambios de rutas respecto a antes:
- `POST /api/orders`: ya no acepta `cuponCodigo`; `canal` admite `'web' | 'whatsapp' | 'facebook' | 'instagram'`; la respuesta trae `descuentoCupon: 0, delivery: 0` (se completan manualmente después).
- **`GET /api/delivery-zones` eliminada** (0005) — nada la consumía, ni el front ni el resto de la API.
- El resto (`GET /api/products`, `/api/categories`, `/api/availability`, `GET/PATCH /api/orders`) sigue igual — esta API sigue sin desplegarse a internet ni siendo consumida por nada en producción.

## 5. Verificado en Semana 1

- ✅ `pnpm test`: tests de dominio ajustados (se quitaron los de cupón/delivery/totales; quedan tamaños, precio de línea, subtotal, anticipación, capacidad, máquina de estados).
- ✅ `pnpm build`: los tres paquetes (`domain`, `api`, `web`) compilan sin errores tras los cambios de esquema/dominio.
- ✅ Landing revisada página por página: sin referencias a carrito/checkout/cupón/login.
- ✅ Cadena `0001→0008` corrida de punta a punta contra Postgres 16 real en Docker (local, no Supabase) — ver detalle y evidencia en §6.
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
- **0005_retira_delivery_zones.sql** también validada de punta a punta (`0001→0005` contra
  contenedor limpio, misma metodología que 0004). `delivery_zones` estaba huérfana: nada
  en `packages/domain` ni en `apps/api` la consultaba ya (el cálculo automático de delivery
  se había retirado en 0004; `tarifaDeZona()` ya estaba muerta). Se eliminó junto con
  `deliveryZonesRepo.ts`, `routes/deliveryZones.ts` y su registro en `app.ts`. `mock.js`
  perdió `distritos` (sin consumidores tras esto) y el generador del seed ya no emite ese
  bloque. `0002_seed_bake_brothers.sql` (ya aplicado/histórico) sigue insertando en
  `delivery_zones` antes de que 0005 la borre — no rompe la cadena, mismo patrón que
  `coupons`.
- **0006_catalogo_real.sql** (58 productos reales, 13 combos, categorías reales) validada
  end-to-end (`0001→0006` contra contenedor limpio) — aplicó limpia a la primera. Forzó
  varios ajustes de esquema: `product_sizes` gana `precio` absoluto y pierde el enum fijo
  de `tamano` (el catálogo real no tiene una relación de factor consistente entre
  tamaños); `products.categoria_negocio` admite `'bebidas'`; `anticipacion_horas`/`texto`
  pasan a nullable (la fuente no da anticipación por producto de tienda); se agregan
  `ingredientes`/`alergenos`/`respuesta_rapida` (insumo del RAG de Semana 2);
  `combo_items` gana `product_size_id` opcional. El extra "Dedicatoria personalizada"
  (S/8) se desactivó — la ficha real dice que es gratis hasta 8 palabras.
- **0007_catering_items.sql**: los ítems de catering (sección 10 de la fuente) viven en
  `catering_items`, no en `products` — decisión del cliente (2026-09-17) tras presentarle
  dos alternativas, ya que casi ningún ítem de catering corresponde 1 a 1 con un producto
  de tienda. `reglas_catering` se recreó apuntando ahí (estaba vacía desde 0004, nunca se
  pobló por este mismo bloqueo) y ya tiene los 14 ítems reales cargados, con
  `necesita_ticket` (nullable — ver el comentario de esa columna en la migración: la
  fuente no da ese dato con la misma granularidad para todos los ítems).
- **0008_fotos_catalogo_real.sql**: 31 `products.foto_url` + 7 `combos.foto_url`
  (columna nueva, combos no tenía) con las fotos reales de `imagenes/` — solo el mapeo de
  confianza alta, sin inventar ningún match dudoso.
- Cadena completa `0001→0008` revalidada end-to-end contra contenedor limpio — aplicó
  limpia a la primera, sin necesidad de arreglar nada.
- **Combos sin CRUD** — el modelo y los 13 combos reales existen (0006); la gestión desde
  el dashboard llega en Semana 3.
- **Semáforo de catering sin calcular** — `reglas_catering` ya tiene los 14 ítems reales
  (0007), la función que escribe `orders.estado_catering` se construye en Semana 3.
- **RLS por sede comentada** — se activa junto con el login real del dashboard (Semana 3).
- **`.env` de `apps/api` no existe en este entorno** — hace falta para correr la API en local.
- Deuda heredada de antes, sin resolver: auth real, `corte_mismo_dia` sin validar.

## 7. Roadmap (4 semanas — reemplaza el roadmap de fases de `plan bb.md`)

- ✅ **Semana 1 — Diagnóstico + poda + esquema**: landing sin carrito/checkout/auth, migración 0004 (sedes, stock, combos, reglas_catering, usuarios_dashboard, fin del multi-tenant), 0005 (retira delivery_zones), 0006 (catálogo real: 58 productos, 13 combos), 0007 (catering_items), 0008 (fotos reales), `packages/domain` sin cupón/delivery.
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

# 🧁 Bake Brothers — Documento maestro

> Proyecto **exclusivo** de Corporación Hermanos Loarte S.A.C. (Bake Brothers), pastelería
> con 2+ locales en Chorrillos, Lima. Tres piezas — landing, bot omnicanal y dashboard/CRM —
> sobre un mismo catálogo y las mismas reglas de precio. **No es una plataforma multi-tenant
> vendible a otros negocios** (ese alcance, descrito en `plan bb.md`, fue renegociado y
> quedó obsoleto).
>
> **Estado:** Semana 1 de 4 completada · **Actualizado:** 16 sep 2026 · **Plan:** ver §9

Este documento es el resumen de alto nivel del proyecto. Para el contexto operativo del día
a día, ver [`CLAUDE.md`](./CLAUDE.md). `plan bb.md` es el plan **histórico** de la versión
multi-tenant anterior — queda como referencia de lo que se descartó, no como guía vigente.

---

## 1. Las tres piezas

```
Landing (React) ──────┐
                       │
Bot omnicanal ─────────┼──► API + Postgres ──► Dashboard/CRM
(WhatsApp · FB ·       │
 Instagram, 1 webhook) ┘
```

1. **Landing institucional** — marca, catálogo referencial, accesos directos a redes.
   Sin carrito, sin checkout, sin pasarela de pagos: toda intención de compra se resuelve
   por WhatsApp.
2. **Bot omnicanal** — un único webhook de Meta recibe WhatsApp Business, Facebook
   Messenger e Instagram. RAG sobre catálogo/promos/FAQs, más toma de pedidos estructurada
   (no solo conversación libre).
3. **Dashboard/CRM** — gestión de pedidos e inventario por sede, roles (admin/operador),
   atribución de marketing por canal.

### La regla que ordena el proyecto

> **El cálculo de precios y la anticipación mínima viven SOLO en `packages/domain`. El
> front, el bot y el dashboard lo importan. Nunca se duplica esta lógica.**

Lo que salió de `packages/domain` en esta revisión: cupones/descuentos (el negocio vende
combos de precio fijo, no códigos genéricos) y el cálculo automático de delivery (lo cotiza
el operador). Lo que sigue ahí: precio por tamaño y extras, anticipación mínima, capacidad
de producción, máquina de estados del pedido.

---

## 2. Estado actual: Semana 1 completada ✅

Diagnóstico del repo heredado, poda de todo lo que pertenecía al alcance anterior (carrito,
checkout, login/cuenta simulados) y diseño del esquema de base de datos para las tres
piezas confirmadas. **Nada se desplegó** — ver §7, fuera de alcance esta semana.

---

## 3. Stack tecnológico

Sin cambios respecto al proyecto heredado — se mantiene porque ya estaba bien elegido para
esta arquitectura, no porque el alcance de negocio siguiera siendo el mismo.

| Capa | Tecnología | Notas |
|---|---|---|
| **Landing** | React 18 · Vite 6 · Tailwind v4 · JSX (sin TS) · React Router (HashRouter) · Context API | Vitrina informativa; todo CTA de pedido va a WhatsApp. |
| **Dominio** | TypeScript · Vitest · sin I/O | `@bakebrothers/domain`: precios, anticipación, capacidad, estados. Sin cupón/delivery automático. |
| **API** | Node · Fastify 5 · TypeScript · zod · pg (sin ORM) · ESM | Puerto 3001. Sin desplegar a internet. |
| **Base de datos** | PostgreSQL · Supabase | Proyecto `bake-brothers` (ref `umyaytrojtbdvdzbrily`, São Paulo, plan free) — el real, de ahora en adelante. Un proyecto anterior en Oregon (`vkkjoxvgrmzbxagppjpv`) fue migrado igual y luego eliminado por el cliente; ya no existe. Ya no tiene RLS de aislamiento multi-tenant (solo hay un negocio). |
| **Monorepo** | pnpm workspaces | `apps/web`, `apps/api`, `packages/domain`. `apps/admin` (dashboard) todavía no existe — llega en Semana 3. |

---

## 4. Arquitectura del monorepo

```
bake-brothers/
├── apps/
│   ├── web/                        Landing — sin carrito, checkout, login ni cuenta
│   │   └── src/
│   │       ├── api/client.js            solo lectura de catálogo
│   │       ├── context/CatalogContext   productos + categorías
│   │       ├── utils/whatsapp.js        número/links de WhatsApp (env var)
│   │       └── data/mock.js             catálogo + input del seed de la API
│   └── api/                        Fastify + zod + pg — sin desplegar
│       ├── migrations/                  0001-0003 (heredadas) · 0004 rediseño de alcance ·
│       │                               0005 retira delivery_zones (huérfana) ·
│       │                               0006 catálogo real (58 productos, 13 combos) ·
│       │                               0007 catering_items (tabla propia) ·
│       │                               0008 fotos reales (31 productos, 7 combos)
│       ├── scripts/seed-from-mock.mjs   regenera 0002 desde mock.js (histórico — 0006 ya
│       │                               reemplazó su contenido de catálogo)
│       └── src/                         env · db · repositories · routes
└── packages/
    └── domain/                     precios (sin cupón/delivery) · anticipación · estados
```

`apps/admin` (el dashboard) todavía no existe como carpeta — es trabajo de Semana 3.

---

## 5. Modelo de datos (tras 0004→0008)

| Tabla | Qué guarda | Estado |
|---|---|---|
| `tenants` | Bake Brothers, fila única. Sin RLS de aislamiento (ya no hay nada que aislar). | Heredada, sin cambios de forma |
| `categories` | 8 categorías reales (Tortas y Kekes, Postres, Postres en Caja, Alfajores, Empanadas, Sándwiches, Cajitas Dulces, Bebidas) — reemplazaron a las 6 genéricas del mock en 0006. | Recargada (0006) |
| `products` | 58 productos reales (0006), con `ingredientes`/`alergenos`/`respuesta_rapida` (insumo del RAG) y `foto_url` real en 31 (0008). `categoria_negocio` admite `'bebidas'`. `anticipacion_horas`/`texto` nullable (la fuente no da ese dato por producto de tienda). | Recargada + ampliada |
| `product_sizes` | Tamaños reales con `precio` absoluto (no factor) — el catálogo real no tiene una relación de factor consistente entre tamaños, y usa etiquetas heterogéneas (cm, peso, "caja x_"), por eso `tamano` dejó de ser un enum fijo. `factor` queda nullable, sin usarse en datos nuevos. | Recargada + ampliada |
| `extras` / `customers` | Extras (ajustados en 0006: "Dedicatoria" desactivada — es gratis según la fuente real; se agregó el topper y el jugo con leche) y clientes. | Heredada/ajustada |
| `production_capacity` | Cupo de producción por día/categoría. | Heredada, sin cambios |
| `order_sequences` / `orders` / `order_items` | Numeración, pedidos, ítems con precio congelado. `orders` ganó `sede_id`, `campana`, `ctwa_clid`, `estado_catering`; `canal` admite `facebook`/`instagram`. | Ampliadas |
| ~~`coupons`~~ | Eliminada — reemplazada por `combos`. | Retirada |
| ~~`delivery_zones`~~ | Eliminada — nada la consultaba tras retirar el cálculo automático de delivery. Si hace falta cobertura por zona en Semana 3+, se diseña con `sede_id`, no se resucita. | Retirada |
| `sedes` | Los 2 locales reales (Cedros, Santa Marina) con dirección — cargados en 0006. `whatsapp_phone_number_id` sigue vacío (pendiente de Meta, Semana 2). | Nueva, con datos reales |
| `stock` | Disponibilidad + cantidad opcional por sede y por SKU (producto, o producto+tamaño). Sin datos todavía. | Nueva |
| `combos` / `combo_items` | 13 combos reales con precio normal/promo, canal y condición (0006), + `foto_url` en 7 (0008). `combo_items` gana `product_size_id` opcional (0006) — solo se pobló para composiciones fijas o con default nombrado; 3 combos "sabor sujeto a stock sin default" quedan sin `combo_items`. | Nueva, con datos reales |
| `catering_items` | Los 14 ítems de catering de la fuente real (sección 10), desacoplados de `products` — decisión del cliente (2026-09-17): casi ningún ítem de catering corresponde 1 a 1 con un producto de tienda. | Nueva (0007) |
| `reglas_catering` | Repuntada a `catering_item_id` (antes a `product_id`, nunca se pobló por el mismo bloqueo). Ya tiene los 14 ítems reales, con `necesita_ticket` (nullable). La función que calcula el semáforo llega en Semana 3. | Recreada con datos reales (0007) |
| `usuarios_dashboard` | Rol (admin/operador) y sede por usuario de Supabase Auth. RLS por sede redactada pero comentada — se activa en Semana 3. | Nueva |

---

## 6. Reglas de negocio vigentes

- **Precio de cada línea** = `precio_base × factor de tamaño (redondeado) + extras` — sin cambios.
- **Delivery**: ya NO se calcula solo. Lo cotiza el operador manualmente desde el dashboard (Semana 3).
- **Combos**: precio fijo por paquete, con reglas propias (sustituciones, canal). Reemplazan a los cupones de descuento genéricos.
- **Anticipación mínima**: por producto, sin cambios.
- **Capacidad de producción**: por día y categoría, sin cambios.
- **Semáforo de catering**: `reglas_catering` (unidades mínimas, si sale el mismo día, anticipación, si requiere auto, si hay que consultar domingos) → `orders.estado_catering`. Modelo listo, cálculo pendiente de Semana 3.
- **Precio congelado**: sin cambios.

### Máquina de estados del pedido — sin cambios

```
draft → confirmed → payment_pending → paid → in_production → out_for_delivery → delivered
                                                                              ↳ cancelled
```

---

## 7. Qué se hizo en Semana 1 (verificado)

- ✅ Diagnóstico del repo heredado contra el alcance renegociado (ver `CLAUDE.md` §1 y el
  resumen de la sesión que hizo este cambio).
- ✅ Landing podada: sin `Carrito`, `Checkout`, `Auth` (login/registro/recuperar) ni `Cuenta`
  (mis pedidos). Páginas informativas convertidas a vitrina con CTA a WhatsApp.
- ✅ Datos de contacto (WhatsApp, Instagram, Facebook) movidos a variables de entorno —
  antes estaban hardcodeados como placeholders.
- ✅ Migración `0004_rediseno_alcance.sql` escrita: fin del RLS multi-tenant, `sedes`,
  `stock`, `orders` ampliada, `combos` reemplaza `coupons`, `reglas_catering`,
  `usuarios_dashboard`.
- ✅ `packages/domain` sin cupón/delivery automático; tests ajustados.
- ✅ `apps/api/src/routes/orders.ts` ajustado para seguir compilando sin esas piezas
  (delivery/descuento quedan en 0 hasta que el operador los complete — no es la solución
  final, es lo mínimo para no romper el build; la reescritura real es Semana 3).
- ✅ `pnpm build` y `pnpm test` verificados en verde.
- ✅ Cadena `0001→0004` validada de punta a punta contra Postgres 16 real en Docker (local) — ver §8 para el detalle y la evidencia de los 3 sanity checks.
- ✅ `delivery_zones` confirmada huérfana (nada en `packages/domain` ni en `apps/api` la consultaba) y eliminada en `0005_retira_delivery_zones.sql`, junto con `deliveryZonesRepo.ts`, `routes/deliveryZones.ts` y `distritos` en `mock.js`. Cadena `0001→0005` revalidada contra contenedor limpio.
- ✅ `0006_catalogo_real.sql`: 58 productos reales, 13 combos, categorías reales — sin inventar ningún precio/ingrediente/alérgeno pendiente en la fuente. Forzó ajustes de esquema (ver §5): `product_sizes.precio` absoluto, `categoria_negocio` con `'bebidas'`, anticipación nullable, columnas de RAG en `products`, `product_size_id` en `combo_items`.
- ✅ `0007_catering_items.sql`: tabla `catering_items` propia (decisión del cliente, 2026-09-17, entre 2 alternativas presentadas) y `reglas_catering` recreada apuntando ahí, con los 14 ítems reales cargados y `necesita_ticket`.
- ✅ `0008_fotos_catalogo_real.sql`: 31 `products.foto_url` + 7 `combos.foto_url` con fotos reales — solo el mapeo de confianza alta; el logo real también se wireó en `Logo.jsx`. `imagenes/` (fuente) quedó trackeada en git.
- ✅ Cadena `0001→0008` revalidada de punta a punta contra contenedor limpio — aplicó sin errores.
- ✅ Cadena `0001→0008` aplicada contra el Supabase real del proyecto (`umyaytrojtbdvdzbrily`, São Paulo), vía el conector MCP, con la misma evidencia que en Docker.
- ✅ `apps/api/Dockerfile` construido y probado (build + run reales) para desplegar en Coolify — resuelve la dependencia interna del monorepo (`packages/domain`), no corre migraciones al iniciar.

---

## 8. Qué falta · deuda conocida

- **Validado localmente y contra Supabase real.** La cadena 0001→0008 se corrió de punta a punta contra Postgres 16 en Docker (con un `auth.users` de prueba simulando lo que Supabase ya provee) y quedó limpia, con los 3 sanity checks de 0004 confirmados por evidencia real (constraint de canal, ausencia de políticas de aislamiento, grants de `app_api` probados con `SET ROLE` + INSERT/SELECT reales — `usuarios_dashboard` deniega el acceso a `app_api` a propósito, esa tabla la gestiona Supabase Auth). En el camino se encontró y arregló un bug real preexistente: 0002 insertaba usando `products.orden`, columna que 0003 recién crea — la cadena en orden estricto nunca se había probado antes. `delivery_zones` resultó huérfana tras 0004 y se retiró en 0005. Después se aplicó la misma cadena contra el Supabase real (`umyaytrojtbdvdzbrily`, São Paulo) — el plan free no soporta development branches, así que se aplicó directo a la base principal (viable porque estaba vacía, sin datos reales en juego); los grants de `app_api` se verificaron por `information_schema.role_table_grants` en vez de `SET ROLE` (la conexión del MCP no tiene permiso para cambiar de rol). Conteos idénticos a Docker.
- Combos con datos reales (0006) pero sin CRUD desde dashboard.
- Semáforo de catering: `catering_items`/`reglas_catering` con los 14 ítems reales (0007), falta la función de cálculo.
- `necesita_ticket` de `reglas_catering` quedó NULL en 4 de los 14 ítems (la fuente no da ese dato con la misma granularidad para todos — ver comentario en `0007_catering_items.sql`).
- 5 imágenes de `imagenes/` quedaron sin asignar a ningún producto/combo (nombres sin señal o ambigüedad no resuelta) — ver `0008_fotos_catalogo_real.sql`.
- `apps/web/src/data/mock.js` (modo demo del landing) sigue con el catálogo genérico anterior, no sincronizado con los datos reales de 0006-0008.
- RLS por sede comentada, sin activar.
- `apps/api/.env` no existe en este entorno.
- Deuda heredada: autenticación real, `corte_mismo_dia` sin validar.

---

## 9. Roadmap — 4 semanas

| Semana | Nombre | Estado | Qué incluye |
|---|---|---|---|
| **1** | Diagnóstico + poda + esquema | ✅ Completada | Landing sin carrito/checkout/auth, migraciones 0004-0008 (esquema + catálogo real + catering_items + fotos), ya aplicadas al Supabase real. `apps/api/Dockerfile` listo para Coolify. |
| **2** | Webhook de Meta + RAG | ▶ Siguiente | Webhook único (WhatsApp/Messenger/Instagram), RAG sobre catálogo/promos/FAQs. |
| **3** | Toma de pedidos por el bot + dashboard v1 | Futuro | Pedidos estructurados por el bot, `apps/admin` (Kanban + inventario), login real + RLS por sede, combos con CRUD, semáforo de catering calculado. |
| **4** | Inventario + atribución + cierre | Futuro | `stock` conectado al flujo real, atribución de marketing (`campana`/`ctwa_clid`), cierre. |

---

## 10. Cómo se corre

```bash
pnpm install     # instala todo el monorepo
pnpm dev         # landing · http://localhost:5173 (modo demo, no necesita la API)
pnpm dev:api     # API · http://localhost:3001 (necesita apps/api/.env con DATABASE_URL)
pnpm test        # tests de dominio
pnpm build       # build de los tres paquetes
```

El seed se regenera con `pnpm --filter @bakebrothers/api seed:generate` (nunca se edita
`0002` a mano). No incluye combos — esos se cargan aparte en Semana 3.

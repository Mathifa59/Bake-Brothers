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

1. **Landing institucional** (`apps/web`) — **desde 2026-09-27, una sola vista** (una
   landing de una página, no un sitio multi-página), enfocada en los productos estrella y
   en empujar a WhatsApp. Marca, accesos directos a WhatsApp/Facebook/Instagram. **Sin
   carrito, sin checkout, sin pasarela de pagos, sin formularios.** Ver el bloque dedicado
   más abajo (§7, "Landing de una sola vista") para el detalle completo.
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
│                                              ⚠ Snapshot de Semana 1 (2026-09-16). Desde
│                                              2026-09-27 estas páginas siguen existiendo
│                                              como archivos pero NO están enrutadas — ver
│                                              "Landing de una sola vista" en §7.
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

**Supabase:** proyecto `bake-brothers` (ref `umyaytrojtbdvdzbrily`, São Paulo, plan free)
— **este es el proyecto real, de ahora en adelante.** Hubo un proyecto anterior en Oregon
(`vkkjoxvgrmzbxagppjpv`) que también se migró completo, pero el cliente lo eliminó
(2026-09-17); no queda nada ahí y no debe referenciarse más.
**Las 8 migraciones (0001→0008) ya están aplicadas contra este Supabase real**, vía el
conector MCP, con la misma evidencia (constraints, grants, conteos) que la validación
local en Docker — ver §6. La app (`apps/api`) sigue sin desplegarse a internet.

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
| Contacto real | WhatsApp `912944096`, Instagram/Facebook `Bakebrothers.pe` (cuenta única de marca, no por sede) — son los defaults reales en `utils/whatsapp.js` y en `Footer.jsx`/`Contacto.jsx` (antes placeholders), overrideables por `VITE_WHATSAPP_NUMBER`/`VITE_INSTAGRAM_URL`/`VITE_FACEBOOK_URL`. |

## 4. API (puerto 3001) — desplegada en Coolify (ver §9)

Cambios de rutas respecto a antes:
- `POST /api/orders`: ya no acepta `cuponCodigo`; `canal` admite `'web' | 'whatsapp' | 'facebook' | 'instagram'`; la respuesta trae `descuentoCupon: 0, delivery: 0` (se completan manualmente después).
- **`GET /api/delivery-zones` eliminada** (0005) — nada la consumía, ni el front ni el resto de la API.
- El resto (`GET /api/products`, `/api/categories`, `/api/availability`, `GET /api/orders`) sigue igual.
- **`PATCH /api/orders/:numero/status` eliminada** (confirmada huérfana en el barrido de seguridad, ver §10) — la validación de items de `POST /api/orders` se extrajo a `services/pedidosTienda.ts` para que la reuse también `crearPedido` (tool del bot, ver Semana 2 en el roadmap).
- **CORS restringido** (ya no `origin: true`): solo `https://bake-brothers.vercel.app` (+ alias de rama `main`) y `http://localhost:5173`. Verificado con evidencia real: un origen permitido recibe `Access-Control-Allow-Origin`, uno arbitrario no.

## 5. Verificado en Semana 1

- ✅ `pnpm test`: tests de dominio ajustados (se quitaron los de cupón/delivery/totales; quedan tamaños, precio de línea, subtotal, anticipación, capacidad, máquina de estados).
- ✅ `pnpm build`: los tres paquetes (`domain`, `api`, `web`) compilan sin errores tras los cambios de esquema/dominio.
- ✅ Landing revisada página por página: sin referencias a carrito/checkout/cupón/login.
- ✅ Cadena `0001→0008` corrida de punta a punta contra Postgres 16 real en Docker (local) — ver detalle en §6.
- ✅ Cadena `0001→0008` aplicada contra el Supabase real del proyecto (`umyaytrojtbdvdzbrily`, São Paulo) — ver evidencia en §6.

## 6. Qué falta — deuda conocida

- **Cadena 0001→0004 validada localmente (Postgres 16 en Docker) y luego contra Supabase
  real.** Primero se corrió limpia de punta a punta contra un contenedor Postgres 16
  vanilla (no Supabase), con un `auth.users` mínimo creado a mano como fixture de prueba
  (Supabase ya lo provee de fábrica; Postgres vanilla no). Verificado con evidencia real,
  no solo revisando el catálogo: `orders_canal_check` acepta `facebook`/`instagram`
  (insert real), no quedan políticas `tenant_isolation` en `pg_policies` (solo sigue
  `tenants_read`), y los `grant` a `app_api` funcionan de verdad (`SET ROLE app_api` +
  INSERT/SELECT real) en `sedes`, `stock`, `combos`, `combo_items` y `reglas_catering`.
  **`usuarios_dashboard` deniega el acceso a `app_api`** (`permission denied`) — es lo
  esperado, esa tabla la gestiona Supabase Auth/el dashboard, no la API; no tiene grant a
  propósito.
  Al validar se encontró y arregló un bug real preexistente (no introducido en esta
  sesión): `0002_seed_bake_brothers.sql` insertaba usando `products.orden`, columna que
  recién se crea en `0003_products_orden.sql` — la cadena 0001→0002→0003 nunca se había
  corrido en orden estricto contra una BD limpia antes de esta prueba. Se corrigió
  adelantando `alter table products add column if not exists orden...` a 0002 y volviendo
  idempotente el mismo ALTER en 0003.
- **La cadena completa 0001→0008 ya está aplicada contra el Supabase real**
  (`umyaytrojtbdvdzbrily`, São Paulo) — vía el conector MCP, migración por migración, con
  la misma evidencia que en Docker: `orders_canal_check` con los 4 canales, 0 políticas
  `tenant_isolation`, grants de `app_api` confirmados por `information_schema.role_table_grants`
  (el `SET ROLE` directo no tiene permiso desde la conexión del MCP — verificado por
  catálogo en su lugar), y los conteos de catálogo/combos/catering_items idénticos a la
  validación local (58 productos, 13 combos, 25 combo_items, 49 tamaños, 14
  catering_items, 14 reglas_catering, 31 productos con foto, 7 combos con foto).
  El proyecto de branching de Supabase quedó descartado en el camino: el plan free no
  soporta "development branches", así que las migraciones se aplicaron directo contra la
  base principal — viable porque el proyecto estaba vacío (sin datos reales en juego).
  Hubo un proyecto intermedio en Oregon (`vkkjoxvgrmzbxagppjpv`) migrado con el mismo
  procedimiento y luego eliminado por el cliente — ya no existe, no es el real.
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

- ✅ **Semana 1 — Diagnóstico + poda + esquema**: landing sin carrito/checkout/auth, migración 0004 (sedes, stock, combos, reglas_catering, usuarios_dashboard, fin del multi-tenant), 0005 (retira delivery_zones), 0006 (catálogo real: 58 productos, 13 combos), 0007 (catering_items), 0008 (fotos reales), `packages/domain` sin cupón/delivery. Las 8 migraciones ya están aplicadas contra el Supabase real (`umyaytrojtbdvdzbrily`, São Paulo). `apps/api/Dockerfile` listo para desplegar en Coolify (sin correr migraciones al iniciar). `apps/web` ya salió del modo demo en producción (ver §9).
- 🚧 **Semana 2 — Webhook de Meta + RAG**: base sentada, sin credenciales reales de Meta todavía (ver §9). Hecho: 0009 (`conversaciones`), 0010 (pgvector + `contenido_rag`), `apps/api/src/bot/tools.ts` (4 funciones de solo lectura — precio/disponibilidad/combo/reglas de catering), `GET/POST /webhook` (verificación + log crudo, sin lógica de respuesta). **RAG con embeddings reales ya hecho**: `contenido_rag` poblada con las 29 filas reales de `products.ingredientes/alergenos/respuesta_rapida` (0015 corrigió la columna a `vector(1024)` — Voyage `voyage-3.5`, confirmado contra su API real, no 1536 como se había asumido en 0010), embeddings generados con Voyage, búsqueda semántica en `apps/api/src/bot/rag.ts` (pgvector `<=>`), probada contra datos reales. **Cerebro de conversación: hecho** (`apps/api/src/bot/cerebro.ts`) — `evaluarTurno` corre un loop de tool-use real contra Claude Sonnet (`@anthropic-ai/sdk`, modelo `claude-sonnet-5`) exponiendo `consultarPrecio`/`consultarDisponibilidad`/`consultarCombo`/`consultarReglasCatering`/`evaluarSemaforoCateringPedido` (las tools reales de `bot/tools.ts`) más una tool nueva `escalarAHumano` para que el modelo señale la derivación de forma estructurada, no por texto libre. Dos garantías que NO dependen del modelo: (1) alergias/intolerancias/"libre de" se interceptan por regex ANTES de llamar a Claude, con una respuesta fija — nunca pasa por el LLM ni por el RAG; (2) si `evaluarSemaforoCateringPedido` da amarillo/rojo, el código fuerza `escalada` aunque el modelo no llame a `escalarAHumano`. Loop de tool-use con límite duro de 6 vueltas (si se agota, fuerza una respuesta de espera + escala, nunca deja al cliente sin respuesta ni loopea infinito). `procesarMensajeEntrante` es el único punto que persiste en `conversaciones.historial`/`estado` — si la conversación ya está `escalada`/`atendida_por_operador` no pasa el mensaje por el bot, solo lo loguea. Probado con 8 casos reales (`apps/api/test/cerebro.test.ts`, contra Supabase real vía rol temporal + la API real de Anthropic — no hay mock del modelo): precio, disponibilidad, combo con sustitución, catering verde, catering amarillo por domingo, alergia, reclamo y mensaje ambiguo sin tool — los 8 terminaron en la acción esperada. **Las dos garantías forzadas por código, probadas aparte y de verdad** (`apps/api/test/cerebroForzado.test.ts`, sin depender de que el LLM real se comporte de cierta forma): `decidirEscaladaForzadaPorTool` (la decisión de forzar, extraída como función pura, sin I/O) probada con amarillo/rojo/verde/otra-tool; y dos tests que mockean el SDK de Anthropic (nunca la lógica de negocio, y sin necesitar `ANTHROPIC_API_KEY` real) para controlar exactamente qué "dice" el modelo — uno confirma que, aunque el modelo mockeado responde con un texto de confirmación y NUNCA llama a `escalarAHumano`, el semáforo real (Tequeños + domingo real, contra la DB) igual fuerza `escalada`; el otro mockea el modelo para que pida una tool sin parar y confirma que el loop corta exactamente a las 6 vueltas (`MAX_VUELTAS_TOOL_USE`), con el fallback + escalada esperados, no antes ni indefinido. **Bug encontrado en esa misma revisión, corregido**: cuando el código forzaba la escalada sin que el modelo llamara a `escalarAHumano`, el texto que quedaba registrado seguía siendo la confirmación indebida que el modelo había escrito (el estado decía `escalada` pero el mensaje al cliente decía "confirmado") — `evaluarTurno` ahora distingue "el modelo escaló por su cuenta" de "el código forzó la escalada" y en el segundo caso reemplaza el texto por `RESPUESTA_ESCALADA_FORZADA_FIJA` (nunca confirma, avisa que queda pendiente de revisión); probado con el contenido exacto del mensaje, no solo el estado, más un test de regresión que confirma que el texto propio del modelo SÍ se conserva cuando la escalada fue una decisión suya. **`crearPedido`: hecho** — el bot ya puede registrar un pedido real, no solo consultar. 0019 agrega `order_items.catering_item_id` (nullable, FK a `catering_items`) y vuelve `product_id` nullable, con un check que exige exactamente uno de los dos — decisión tomada junto con el cliente (ver AskUserQuestion): catering_items no tiene ningún precio de catálogo (la fuente dice que el operador siempre cotiza a mano, "Validar → Cotizar → Cobrar"), así que las líneas de catering se insertan con `precio_unitario = 0`, mismo criterio que ya usa `delivery`. `services/pedidosTienda.ts` extrae la validación+precio real de `POST /api/orders` (catálogo, tamaños, extras, anticipación, capacidad) para que `crearPedido` la reuse sin duplicarla; `services/pedidosCatering.ts` re-evalúa el semáforo del lado del servidor SIEMPRE (nunca confía en que el modelo solo haya llamado a `crearPedido` después de ver verde) y rechaza el pedido completo si algún ítem no da verde — ese rechazo además fuerza `escalada` (extensión de `decidirEscaladaForzadaPorTool`), probado con un test real donde el modelo mockeado salta directo a `crearPedido` con un ítem de catering por debajo del mínimo, sin llamar antes al semáforo. Teléfono es obligatorio siempre (incluso en WhatsApp con el remitente ya conocido) y es la clave de `findOrCreateCustomer` — no el canal/external_id de la conversación — así el mismo cliente queda reconocido entre WhatsApp/FB/IG; el canal de `orders.canal` sí sigue saliendo de la conversación real. `sede_id` quedó conectado de punta a punta como parámetro (bug encontrado de paso: ni siquiera `POST /api/orders` lo pasaba nunca a `insertarPedido` pese a que la columna existe desde 0004) — hoy siempre null porque no hay mapeo real de número de WhatsApp → sede, se conecta cuando existan los números reales. Pago: si el cliente dice que va a pagar por adelantado, el pedido nace en `payment_pending`; nunca se procesa ni verifica ningún comprobante — el bot hoy es solo texto, no puede ver imágenes (capturas de pago), queda señalado como pendiente para una tarea futura. **Bug real encontrado con el modelo real, corregido**: `crearPedido` inicialmente esperaba el slug exacto del producto (como manda `apps/web`, que ya conoce el catálogo estructurado) — el bot solo tiene el nombre aproximado que escribió el cliente (mismo criterio que `consultarPrecio`), así que todo intento de pedido fallaba con `PRODUCTO_NO_ENCONTRADO`. Se agregó `productoParaPedidoPorBusqueda` (slug exacto O texto aproximado, el slug exacto sigue priorizando — no cambia nada para `apps/web`). Probado con 2 casos reales completos (`apps/api/test/cerebro.test.ts`, casos 9 y 10) que terminan en un pedido de verdad creado y verificado contra la base (número real, estado, total, cliente, item) y borrado al final: tienda simple → `confirmed`; catering verde con adelanto → `payment_pending`. La conversación real con el modelo a veces pide una confirmación extra antes de crearPedido (variación normal, no un bug) — los tests simulan hasta 4 turnos insistiendo con una confirmación genérica, igual que haría un cliente real. Sin conectar a nada todavía, a propósito (ni webhook ni envío real de mensajes). Pendiente: credenciales reales de Meta.
- 🚧 **Semana 2 (cont.) — `POST /webhook` conectado de verdad a `cerebro.ts`, async + idempotente (2026-09-24)**: antes de esto, `POST /webhook` solo loggeaba el payload crudo y no llamaba a `procesarMensajeEntrante` en ningún lado — confirmado leyendo el código, no asumido. Ahora parsea el payload real de WhatsApp Cloud API (`bot/parsearMensajesWhatsApp.ts` — solo mensajes de texto; otros tipos de mensaje y Messenger/Instagram se ignoran a propósito por ahora, sin payload real de esos dos todavía para construir el parser sin adivinar su forma) y llama al cerebro real. Meta considera fallido cualquier webhook que tarde más de ~3s en responder y reintenta el mismo mensaje — el handler ahora responde `200` apenas termina la única parte síncrona (la marca de idempotencia, ver abajo) y procesa el resto en segundo plano sin esperarlo (`bot/procesarWebhookWhatsApp.ts`, fire-and-forget — válido porque `apps/api` es un proceso persistente en Coolify, no serverless). Idempotencia real: 0024 agrega `mensajes_webhook_procesados` (el `mensaje_id` real de WhatsApp como PK) — un `insert ... on conflict do nothing` síncrono ANTES de responder marca el mensaje; si Meta reintenta el mismo id, el insert no inserta nada y no se vuelve a correr el cerebro ni se duplica un pedido. `conversacionesRepo.ts` (nuevo) resuelve la sede por `whatsapp_phone_number_id` y hace find-or-create de la conversación — tampoco existía antes (`procesarMensajeEntrante` asumía un `conversacionId` ya dado, no lo resolvía). Si el cerebro falla en el background (Meta ya no puede reintentar, ya recibió su 200), se loggea el error real y se fuerza `escalada` en la conversación como red de seguridad — nunca queda un mensaje real sin respuesta y sin que nadie se entere; dos transacciones separadas (no una) para que, si la segunda falla y hace rollback, la conversación de la primera siga existiendo y haya algo que escalar. Probado con evidencia real, no solo revisando el código (`apps/api/test/webhookWhatsApp.test.ts`, SDK de Anthropic mockeado con delays reales de 1.2s por vuelta — no simulados): el POST responde en menos de 2.5s aunque el cerebro tarde ~3.6s reales de fondo, y el mismo mensaje (mismo id real de WhatsApp) mandado dos veces no duplica ni el historial de la conversación ni un pedido — verificado contra la base real, incluido un pedido de tienda real creado vía `crearPedido`. **Pendiente**: `apps/api` todavía no se redesplegó en Coolify con este código (ver §9) — hace falta antes de que esto sirva contra tráfico real de Meta.
- 🚧 **Semana 2 (cont.) — eventos de Messenger/Instagram sin procesar, guardados en crudo (2026-09-24)**: como todavía no hay parser real para esos dos canales, antes un evento de Messenger (`object: "page"`) o Instagram (`object: "instagram"`) que llegara a este mismo webhook se perdía apenas rotaban los logs de Coolify — solo quedaba el `app.log.info` genérico. 0025 agrega `eventos_meta_sin_procesar` (`canal`, `payload` jsonb, `recibido_en`) — `bot/parsearMensajesWhatsApp.ts` gana `detectarCanalNoWhatsApp` (lee el `object` real del payload, nada más) y el handler guarda el **payload crudo completo**, no un resumen, antes de responder. El objetivo es poder construir el parser real de Messenger/Instagram después contra ejemplos que de verdad llegaron, no a ciegas contra la documentación de Meta. Probado con evidencia real (`apps/api/test/webhookEventosNoWhatsApp.test.ts`, payloads reales con la forma real de la Messenger Platform/Instagram Messaging API): un evento de cada canal se guarda con el `canal` correcto y el payload íntegro (comparado campo por campo, no solo que exista una fila), y un payload real de WhatsApp confirmadamente NO cae acá (sin falsos positivos).
- 🚧 **Semana 2 (cont.) — el bot ya responde de verdad por WhatsApp, y un fallo interno escala en vez de perderse (2026-09-24)**: confirmado antes de tocar nada — `procesarMensajeEntrante` (`cerebro.ts`) nunca había llamado a `enviarMensajeMeta`, solo escribía la respuesta del bot en `conversaciones.historial`; y `enviarMensajeMeta` seguía siendo el stub que lanzaba excepción siempre. El bot procesaba todo bien internamente pero jamás le llegaba nada al cliente. Ya está conectado: `bot/meta.ts` implementa el envío real contra la Cloud API de WhatsApp (`POST https://graph.facebook.com/v21.0/{phone_number_id}/messages`), gateado por `META_WHATSAPP_TOKEN` (mismo criterio que `META_APP_SECRET`: se lee directo de `process.env`, no está en `env.ts`, falla visible y nunca en silencio si falta — documentado en `.env.example`, pendiente configurar en Coolify). `bot/procesarWebhookWhatsApp.ts` llama a `enviarMensajeMeta` con el texto real que generó `evaluarTurno`, dentro del mismo try/catch que ya forzaba `escalada` — así un fallo al ENVIAR pesa exactamente igual que un fallo al CALCULAR la respuesta (para el cliente, las dos son silencio). La red de seguridad ahora también deja un motivo real e inspeccionable: `forzarEscaladaDeSeguridad` escribe `contexto.ultimoError.motivo` con el mensaje real del error (no había columna para esto — `contexto` ya estaba documentada como estructura libre para justo este tipo de bookkeeping). Probado con evidencia real: `apps/api/test/meta.test.ts` (fetch mockeado, sin credenciales reales de Meta — no existen todavía) confirma la URL/headers/body exactos de la llamada real y que falla visible sin token; `apps/api/test/webhookWhatsApp.test.ts` se extendió para confirmar que la respuesta del bot SÍ se manda por WhatsApp (fetch llamado una vez, con el texto real) y que un reintento de Meta no la manda dos veces — y un caso nuevo fuerza un error REAL del SDK de Anthropic (`mockCreate.mockRejectedValueOnce`, no un rechazo de negocio) y confirma que la conversación queda `escalada` con el motivo real del error guardado, sin que se intente mandar nada. **Importante para mañana**: hasta que `META_WHATSAPP_TOKEN` se configure de verdad en Coolify, CUALQUIER respuesta que el bot calcule terminará escalada (el envío real siempre va a fallar sin el token) — es el comportamiento correcto y esperado, no un bug, pero significa que un humano va a tener que responder manualmente por WhatsApp hasta que el token esté puesto.
- 🚧 **Semana 3 — Dashboard v1**: `apps/admin` scaffoldeado y probado contra el Supabase real — login, pedidos (lista + cambio de estado + **tiempo real**, 0016: la lista se actualiza sola vía Supabase Realtime, verificado cambiando un estado desde afuera del navegador), stock por sede, **clientes (CRM básico)** con historial de pedidos por cliente (reusa `usePedidos`/`TablaPedidos`, sin duplicar lógica) y columna "Último pedido" en la lista (consulta agregada sobre `orders`, sin cambio de esquema — el máximo `creado_en` por `customer_id`), **atribución por canal** con filtro de fecha, **bandeja de conversaciones** (`/conversaciones` — lista las escaladas por el bot, historial + responder; enviar transiciona `escalada → atendida_por_operador` con el mismo trigger de máquina de estados que orders, 0017; el envío real a Meta era un stub en `apps/api/src/bot/meta.ts` en ese momento — ya no, ver más abajo). RLS activa en `orders`/`stock` (0011), `customers` (0014) y `conversaciones` (0017) — todo verificado con JWT real contra la API REST real, incluidos los triggers de transición de estado (orders y conversaciones). 0012/0013 corrigieron un hallazgo real de seguridad (ver §9). Desplegado en Vercel (`bake-brothers-admin.vercel.app`, ver §9). **Semáforo de catering: hecho** (`evaluarSemaforoCatering` en `packages/domain`, `evaluarSemaforoCateringPedido` como tool del bot en `apps/api/src/bot/tools.ts`) — 0018 agrega `reglas_catering.admite_corte_noche_anterior` (decisión tomada junto con el cliente, no en silencio: `anticipacion_horas` plano no alcanzaba para el corte de las 8:30pm, que no es uniforme entre los 14 ítems). Verificado con datos reales dos veces (réplica local + Supabase real de producción). Sin conectar a nada todavía, a propósito. **"Nuevo pedido": hecho** (`apps/admin/src/pages/NuevoPedido.jsx`) — un operador arma un pedido real a mano, sin pasar por el bot. Puente nuevo `POST /api/dashboard/orders` + `GET /api/dashboard/orders/:numero/comprobante.pdf` en `apps/api`, protegido por JWT real: `auth/verificarJwtOperador.ts` verifica la firma contra el JWKS público de Supabase (ES256, clave asimétrica — sin secreto compartido que manejar) y resuelve rol/sede_id reales consultando `usuarios_dashboard` con la conexión de `app_api`, nunca confiando en lo que mande el navegador — un operador queda forzado a su propia sede aunque mande otra en el body (probado real); un admin puede elegir sede. Reusa `pedidosTienda.ts`/`pedidosCatering.ts` (los del bot) sin duplicar lógica — incluye que el gate "solo verde" de catering aplica igual acá, sin excepción para el operador (decisión deliberada, no se construyó ningún override). **Combos como pedido real: nuevo** (`services/pedidosCombos.ts`, 0020) — `order_items.combo_id` (tercera vía junto a product_id/catering_item_id, exactamente una de las tres), precio = `combos.precio_promo` fijo. Un combo con `canal_permitido='whatsapp'` exclusivo se rechaza desde el dashboard (probado real, creando un combo temporal de prueba porque ningún combo real de hoy es así). Comprobante en PDF con **pdfkit** (JS puro, sin Chromium — la imagen Alpine de Coolify es chica) generado al vuelo desde el estado real del pedido, con el logo real (`apps/api/assets/`, copiado explícito en el Dockerfile porque `pnpm deploy` no lo garantizaba) — verificado visualmente, layout y totales correctos. "¿Ya pagó?" Sí/No mapea limpio a `paid`/`confirmed` (confirmado por el propio comentario de `orderStatus.ts`: "confirmed → in_production existe para el pago contra entrega") — `payment_pending` queda reservado para el adelanto del bot, no participa acá. **Tres bugs reales encontrados recién al probar contra el JWT real** (no en la revisión de código): (1) `app_api` no tenía grant en `usuarios_dashboard` — 0021 lo agrega; (2) esa tabla tiene RLS y solo tenía política de SELECT para `authenticated`, ninguna para `app_api` — el grant solo no alcanzaba, 0022 agrega la política de bypass que sí tienen orders/stock/customers/conversaciones desde que se les activó RLS; (3) CORS no incluía el origen de `apps/admin` (ni local ni producción) — agregado. Probado con 7 casos reales de punta a punta (`apps/api/test/dashboardOrders.test.ts`, JWT real de un operador de prueba vía Supabase Auth, sin mock de la verificación): sin auth, JWT inválido, tienda+combo con sede forzada, catering verde pagado, combo whatsapp-exclusivo rechazado, admin eligiendo sede, y el PDF real (bytes `%PDF`) — el caso de rol admin corre en una invocación de vitest aparte (`TEST_ROL_ADMIN=1`) porque el propio test no puede cambiarle el rol al usuario de prueba (mismo motivo que el bug 2: RLS). **Verificación en navegador: completada después** (se resolvió el bloqueo del rate limit — ver el punto de "cuentas reales de personal" más abajo — y se confirmó la pantalla completa logueado de verdad). **Pendiente**: Kanban por columnas (solo se hizo la parte de tiempo real), combos con CRUD (desde el dashboard — vender un combo ya funciona, administrarlos todavía no), envío real de mensajes a Meta.
- 🚧 **Semana 3 (cont.) — cuentas reales de personal + identidad visual del dashboard**: las 3 cuentas reales de operadores/admin (`adminalameda@bake-brothers.com` → operador/Cedros, `adminsantamaria@bake-brothers.com` → operador/Santa Marina, `adminbake@bake-brothers.com` → admin/sin sede) ya existen en `usuarios_dashboard`, con login real probado (password fuera de este archivo). El signup público (`/auth/v1/signup`) seguía bloqueado por el mismo rate limit de emails de Supabase que ya había frenado la verificación de "Nuevo pedido" — se creó cada cuenta con INSERT directo en `auth.users`/`auth.identities` (password hasheado con pgcrypto `crypt(..., gen_salt('bf'))`, el mismo bcrypt que usa Supabase Auth; `email_confirmed_at` seteado directo, sin depender de que el dominio reciba correo — confirmado con `nslookup`: `bake-brothers.com` no tiene MX, no puede recibir email real hoy). Antes de tocar las 3 cuentas reales se validó el método completo con una cuenta descartable (creada, un login por password real contra `/auth/v1/token` confirmó un `access_token` de verdad, borrada). En esa validación salió un bug real de Postgres/GoTrue: dejar `confirmation_token` (y las demás columnas `*_token`/`email_change*`) en `NULL` en vez de `''` rompe el login con `500 unexpected_failure` — GoTrue las escanea como `string` Go, no como nulables (`sql: Scan error on column ... converting NULL to string is unsupported`, visible en los logs de `auth_logs`). Las 3 cuentas reales ya se crearon con esas columnas en `''` desde el inicio. Saludo nuevo al entrar: `AuthContext.jsx` ahora trae `sedes(nombre)` en el mismo query de `usuarios_dashboard` (mismo patrón que ya usan `usePedidos`/`useConversaciones`); operador ve "Bienvenido/a, Administrador/a de [sede real]", admin ve un saludo general sin sede — verificado con captura real logueado como ambos roles. Identidad visual: `imagenes/logo/` tenía 5 archivos nuevos (logo real sin fondo + 4 variaciones cromáticas); se copió `LogoBakeBrothers-sin-fondo.png` a `apps/admin/public/img/logo-bakebrothers.png` y reemplaza el texto placeholder del header y del login. Se muestreó el color real de `BakeBrothers-caramelo.png` (`#A96E34`) y se agregó como `--color-caramelo`/`--color-caramelo-suave` en `index.css` — antes la interfaz era blanco/negro/gris puro; ahora el nav activo, su hover y el saludo lo usan (las variantes negro/blanco/crema no se usaron: casi idénticas a tokens ya existentes o sin ningún fondo oscuro real donde aplicarlas). **Bug de plataforma encontrado al verificar, corregido**: el logo con solo `h-9 w-auto` (mismo patrón que ya usa `apps/web/src/components/Logo.jsx`) se renderizaba aplastado (17.5px de ancho en vez de ~64px) específicamente en el navegador de previsualización de esta sesión — el motivo exacto no se determinó (no dependía de flexbox anidado, confirmado quitando un wrapper de sobra), pero forzar `width`/`height` explícitos en el `<img>` (además de las clases) lo arregló de forma robusta e independiente del motor de renderizado. Build y los 54+23 tests de siempre en verde.
- 🚧 **Semana 2 (cont.) — confirmado: una conversación escalada/atendida por operador NO recibe respuesta automática del bot (2026-09-24)**: antes de conectar a Meta se pidió confirmar este comportamiento con evidencia real, no solo revisando el código. Resultado: **ya estaba bien construido desde que se escribió `procesarMensajeEntrante`** (`cerebro.ts`) — cuando el estado es `escalada` o `atendida_por_operador`, la función guarda el mensaje del cliente en `historial` (para que el operador lo vea) y devuelve `null` sin llamar a `evaluarTurno` (el loop que habla con Claude); `procesarWebhookWhatsApp.ts` ya interpretaba ese `null` como "no hay nada que mandar" y no llamaba a `enviarMensajeMeta`. No hizo falta ningún cambio de código, solo faltaba la prueba real que lo confirmara. Se agregó (`apps/api/test/webhookWhatsApp.test.ts`, 2 casos nuevos vía `it.each` para `escalada` y `atendida_por_operador`): una conversación de prueba se crea directo en ese estado con historial previo, se le manda un mensaje nuevo por el webhook real, y se confirma que el historial crece en exactamente una entrada (`rol: cliente`), el `estado` no cambia, y — lo más importante — `mockCreate` (el SDK de Anthropic) y `mockFetch` (el envío por WhatsApp) **nunca se llaman**. La única forma de que el bot vuelva a responder solo es que el operador devuelva la conversación a `activa` a mano (ya existe esa transición en `conversationStatus.ts`/`Conversaciones.jsx`). 5/5 tests del archivo en verde contra Supabase real (rol temporal `temp_webhook_escalada_test`, dropeado al terminar).
- 🚧 **Semana 3 (cont.) — la bandeja de Conversaciones ya manda el mensaje real por WhatsApp (2026-09-24)**: hasta ahora "enviar" en `/conversaciones` solo escribía `historial`/`estado` directo en Supabase — el envío real a Meta era el stub que siempre lanzaba (ver bullet de arriba). Nueva ruta `POST /api/dashboard/conversaciones/:id/responder` (`routes/dashboardConversaciones.ts`), protegida por el mismo `verificarJwtOperador` que ya usa "Nuevo pedido": resuelve la conversación real, fuerza que un operador (no admin) solo pueda responder conversaciones de su propia sede (nunca confía en lo que mande el cliente — mismo criterio que `crearPedidoDashboard`), resuelve el `whatsapp_phone_number_id` real de esa sede, y llama a `enviarMensajeMeta` — la MISMA función real que ya usa el bot, no una segunda implementación. **Orden estricto**: solo si el envío tiene éxito se actualiza `historial`/`estado` (`services/responderConversacion.ts`) — un fallo (sin token todavía, error real de Meta, sede sin WhatsApp configurado, sin sede asignada) se devuelve tal cual al operador (`error`/`detalle` reales), nunca un "listo" falso. `apps/admin`: `Conversaciones.jsx`/`useConversaciones.js` ya no escriben directo en Supabase para responder — pasan por `apiClient.js` (mismo patrón que "Nuevo pedido"), y el error se muestra inline en la pantalla (no un `alert()`), con `error.message`/`error.detalle` visibles. Probado con 7 casos reales de punta a punta (`apps/api/test/dashboardConversaciones.test.ts`, JWT real de las 3 cuentas reales de personal — sin mock de la verificación): sin auth, envío exitoso (URL/headers/body de la Cloud API verificados igual que en `meta.test.ts`, y recién ahí `historial`/`estado` se actualizan), envío fallido (historial/estado quedan intactos, el error real llega al caller), operador de otra sede rechazado (403, sin intentar mandar nada), admin puede responder cualquier sede, conversación sin sede asignada (422) y sede sin WhatsApp configurado (422). **Bug real encontrado armando el test, corregido en el test — no en el código**: mockear `fetch` a ciegas para simular el envío a Meta también interceptaba el fetch real que usa `jose` (`createRemoteJWKSet`) para traer el JWKS de Supabase dentro de `verificarJwtOperador` — todo devolvía 401 en silencio hasta que se corrigió el mock para dejar pasar cualquier URL que no sea `graph.facebook.com`. **Verificación en navegador: intentada, bloqueada por el sandbox, no por el código** — logueado de verdad como `adminalameda@bake-brothers.com` contra un `apps/api` local (rol temporal de Postgres, `.env` local descartado al terminar) se pudo ver la conversación real y mandar el mensaje, pero la llamada del servidor al JWKS de Supabase falló con `SELF_SIGNED_CERT_IN_CHAIN` — un proxy TLS del sandbox de este navegador de previsualización, confirmado con el error real de Node/undici, no algo del código (los tests automatizados corren fuera de ese sandbox y sí llegan a la red real, con los 7 casos ya probados como evidencia). Queda anotado por si vuelve a aparecer en una próxima verificación en navegador de este entorno.
- 🚧 **Semana 3 (cont.) — Panel de Métricas para el dueño/admin (2026-09-24)**: `apps/admin/src/pages/Metricas.jsx`, nueva. Ingresos, pedidos, ticket promedio, productos/combos más vendidos (por cantidad y por ingresos — no se asume que coinciden) y tendencia diaria, con filtro de rango de fechas (presets Hoy/Esta semana/Este mes/Personalizado, mismos `<input type=date>` que ya usa `Atribucion.jsx`) y de sede (admin: selector "todas o una"; operador: bloqueado a la suya, mismo patrón visual que `Stock.jsx` — badge fijo, sin `<select>`). **Se mantiene separada de `Atribucion.jsx`** (decisión evaluada, no en silencio): el alcance pedido no menciona desglose por canal en ningún punto — son dos lentes distintas sobre `orders` (financiero/operativo vs. marketing) y fusionarlas hubiera expandido el alcance sin que se pidiera.

  **Hallazgo real antes de escribir nada**: `order_items` nunca recibió grant a `authenticated` cuando 0012/0013 cerraron el hueco de seguridad (esas migraciones solo re-otorgaron `orders`/`stock`/`sedes`/`products`/`usuarios_dashboard`) — un usuario logueado del dashboard no podía leerla (`permission denied`), bloqueante para "productos más vendidos". 0026 lo corrige: `grant select` a `authenticated`, RLS habilitada (estaba deshabilitada desde 0004) con el mismo criterio que `orders`/`conversaciones` (`app_api` pasa libre, `authenticated` se filtra por sede vía join a `orders`, porque `order_items` no tiene `sede_id` propio).

  **Arquitectura de las consultas**: en vez de traer filas crudas al navegador y sumar en JS (lo que ya hace `Atribucion.jsx`, con el techo de 1000 filas de PostgREST), 0026 agrega 3 funciones SQL agregadas (`metricas_kpis`, `metricas_productos_vendidos`, `metricas_tendencia_diaria`) expuestas como RPC de Supabase, `security invoker` para heredar el RLS de quien llama sin duplicar el filtro de sede adentro de la función. **`GRANT EXECUTE` explícito a `authenticated` en las 3** — 0013 también había revocado el privilegio por defecto que Postgres le da a funciones nuevas, no solo a tablas; sin ese grant la función existe y PostgREST la expone en el schema cache, pero cualquier llamada real devuelve `permission denied` (encontrado por diseño, no por prueba y error — ya se sabía por 0013 antes de escribir la migración). "Ingreso" = todo estado de pedido excepto `cancelled` (`ESTADOS_QUE_CUENTAN_COMO_INGRESO`, nuevo en `packages/domain/src/orderStatus.ts`, con test propio) — la función SQL no puede importar TS, así que la lista se duplica ahí a propósito, mismo criterio que ya existe entre `conversationStatus.ts` y su trigger (0017). Fecha de referencia: `creado_en` (no `fecha_entrega`), igual que `Atribucion.jsx`. `metricas_tendencia_diaria` usa `generate_series` para no saltarse días sin pedidos (un hueco silencioso mentiría sobre si un día tuvo 0 pedidos o no se calculó). `metricas_productos_vendidos` excluye líneas de catering a propósito (`precio_unitario` siempre 0, se cotiza a mano — no aporta nada comparable).

  **Validado en dos capas, como siempre**: cadena `0001→0026` completa contra Postgres 16 limpio en Docker (saltando 0010/0015, que dependen de pgvector — no disponible en la imagen vanilla, sin relación con esta migración), con datos de prueba reales insertados a mano (2 sedes, estados mixtos incluido uno `cancelled`) confirmando con números exactos: operador de una sede solo ve su propia sede (RLS), `cancelled` se excluye de ingresos pero sigue siendo visible en `order_items` (RLS es por sede, no por estado), admin ve todo o filtra por sede, y `anon` sin sesión es rechazado. Aplicada después a Supabase real. **Verificación explícitamente pedida**: las 3 RPC se llamaron por HTTP real con el JWT real de `adminalameda@bake-brothers.com` (operador, no `postgres`/`service_role`) — primero contra datos vacíos (200 con array vacío, no error), después insertando un pedido real de prueba en Cedros y repitiendo la llamada (200 con los números exactos del pedido insertado), y confirmando que sin `Authorization` la llamada falla con `403`/`permission denied`. Pedido de prueba borrado al terminar. Verificación final en el navegador real, logueada como `adminalameda` (operador: badge de sede fijo, sin selector) y como `adminbake` (admin: selector con "Todas las sedes"/Cedros/Santa Marina) — incluyó insertar un pedido real de prueba con un producto y un combo, recargar, y confirmar que los KPIs/top-productos/filtro-por-sede en pantalla coincidían exactamente con lo insertado (S/ 77.00, 2 und. de un producto, 1 und. de un combo, 0 al filtrar a la sede sin el pedido) — borrado al terminar. Gráfico de tendencia: SVG propio sin dependencia nueva (`apps/admin` no tenía ninguna librería de charts). Build y los 55+27 tests de siempre en verde.

- 🚧 **Semana 3 (cont.) — bug real de timezone en el Panel de Métricas, corregido (2026-09-24)**: pedido de confirmación explícita con evidencia real, no dar el componente por bueno solo porque existe. Dos puntos:

  **(1) Días sin pedidos en la tendencia**: confirmado en el navegador con datos reales — un rango de 5 días con pedidos solo en 2 de ellos (los otros 3 deliberadamente vacíos) muestra los 5 días en el SVG (inspeccionado el DOM real, no solo la captura visual): los 3 días sin pedidos existen como `<rect>` con `height="0"` en la posición correcta del eje, con su `<title>` mostrando "día: S/ 0.00" — no desaparecen del gráfico. `metricas_tendencia_diaria` (0026) ya lo hacía bien desde el diseño (`generate_series` + `left join`), esto solo lo confirma con evidencia real en pantalla.

  **(2) Bug real encontrado en el límite de "Hoy" — corregido (0027)**: `SHOW timezone` en el Supabase real de este proyecto confirma sesión en `UTC` (el default de Supabase). Las 3 funciones de 0026 casteaban `fecha::timestamptz` directo, que Postgres interpreta con el timezone DE LA SESIÓN (UTC), no el del negocio (Lima, UTC-5). Reproducido con un pedido real antes de corregir: un pedido insertado con `creado_en` = hoy 21:00 hora Lima devolvía `pedidos: 0` en `metricas_kpis('hoy','hoy')` — 21:00 Lima cae fuera de la ventana `[hoy 00:00 UTC, mañana 00:00 UTC)` que la función calculaba (esa ventana en realidad cubre Lima 19:00 de AYER a Lima 19:00 de HOY, corrida 5 horas). Cualquier pedido tomado por WhatsApp después de las 7pm hora Lima no contaba como "de hoy" hasta el día siguiente. Fix en 0027: `fecha::timestamp at time zone 'America/Lima'` (medianoche EN LIMA, no en la sesión) en las 3 funciones — timezone hardcodeado a propósito, el negocio opera en un solo lugar. Validado contra Docker limpio con 3 pedidos de prueba a las 10am/7pm/11:59pm hora Lima del mismo día — los 3 quedan agrupados en el día correcto, ninguno se fuga a días adyacentes. Reaplicado a Supabase real y reproducido el mismo caso que antes fallaba: ahora `metricas_kpis('hoy','hoy')` cuenta el pedido de las 9pm — confirmado por RPC con el JWT real de un operador y también clickeando "Hoy" en el navegador real logueado. **De paso, el front también se hizo a prueba de esto**: `rangoHoy`/`rangoEstaSemana`/`rangoEsteMes` (`Metricas.jsx`) calculaban la fecha con `new Date().getDate()` del navegador — funciona si el dispositivo tiene el SO en hora de Lima (es lo esperado para el personal real), pero no lo garantiza. Se cambió a `Intl.DateTimeFormat` con `timeZone: 'America/Lima'` explícito, para no repetir del lado del cliente el mismo tipo de supuesto que ya causó el bug del lado del servidor. Pedidos de prueba borrados al terminar. Build y los 55+27 tests en verde.

- 🚧 **Semana 2 (cont.) — el bot ya puede vender combos, clasificados por datos reales (2026-09-24)**: `crearPedido` gana items `tipo: 'combo'`, reusando `services/pedidosCombos.ts` (ya construido para "Nuevo pedido" del dashboard) — no se duplicó esa lógica, se generalizó. Los 13 combos activos de hoy se leyeron de la base (no de una lista a mano) y clasificaron limpio en 3 grupos, sin ningún caso ambiguo:
  - **Grupo 1** (`combo_items` definidos, `permite_cambios=false`, 5 combos: Combo para ti, Combo Perfecto, Pack Postres de Locura, Pack Tres Delicias, Pie Pack) — el bot cierra directo, sin marca.
  - **Grupo 2** (`combo_items` definidos, `permite_cambios=true`, 5 combos: Combo Horneamos con amor, Combo Ideal, Pack Trio Cheesebake, Pack Trio Imperdible, Tortipack) — el bot cierra igual (nunca hace esperar al cliente "por si acaso"), pero el pedido nace con `orders.requiere_confirmar_combo=true` (0028, boolean simple) para que el equipo lo note en su revisión normal antes de preparar.
  - **Grupo 3** (sin `combo_items`, "sujeto a stock del día", 3 combos: Pack 12 empanadas, Pack 6 empanadas, Pack Petitbro) — el bot no tiene con qué confirmar una composición que no existe, escala a un humano (`decidirEscaladaForzadaPorTool` extendido con `COMBO_SIN_COMPOSICION_DEFINIDA`, mismo criterio que ya existía para catering en amarillo/rojo).

  Para el Grupo 2, la sustitución real que elige el cliente se captura como **datos estructurados** (líneas nuevas en `order_items` con `product_id` real y `precio_unitario=0`, mismo patrón que ya usa catering — el combo cobra su precio fijo una sola vez), no como texto libre — el pedido sigue siendo consultable igual que cualquier otro. `consultarCombo` (ya existente) le da al modelo `items`/`permiteCambios` para decidir el grupo antes de llamar a `crearPedido`; el SYSTEM_PROMPT ganó una regla 6 explicando esto.

  **`pedidosCombos.ts` se generalizó para las dos direcciones** (antes solo rechazaba `canal_permitido='whatsapp'` desde el dashboard) — ahora `comboDisponibleEnCanal` cubre ambos sentidos, y la señal de "esto lo vende un humano, no el bot" es el mismo `canalPedido==='presencial'` que ya usa `orders.canal` (sin un segundo parámetro que diga lo mismo dos veces). Las reglas de Grupo 2/3 solo se activan cuando decide el bot — un operador humano ya confirma todo a mano al vender, no necesita esta red de seguridad (`crearPedidoDashboard.ts` sigue exactamente igual que antes). El error `COMBO_NO_DISPONIBLE_PRESENCIAL` se renombró a `COMBO_NO_DISPONIBLE_EN_ESTE_CANAL` (mismo comportamiento real, nombre genérico ahora que cubre las dos direcciones) — `dashboardOrders.test.ts` actualizado y reverificado contra Supabase real, sin regresión.

  Probado con 4 casos reales contra Supabase real y el modelo real de Anthropic (`apps/api/test/cerebro.test.ts`, casos 11-14, sin mock): Grupo 1 (Pack Tres Delicias) → pedido creado sin flag; Grupo 2 (Tortipack, pidiendo "las dos porciones de carrot cake") → pedido creado con flag, mismo mensaje de confirmación inmediato que el Grupo 1 (se verificó explícitamente que el flag no cambia la respuesta al cliente), y la sustitución quedó guardada como línea de producto real con precio 0; Grupo 3 (Pack 6 empanadas) → el bot escala, cero pedidos creados; combo exclusivo presencial (Combo Ideal) pedido por WhatsApp → rechazado, cero pedidos creados (mismo criterio que ya prueba `dashboardOrders.test.ts` en la dirección contraria). Los 10 casos previos de `cerebro.test.ts` (precio, disponibilidad, catering, pedidos de tienda) siguen pasando sin cambios — 14/14 en verde. Migración 0028 validada contra Docker limpio (`0001→0028`) antes de aplicarse a Supabase real. Build y los 55+27 tests estructurales de siempre en verde.

- 🚧 **Semana 3 (cont.) — Conversaciones en tiempo real, con aviso sonoro (2026-09-25)**: mismo patrón que `orders` (0016) — `useConversaciones.js` se suscribe a `postgres_changes` sobre `conversaciones` (sin filtro server-side, recarga la lista entera en cualquier cambio, igual de robusto que `usePedidos.js`) y ya no hace falta recargar la página para ver una escalada nueva. Migración 0029: agrega `conversaciones` a la publicación `supabase_realtime` (Realtime respeta la RLS de sede de 0017, un operador solo se entera de lo suyo, igual que orders) y le pone `replica identity full` — esto último es la diferencia real con orders: el aviso sonoro solo debe sonar cuando una conversación *pasa* a `escalada` (una transición real), no en cada mensaje nuevo de una que ya lo está (el cliente sigue escribiendo mientras espera, eso solo toca `historial`) ni cuando otro operador la atiende — para distinguir esos casos en el cliente hace falta el `estado` ANTERIOR en el evento de `UPDATE`, que Postgres no manda con el replica identity por defecto (solo la PK).

  Aviso sonoro: `apps/admin/src/utils/sonidoAviso.js`, dos tonos cortos generados con Web Audio API (sin archivo de audio ni librería nueva) — un solo `AudioContext` reusado, nunca rompe la pantalla si el navegador lo bloquea (falla en silencio, `console.warn`). La restricción real de autoplay de los navegadores (el audio necesita una interacción previa del usuario en esa sesión) no hizo falta resolverla con ningún paso extra: **verificado real en el navegador**, no asumido — el login ya cuenta como esa interacción.

  **Verificación real de punta a punta**: dos pestañas logueadas como `adminalameda` (operador, Cedros), ambas en `/conversaciones`. Se instrumentó `AudioContext.prototype.createOscillator` desde la consola del navegador (sin tocar el código de producción) para contar invocaciones reales, sin poder "escuchar" el audio desde acá. Con un INSERT+UPDATE real simulando el flujo del bot (conversación nace `activa`, pasa a `escalada`, mismo patrón que `procesarMensajeEntrante`): la conversación nueva apareció en las dos pestañas sin recargar, y el contador de osciladores subió a 2 en la pestaña que no tuvo ninguna interacción directa después de cargar — confirma que el código real disparó el aviso sonoro por el evento Realtime, no por casualidad. Casos negativos probados aparte, mismo flujo: un `UPDATE` que solo agrega un mensaje al `historial` (conversación sigue `escalada`) actualiza la lista pero el contador se queda en 0 — no vuelve a sonar; un `DELETE` también se refleja al instante en ambas pestañas. Datos de prueba borrados al terminar. Build y los 55+27 tests estructurales de siempre en verde (sin tests automatizados nuevos — el cambio es 100% frontend + Realtime, la evidencia real es la del navegador).

  **Caso negativo real entre sedes — probado aparte, con evidencia real (2026-09-25)**: que la tabla ya tenga RLS por sede no garantiza que el canal de Realtime la respete — son dos mecanismos distintos, no se asumió. **Hallazgo real al intentar armar la prueba con dos pestañas de dos cuentas distintas**: `supabase-js` (v2.117) sincroniza la sesión entre pestañas del mismo origen (mismo `localStorage`) — loguear `adminsantamaria` en una pestaña nueva también cambió la sesión de la pestaña ya logueada como `adminalameda` (confirmado real: ambas terminaron mostrando "Bienvenido/a, Administrador/a de Santa Marina" sin haber tocado esa pestaña) — dos pestañas del mismo navegador **no pueden sostener dos sesiones de operadores distintos simultáneamente** con el cliente actual. Se rediseñó la prueba sin depender de eso: una sola pestaña fija logueada como `adminsantamaria` (Santa Marina), con control negativo y positivo reales. Negativo: se escaló una conversación real de **Cedros** (`sede_id` verificado antes de disparar) — el contador de osciladores se quedó en 0 y la conversación nunca apareció en la lista de Santa Marina, ni siquiera recargando la página completa (recarga incluida a propósito, para reconfirmar también que el fetch inicial vía RLS normal tampoco la filtra mal). Positivo (para descartar un falso negativo por una suscripción simplemente rota/desconectada): se escaló, en la misma pestaña sin volver a loguear, una conversación real de **Santa Marina** — el contador subió a 2 y la conversación apareció en la lista de inmediato. **Conclusión: RLS sí se aplica también a nivel de Realtime, no hay fuga de datos entre sedes** — no hizo falta ningún cambio de código, la migración 0029 ya lo hacía bien (Realtime hereda RLS de la tabla por diseño de Supabase; esto lo confirma con evidencia real en vez de asumirlo). Datos de prueba borrados al terminar.

- **Semana 4 — Inventario + atribución + cierre**: `stock` conectado al flujo real, atribución de marketing (`campana`/`ctwa_clid`), cierre y entrega.

### Landing de una sola vista en `apps/web` (2026-09-27) — reemplaza el sitio multi-página

Tarea aparte del roadmap del bot/dashboard: `apps/web` pasó de sitio multi-página (Home/
Catálogo/Producto/Ofertas/Catering/Nosotros/Contacto) a **una sola landing**, orientada 100%
a empujar a WhatsApp — sin carrito, sin checkout, sin formularios. Las páginas viejas y su
lógica (`CatalogContext`, `CatalogGate`, etc.) **se comentaron en `App.jsx`, no se
borraron** (queda `AppTiendaAnterior` inerte por si se retoman). Trabajado por etapas con
aprobación explícita del cliente después de cada una (videos → transición → empanadas →
cierre → pulido).

**Estructura** (`src/pages/Landing.jsx`): `VideosHero` → `EmpanadasGallery` → `ClosingFooter`
+ `WhatsAppFloatButton` fijo. `VideosHero` pinea el primer video (Alfajores Mix) y, atado al
mismo scroll (GSAP ScrollTrigger `scrub`), revela el segundo (Alfajores con Manjar Blanco)
mediante un `clip-path: circle()` que se expande — la transición "wow" pedida, sin animar
`top/left/width` (todo por `transform/opacity/clip-path`, 60fps). Reveal de texto por líneas
con `SplitText` (bundled gratis en `gsap` desde 2025, sin licencia Club GreenSock). Scroll
suave con **Lenis**, atado al ticker de GSAP. `EmpanadasGallery` pinea horizontal en desktop
(`gsap.matchMedia`) y usa scroll nativo con snap en mobile/`prefers-reduced-motion` (deliberado,
la propia tarea permitía simplificar ahí). Todo gatea por `usePrefersReducedMotion`.

**Config editable**: `src/config/landing.js` — precios, productos, mensajes de WhatsApp por
producto, locales, redes. El cliente cambia precios ahí, sin tocar componentes. Número de
WhatsApp real (`912944096`) en `utils/whatsapp.js`, ya existente. Cada CTA deja un
`data-whatsapp-click` + `CustomEvent('whatsapp_click')` con el nombre del producto, listo
para conectar analítica después — **no se integró ninguna herramienta de analítica todavía**,
a propósito (pedido explícito de la tarea).

**Librerías nuevas**: `gsap` + `@gsap/react` + `lenis`. Nada más — se evaluó
`@fontsource/fraunces`/`@fontsource/inter` y se descartó: `index.html` ya cargaba
Fraunces + Albert Sans por `<link>` de Google Fonts, agregar el paquete hubiera sido
una dependencia redundante.

**Assets**: originales (2 videos 360°, fotos de empanadas, logos) viven intactos en
`imagenes/` (raíz del repo, ya trackeados). Copias optimizadas generadas con ffmpeg a
`apps/web/public/`: video en H.264 (`.mp4`) + VP9 (`.webm`) sin audio + poster `.webp`
(primer frame); fotos de empanada a `.webp`. Identidad de los 2 videos (ninguno tenía
nombre claro) resuelta comparando el primer frame de cada uno, confirmada con el cliente
antes de continuar.

**Accesibilidad y SEO — barrido real con Lighthouse mobile, no solo revisado a ojo.**
Primera pasada: Accessibility 84, tres fallos reales:
- `SplitText` (GSAP) inyecta automáticamente un `aria-label` con el texto completo en el
  elemento que divide en líneas — un `<p>` no admite nombre accesible por `aria-label`
  según ARIA-in-HTML. Fix: `role="text"` en ese `<p>` (recomendación propia de la
  documentación de GSAP para este caso, no aplicado al `<h2>` del título porque ahí sí
  rompería la semántica de heading).
- **Contraste insuficiente en todos los CTA de WhatsApp**: texto blanco sobre el verde de
  marca `#25D366` da solo 1.98:1 (WCAG exige 4.5:1 en texto normal). Se oscureció el verde
  a `#0F7B3F` (5.35:1, sigue leyéndose claramente como "verde WhatsApp") en los 4 lugares
  de la landing que lo usan (botón flotante, CTA de cada video, badge de cada empanada,
  CTA del cierre) — **las páginas viejas de la tienda no se tocaron** (no están enrutadas,
  no las audita Lighthouse, fuera de alcance).
- El botón flotante no tiene texto visible en mobile (el `<span>` con la frase se oculta
  bajo `sm:`) y no tenía `aria-label` — se agregó soporte de `ariaLabel` en `WhatsAppCTA` y
  se usa en el flotante.
Segunda pasada: **Accessibility 100/100, SEO 100/100** (agregado `robots.txt`, meta
`description`/Open Graph/Twitter Card con la imagen de Alfajores Mix, `<link rel=canonical>`,
`lang="es-PE"`, preload del poster del primer video con `fetchpriority="high"` para el LCP,
`fetchpriority="low"` en el segundo video).

**Hallazgo real de paso, corregido**: las fotos de empanada se habían generado a 1000px de
ancho — sobredimensionadas para su despliegue real (~220-260px de ancho de tarjeta,
`aspect-[3/4]`). Lighthouse lo señaló como "imagen más grande de lo necesario" con datos
reales (82KB desperdiciados en una sola foto). Se regeneraron a 780px (cubre hasta 3x DPR
en el tamaño real de tarjeta) desde los PNG originales — no desde el `.webp` ya comprimido,
para no perder calidad en cascada — bajando el peso ~30% sin pérdida visible.

**Hallazgo de entorno, no del código — igual que el `SELF_SIGNED_CERT_IN_CHAIN` de una
sesión anterior, documentado en vez de perseguido a ciegas**: el antivirus Kaspersky de
esta máquina Windows intercepta a nivel de red TODO el tráfico HTTP de cualquier Chrome
lanzado localmente (incluido `localhost`) e inyecta un script propio
(`gc.kes.v2.scr.kaspersky-labs.com`) — confirmado con 3 combinaciones distintas de flags de
Chrome (`--proxy-server=direct://`, `--host-resolver-rules`, ninguna funcionó: la
intercepción es a nivel de SO, no de la app) y confirmado **ausente** cuando la misma
página se carga en el Browser pane propio de Claude Code (proceso de navegador distinto).
Esto infla cualquier auditoría de Lighthouse corrida con `npx lighthouse` desde esta
máquina: de 49 requests capturados, 32 eran del script inyectado de Kaspersky, y es la
causa exclusiva del único fallo de Best Practices (`is-on-https`, apuntando al script de
Kaspersky, no a nuestro código). **Performance dio 72/100 localmente (meta ≥85) — no es un
número confiable dado lo anterior.** Se aplicaron igual las optimizaciones reales posibles
(preload del poster/LCP, `fetchpriority`, fotos de empanada más livianas, video ya
optimizado desde el Paso 0) y se deja documentado que conviene remedir con PageSpeed
Insights u otra máquina una vez desplegado, en vez de confiar en un Lighthouse local en
este entorno.

Build limpio y los 55+27 tests estructurales de siempre en verde (sin tests nuevos — el
alcance de esta tarea es 100% frontend estático, sin lógica de dominio/servidor nueva).

**Ajuste post-entrega, con feedback real del cliente (2026-09-28)**: la galería de
empanadas pineaba la sección y traducía la fila en horizontal atada al scroll vertical —
funcionaba, pero el cliente reportó que se sentía confusa en la práctica ("hay como para
deslizar horizontal y vertical", con captura real mostrando scrollbar horizontal propio de
la fila conviviendo con el scroll vertical de la página). Reemplazada por una **cinta
continua (marquee)** que se mueve sola, sin pedirle nada al usuario — mercado peruano,
según el cliente, prefiere algo más simple que scroll-jacking. `EmpanadasGallery.jsx` ya
no usa GSAP/ScrollTrigger en absoluto (se sacó `gsap.matchMedia`, el pin y el scrub): la
lista se duplica una vez (`[...empanadas, ...empanadas]`) y una animación CSS
(`.anim-marquee-empanadas` en `index.css`, reutiliza el `@keyframes marquee` que ya
existía para el marquee de testimonios de la tienda vieja) la traslada `-50%` en loop,
pausándose con `:hover`/`:focus-within` para poder pedir sin perseguir la tarjeta. Con
`prefers-reduced-motion` no se anima nada — vuelve a la lista simple con scroll horizontal
nativo de antes (sin duplicar contenido). Sin scrollbar propio en ningún breakpoint
(`overflow-hidden` en la sección) — verificado con `getBoundingClientRect`/
`document.documentElement.scrollWidth`, no solo mirándolo. El video-hero (sección 1-2, la
transición pineada + scrubbed) no se tocó — el feedback apuntaba específicamente a la
galería, no a esa transición.

**Sitemap para Google Search Console**: `apps/web/public/sitemap.xml` (una sola URL, es
una landing de una página) + línea `Sitemap:` agregada a `robots.txt`. La verificación de
propiedad en Search Console (TXT en DNS o archivo) la hace el cliente directamente, fuera
de este repo. **`bake-brothers.com` redirige a `www.bake-brothers.com`** (config existente
de Vercel, ver §9) — el `canonical`/Open Graph/`sitemap.xml`/`robots.txt` se corrigieron
para apuntar todos a la versión `www` (antes apuntaban a la raíz sin `www`, inconsistente
con el redirect real — corregido el mismo día que se detectó, sin haber llegado a
indexarse). Para la propiedad de Search Console se recomendó el tipo "Dominio"
(`bake-brothers.com`, sin `https://` ni `www`) en vez de "Prefijo de URL", porque agrupa
automáticamente todas las variantes (con/sin `www`, http/https) bajo una sola propiedad —
evita este mismo tipo de desalineación a futuro.

**Corrección real de rumbo con feedback del cliente (2026-09-28, mismo día)**: el feedback
anterior ("las animaciones se ven raras, hay como para deslizar horizontal y vertical") en
realidad apuntaba al **video-hero**, no a la galería de empanadas — el cliente lo aclaró
explícitamente después de ver el resultado en producción. Lo que se leía como "horizontal
y vertical" era el propio wipe circular de la transición (un `clip-path: circle()`
expandiéndose crece en todas las direcciones a la vez, no en una sola) — no el scroll de
la página. Además, aclaró que tampoco quería el marquee de empanadas de la iteración
anterior ("no quiero un carrusel... quiero darle un espacio a cada una para que resalten
más"). Dos cambios reales:
- **`VideosHero.jsx`**: el `clip-path` circular se reemplazó por un **cross-fade de
  opacidad** simple entre `layer1` y `layer2` (mismo timeline con scroll-scrub de antes,
  solo cambia qué propiedad anima) — más simple de leer, y de paso más liviano para el
  navegador (animar opacidad es mucho más barato que animar `clip-path` sobre un
  `<video>`). Verificado con evidencia real: opacidades complementarias a mitad de
  transición (`layer1: 0.675`, `layer2: 0.325` en una muestra real), nunca ambas en 0.
- **`EmpanadasGallery.jsx`**: se sacó el marquee por completo (era la iteración anterior,
  ya obsoleta) — ahora es una **grilla estática simple** (`grid grid-cols-2 sm:grid-cols-3
  xl:grid-cols-4`, sin animación, sin GSAP, sin `usePrefersReducedMotion`), cada empanada
  con su propio espacio real, visible con el scroll normal de la página. `EmpanadaCard`
  pasó de ancho fijo (`w-[220px]`, pensado para una fila que se mueve) a `w-full` (llena su
  celda del grid). Es, de las tres versiones probadas de esta sección en el mismo día
  (pin+scroll horizontal → marquee → grilla estática), la más simple de las tres — y la que
  el cliente pidió al final.

**Nota sobre el "hueco en blanco" reportado en producción**: al investigar el reporte
("hay una parte que sale todo en blanco") se reprodujo un frame en blanco tanto en el
Browser pane propio de esta sesión como, aparentemente, en el navegador real del cliente —
pero la inspección del DOM en el momento exacto del "hueco" (`getBoundingClientRect`,
opacidad computada de ambas capas, `video.paused`/`readyState`) mostró siempre el estado
correcto (video1 a opacidad 1 cubriendo toda la pantalla, o el clip-path/opacidad de video2
en el valor esperado) — nunca un estado real "sin nada pintado". Forzar un recompose
(`resize_window` a otro preset y de vuelta) hacía desaparecer el hueco sin cambiar nada del
DOM, igual que el artefacto de compositing de captura ya documentado en una sesión
anterior de este mismo proyecto. Conclusión: es un frame de pintura tardío del navegador
durante una animación GPU-intensiva (`clip-path` sobre `<video>` pineado), no un bug de
datos/lógica — y es exactamente el tipo de costo que el cambio a cross-fade (opacidad,
mucho más barata de componer) reduce de raíz, más allá de la razón estética por la que se
pidió el cambio.

**Corrección real a esa conclusión, con más feedback del cliente (2026-09-28, mismo día)**:
el cliente reportó que el hueco en blanco seguía pasando incluso después del cross-fade,
específicamente "se repite el [video] de los alfajores, eso causa que haya una parte
totalmente en blanco" — dato nuevo que apunta a una causa real y distinta de la que se
había documentado arriba. Los clips duran 8-10s (`alfajores-mix.mp4`: 10s,
`alfajores-manjar.mp4`: 8.17s, medido con `ffprobe`) y ambos usaban el atributo `loop`
nativo del `<video>` — alguien que se queda mirando el hero antes de scrollear (lo normal:
el hero es lo primero que se ve) alcanza a ver el video reiniciar solo, y ese reinicio
nativo puede mostrar un parpadeo en blanco en algunos navegadores. Se reemplazó `loop` por
un reinicio manual (`onTimeUpdate`: `currentTime = 0` un poco ANTES de llegar al final, en
vez de esperar el evento `ended`) en `VideosHero.jsx`. Verificado con evidencia real
—muestreo de `currentTime`/`readyState`/`paused` del video cada 300ms durante 11s
seguidos—: el reinicio ocurre limpio (`9.81 → 0.09` entre dos muestras), `readyState` se
mantiene en `4` (HAVE_ENOUGH_DATA) todo el tiempo, nunca se pausa. La conclusión anterior
("es solo un frame de pintura tardío del navegador, no un bug") queda parcialmente
corregida: puede que ambas causas coexistieran, pero el reinicio del loop nativo era una
causa real y evitable, no solo un artefacto de la herramienta de captura — no alcanzaba con
descartarlo, había que arreglarlo.

**Otros tres ajustes de pulido, mismo día**:
- **Scrollbar del navegador**: tenía el gris por defecto — ahora usa los colores de marca
  (`--color-acento` sobre `--color-crema`) vía `scrollbar-color`/`scrollbar-width` (Firefox
  y Chrome moderno) + `::-webkit-scrollbar-*` (Safari/Chrome/Edge), en `index.css`.
- **Español neutral, no argentino**: se encontró `"elegí tu sabor"` (voseo) en
  `EmpanadasGallery.jsx` — único caso real en todo el copy de la landing (se revisó
  `config/landing.js` completo, sin otro hallazgo). Corregido a `"elige tu sabor"` (tú,
  neutro, consistente con el resto del copy — ej. "Pídelo por WhatsApp" ya usaba esa forma).
- **Footer mejorado**: el brief original pedía Instagram **y** Facebook, pero solo
  Instagram estaba enlazado — se agregaron los dos como íconos (`lucide-react`:
  `Instagram`, `Facebook`) junto al handle compartido `@bakebrothers.pe`, más un ícono
  `MapPin` por local y una línea divisoria sutil (`border-t border-white/10`) separando el
  CTA del bloque de información — mejora la jerarquía visual sin competir con el botón de
  WhatsApp (la regla original del brief para esta sección sigue intacta).

**Bug real encontrado y corregido — "la caja de manjar aparece dos veces" (2026-09-28,
mismo día, con evidencia real de producción)**: no era un problema de diseño, era un
mismatch real de layout. `VideosHero.jsx` tenía la sección exterior en `h-[220vh]`
(arbitraria) mientras el pin de GSAP (`end: '+=100%'`) solo necesita 100vh adicionales de
scroll para la animación. Confirmado inspeccionando el `.pin-spacer` real que arma GSAP en
producción: media 2458px = 1690px (alto natural de la sección, 220vh) + 768px (distancia
del pin, 100vh) — GSAP no toma el máximo entre ambos, los **suma**. Consecuencia real: al
soltar el pin (a los 768px), la sección volvía a flujo normal con ~922px de alto natural
sobrante, y el `<div className="sticky top-0 h-svh">` de adentro — `sticky` nativo de CSS,
totalmente independiente del pin de GSAP — se volvía a pegar arriba del viewport durante
ese sobrante, mostrando la Caja de Alfajores con Manjar Blanco ya transicionada (y
congelada, la animación ya había terminado) por un tramo extra de scroll. Eso se leía como
"aparece dos veces" y el eventual corte al soltar de verdad (con el hueco en blanco que
también se reportó) coincide con el release real de ese doble mecanismo pin+sticky.
**Fix real**: la sección pasó de `h-[220vh]` a `h-svh` (exactamente 1 viewport, ni más) —
así su alto natural coincide exacto con el contenido visible (el div de adentro, también
`h-svh`), sin sobrante donde el `sticky` nativo tenga dónde pegarse de más. Verificado con
los mismos números: `pinSpacerHeight` pasó a 1536px = 768 (natural) + 768 (pin) — exacto
200vh, sin excedente — y recorriendo la página con scroll real se confirmó que apenas
termina el cross-fade (768px de scroll) el contenido de la siguiente sección ya está justo
ahí, sin ningún tramo muerto de por medio.

**Otros tres pedidos del mismo reporte, resueltos**:
- **Favicon real**: el cliente subió un set completo de ícono de marca a
  `imagenes/icono/isotipo/` (favicon.ico, PNGs en 16/32/48/64/192/512, apple-touch-icon) —
  reemplaza el placeholder (un círculo naranja con una "B" genérica en SVG inline) que
  quedó de una iteración muy temprana. Copiados a `apps/web/public/favicon.ico` y
  `apps/web/public/icons/`, referenciados en `index.html`.
- **Dos botones de WhatsApp a la vez en el footer**: el flotante no se ocultaba ahí (solo
  se ocultaba durante el hero) — mismo patrón que ya usa `VideosHero.jsx` aplicado también
  a `ClosingFooter.jsx` (`onVisibilidadCambia` + `IntersectionObserver`), combinado en
  `Landing.jsx` (`oculto={heroEnPantalla || footerEnPantalla}`). Verificado con evidencia
  real: `opacity` del botón flotante en 0 dentro del footer, vuelve a 1 en la sección de
  mapas (donde no hay otro CTA compitiendo).
- **Mapas reales de cada local**: sección nueva `Ubicaciones.jsx`, entre la galería de
  empanadas y el footer — dos embeds de Google Maps (sin API key, el mismo link que da
  "Compartir → Insertar mapa") por cada local de `config/landing.js`. Bug menor encontrado
  al armar la consulta: la dirección de Cedros ya trae "Chorrillos" adentro y la de Santa
  Marina no — agregar el distrito a ciegas duplicaba "Chorrillos, Chorrillos" en la
  consulta de Cedros; corregido para agregarlo solo cuando falta. Verificado cargando el
  mapa real: se ve la cuadra correcta de Chorrillos, con puntos de referencia reales
  (Innova Schools Chorrillos Villa, junto al local de Cedros).

**Footer cortado al llegar al final del scroll — bug real, no "espacio fantasma"
(2026-09-28, mismo día)**: el cliente reportó que se podía "bajar de más" y el footer se
veía cortado arriba. Medido en el navegador real: `scrollY` en el máximo coincidía
EXACTO con `document.documentElement.scrollHeight - window.innerHeight` (sin espacio de
sobra) — no era un bug de Lenis/GSAP dejando scrollear más allá del documento real. La
causa real: el footer con su padding viejo (`pb-32 pt-24` en mobile, `sm:py-32` en
desktop) medía ~789px de alto propio, más que una ventana de 768px (una altura de laptop
común) — al llegar al final real del scroll, esos primeros ~21px del footer (el aire sobre
el logo) quedaban por encima del borde superior de la ventana, imposibles de ver. Ese
padding grande ya no hacía falta: se había puesto para que el botón flotante no tapara la
última dirección, pero el flotante ahora se oculta solo en el footer (fix de más arriba,
mismo día). Reducido a `py-20`/`sm:py-24` (footer bajó a 693px) más los `mt`/`pt` internos
del bloque de redes/locales achicados (`mt-16`→`mt-12`, `mt-8`→`mt-6`, `pt-10`→`pt-8`).
Verificado con el mismo método: al scroll máximo, el footer ahora empieza a 75px del borde
superior (antes -20px) y termina exacto en el borde inferior — entra completo.

**Crédito de desarrollo + decisión consciente sobre las tarjetas de empanada
(2026-09-28, mismo día)**: el cliente preguntó si que cada tarjeta de empanada sea un link
completo a WhatsApp (no solo el botón "Pedir") se siente invasivo — se le dio la opinión
(abre en pestaña nueva, hay un badge visible, el objetivo explícito de la landing es
minimizar fricción hacia WhatsApp, mejor área de toque en mobile) y **decidió dejarlo
como está** — sin cambios de código, solo quedó registrada la decisión por si se
re-evalúa más adelante. Se agregó un crédito de desarrollo al pie del footer
("Desarrollado por DevHorses", link a `https://www.devhorses.com/`, `target="_blank"`) —
texto chico (`text-xs`, `text-white/35`) para no competir visualmente con nada, verificado
que el footer sigue entrando completo en una ventana de 768px con el crédito agregado
(733px, margen de 35px).

**El video-hero deja de depender del scroll — pedido real del cliente (2026-09-28, mismo
día)**: "no que tenga que scrollear para cambiar el video... que se cambien
automáticamente". Se sacó por completo el pin + scroll-scrub de GSAP ScrollTrigger de
`VideosHero.jsx` (ya no se usa `ScrollTrigger` en este archivo, solo `SplitText`) — la
sección ahora es un `h-svh` normal, sin pin, sin `sticky`, el scroll la atraviesa como
cualquier otra sección. El cross-fade entre los dos videos (mismo cross-fade de opacidad
de la iteración anterior) lo dispara un `setInterval` cada 6 segundos
(`SEGUNDOS_POR_VIDEO`), prendido/apagado con el mismo `IntersectionObserver` que ya pausaba
los videos fuera de pantalla (ahorra el timer cuando la sección no se ve, y evita que el
usuario vuelva a mitad de una transición vieja). `prefers-reduced-motion`: sin auto-cambio,
el hero queda quieto en el primer video.

**Bug real de verificación encontrado y documentado — `document.hidden` en el Browser
pane de esta sesión**: al probar el auto-cambio, el video no cambiaba después de 6s en la
pestaña ya abierta de esta sesión. Diagnosticado con evidencia real, no descartado a
ciegas: un `IntersectionObserver` completamente aislado (creado directo por consola, sin
relación con el código del componente) tampoco disparaba su callback nunca, ni siquiera
una vez, en 2 segundos reales de espera — y `document.hidden` devolvía `true` en esa
pestaña incluso después de traerla al frente. Confirmado que el problema es real y no del
código: **una pestaña nueva** (`tabs_create` con `foreground: true`) reportó
`document.hidden = false` de entrada, y ahí el auto-cambio funcionó exactamente como se
esperaba (verificado con opacidades reales: video 1 → video 2 a los ~7s, de vuelta a video
1 a los ~13s, ciclo continuo confirmado). Mismo patrón que otros artefactos de este entorno
ya documentados en este archivo (compositing de capturas, inyección de red de Kaspersky):
específico de la herramienta de pruebas, no del sitio — un usuario real nunca navega con
`document.hidden=true`.

**De paso, dos bugs reales encontrados y corregidos mientras se investigaba lo anterior**
(preexistían desde la iteración del cross-fade, no introducidos ahora — el aviso quedaba
silencioso en consola y nadie lo había notado):
- `[data-hero-cta]` (el selector que la animación de entrada usa para el precio+botón) no
  existía en ningún elemento del JSX — GSAP tiraba `"GSAP target [data-hero-cta] not
  found"` en cada carga y esa parte de la animación de entrada nunca corría (el precio+botón
  igual se veían, por el opacity:1 por default del navegador — no eran invisibles, solo les
  faltaba el fade-in). Se agregó el atributo al div que envuelve precio+botón; verificado
  que el fade-in ahora sí completa (opacity final en 1, sin quedar pegado en 0).
- `fetchPriority` en el `<video>` no es un atributo real de ese elemento (el estándar de
  Priority Hints solo cubre `<img>`/`<link>`/`fetch()`) — React lo advertía en cada render
  y el navegador lo ignoraba. Se sacó del componente (el poster del primer video sigue
  precargándose con prioridad alta, pero eso ya vivía aparte en `index.html`).

**Favicon circular (2026-09-28, mismo día)**: el cliente mandó `BakeBrothers-isotipo-B-
transparente.png` (fondo realmente transparente, confirmado con el valor real del píxel
de esquina vía PIL: `(0,0,0,0)`, a diferencia del favicon que se había usado antes —
generado del "icono maestro", con fondo crema opaco horneado adentro, aunque el archivo
también tuviera canal alfa). Se evaluó usar la versión transparente tal cual: **no se
recomendó** — la "B" es negra sólida, sobre una pestaña de navegador en tema oscuro se
mezclaría con el fondo y solo quedarían visibles los detalles naranjas (ojo/sonrisa),
viéndose incompleta. El cliente pidió una versión circular en su lugar. Generado con
Python/Pillow (no había herramienta de edición de imágenes en el flujo hasta ahora): un
círculo relleno de crema (mismo tono de marca, `--color-crema`/`--color-hueso`) con la "B"
transparente centrada encima, con aire alrededor. Dos variantes reales, no la misma imagen
reescalada dos veces:
- **Esquinas transparentes** (favicon-16/32/48/64.png, favicon.ico multi-resolución) — el
  navegador compone el círculo directo sobre el fondo real de la pestaña.
- **Cuadrado sólido, sin transparencia** (apple-touch-icon.png, icon-192.png,
  icon-512.png) — iOS/Android agregan su propio recorte/máscara, un ícono con
  transparencia ahí puede rellenarse en negro o verse mal recortado.

El máster circular (1024×1024, esquinas transparentes) también se guardó como fuente en
`imagenes/icono/isotipo/BakeBrothers-isotipo-circular.png`, junto a los demás archivos de
marca — no solo las copias optimizadas en `apps/web/public/`.

**El footer se seguía cortando — segunda vuelta, con la causa real esta vez (2026-09-28,
mismo día)**: el ajuste anterior (§ arriba, "footer cortado al llegar al final del
scroll") había apuntado a caber en 768px de alto y se probó ahí — pero el cliente lo vio
cortado de nuevo después de agregar la línea de DevHorses. Medido en una ventana real de
~650px (el tamaño real de su navegador, no un supuesto) contra la producción ya
desplegada: `footerRect.top = -83px` al scroll máximo — se seguía cortando, el ajuste
anterior no alcanzaba para una ventana tan chica. Esta vez, en vez de perseguir "la altura
exacta de la ventana de alguien" (frágil — la próxima ventana más chica rompe lo mismo de
nuevo), se recortó bastante más agresivo con margen real de sobra: logo más chico
(`h-14`→`h-10`, `h-16`→`h-12`), título/subtítulo un escalón menos (`text-4xl`→`text-3xl`,
etc.), y todos los `mt`/`pt` internos reducidos. El footer bajó de 733px a **550px**.
Verificado con evidencia real en dos tamaños de ventana: a 650px de alto (el real del
cliente) el footer entra con 100px de margen; incluso a 600px (más chico que cualquier
ventana real razonable) entra con 50px de margen — ya no depende de acertarle a un alto de
ventana específico.

**`.mcp.json` y `catalogo-real-bake-brothers.md` — commiteados con confirmación explícita
del cliente (2026-09-28)**: quedaban sueltos (sin trackear) desde antes de esta sesión, no
eran parte de ningún cambio de la landing — no se habían tocado por iniciativa propia. El
cliente los vio en su copia local (VS Code, panel de Source Control) y preguntó qué eran;
se le explicó que `.mcp.json` es la configuración local de Claude Code para el MCP de
Supabase de este proyecto (sin credenciales, solo una referencia de proyecto) y que
`catalogo-real-bake-brothers.md` es el catálogo real (precios/ingredientes/alérgenos) que
se usó como fuente para la migración 0006 — documentación útil, sin nada sensible. Pidió
subir ambos.

**Footer rediseñado a dos columnas — "como un footer convencional" (2026-09-28, mismo
día)**: el cliente no quedó conforme con el footer centrado/apilado ("mejor una parte a la
izquierda y esa raya que se para a la derecha"). `ClosingFooter.jsx` pasó de un único
bloque centrado a un layout de dos columnas en desktop (`lg:flex-row`): marca+CTA a la
izquierda, contacto (redes/locales/crédito) a la derecha, separadas por una raya —
horizontal y apilada en mobile/tablet (`border-t`, como antes), **vertical entre las dos
columnas en desktop** (`lg:border-l lg:self-stretch`, un solo `<div>` que cambia de
orientación según el breakpoint en vez de dos elementos separados). Verificado con
geometría real (`getBoundingClientRect`), no solo mirándolo: en desktop la raya mide 1px de
ancho y se estira a la misma altura que las dos columnas (229px, `self-stretch`
funcionando); en mobile vuelve a ser horizontal (1px de alto, ancho completo) y todo
centrado en una sola columna, sin tocar ese comportamiento. Efecto colateral bueno para el
problema de altura de las últimas dos vueltas: al repartir el contenido en horizontal en
vez de apilarlo todo, el footer en desktop bajó de 550px a **357px** — mucho más margen de
sobra todavía.

**Logo del footer: más grande, clicable, y "Desarrollado por" centrado (2026-09-28, mismo
día)**: tres pedidos puntuales sobre el footer de dos columnas recién hecho. Logo de
`h-10 sm:h-12` a `h-16 sm:h-20` (footer sigue midiendo 389px, lejos de cualquier problema
de altura). El logo ahora es un `<button>` que llama a `scrollToTop()` (nuevo, exportado de
`useLenisScroll.js`) — vuelve arriba de la página. La línea "Desarrollado por DevHorses"
quedó centrada explícitamente (`text-center` en el propio `<p>`, pisando el `lg:text-left`
heredado del resto de esa columna, que sigue alineada a la izquierda).

**Bug real encontrado armando `scrollToTop` — `force: true` hacía falta de verdad**:
Lenis no expone su instancia fuera del hook que la crea — se guardó en una variable a nivel
de módulo (`lenisInstance`) para que el botón del logo pueda pedirle un scroll animado sin
pasar por contexto de React. La primera versión (`lenis.scrollTo(0, { duration: 1.2 })`)
no siempre arrancaba — reproducido real varias veces, no descartado a la primera: el
propio código fuente de Lenis (`node_modules/lenis/dist/lenis.mjs`) tiene esta guarda en
`scrollTo`: `if ((this.isStopped || this.isLocked) && !force) return`. Agregar
`force: true` lo resolvió — confirmado con 5/5 intentos reales exitosos (bajando al fondo
con eventos de `wheel` sintéticos y clickeando el botón, no solo mirándolo una vez). Un
`window.scrollTo` nativo directo NO es la alternativa correcta acá: con Lenis activo, su
propio loop de animación lo pisa en el siguiente frame — por eso el fallback (solo para
`prefers-reduced-motion`, donde Lenis ni se crea) sigue usando el scroll nativo, nunca al
mismo tiempo que Lenis.

**Aclarado con el cliente — accesos rápidos a secciones, no botones de contacto
(2026-09-28, mismo día)**: "botones ahí en la parte de la derecha, así como las secciones"
resultó ser pedir enlaces rápidos a las secciones de la página ("la de empanadas o la de
caja de alfajores"), no otro tipo de CTA de contacto — se le preguntó con opciones
concretas en vez de adivinar. `scrollToTop()` se generalizó a `scrollTo(target)` (acepta un
número o un selector CSS — Lenis resuelve el elemento y calcula su posición solo). Se
agregaron `id="alfajores"` a la sección del hero y `id="empanadas"` a la galería, más dos
botones chicos ("Caja de Alfajores", "Empanadas") en la columna derecha del footer, debajo
de los íconos de redes. Como esta app usa `HashRouter` para las rutas, se usó `scrollTo` de
Lenis en vez de links `href="#alfajores"` a propósito — un `#` en la URL choca con cómo
`HashRouter` decide qué ruta mostrar.

**Límite real de verificación en este entorno — encontrado y diagnosticado, no
descartado a ciegas**: probar el scroll animado a una sección (`scrollTo('#empanadas')`,
`duration` con easing) resultó intermitente en el Browser pane de esta sesión — a veces
completaba, a veces se quedaba pegado en el origen para siempre (`onStart` disparaba,
`onComplete` nunca). Investigado a fondo antes de asumir que era un bug propio: el modo
`immediate:true` de Lenis (sin animación, sin depender de ningún ticker) funcionó siempre,
100% de las veces, confirmando que el cableado botón→`scrollTo`→Lenis→resolución del
elemento (`document.getElementById`, cálculo de `rect.top`) está bien. El patrón fallaba
específicamente en el tramo animado por tiempo (`this.animate.advance()`, que depende de
que siga llegando `requestAnimationFrame` vía el ticker de GSAP). Encontrada la señal
real: `document.hasFocus()` daba `false` en las pestañas de esta sesión (incluso con
`document.hidden=false` y una pestaña nueva recién creada) — un tercer eje de
"visibilidad" en el navegador, distinto de `document.hidden`, ya documentado dos veces
antes en este archivo (el `document.hidden` que frenaba el auto-cambio de video, la
inyección de red de Kaspersky) — específico de cómo este entorno automatizado maneja el
foco de ventana, no reproducible por un usuario real mirando su propia pantalla. La
implementación (`scrollTo` con `duration`+`force:true`) es la forma correcta y documentada
de usar la API de Lenis — no se cambió por esto, solo queda anotado por si se repite.

**"Desarrollado por DevHorses" — centrado a todo el ancho del footer, no de la columna
derecha (2026-09-28, mismo día)**: estaba centrado, pero solo dentro del ancho de la
columna derecha (contacto), que en desktop es más angosta que el footer completo — el
cliente lo quería centrado respecto al footer entero, como pie de página independiente.
Se sacó del `<div>` de dos columnas y pasó a ser un `<p>` hermano, fuera del `flex-row`,
dentro del mismo contenedor `max-w-4xl` pero ocupando su ancho completo. Verificado con
geometría real: el centro horizontal del texto coincide exacto con el centro del footer
(507px = 507px en una prueba a 1024px de ancho), y queda por debajo de las dos columnas
(`pRect.top >= rowRect.bottom`), no metido adentro de ninguna.

**Tres hallazgos reales del cliente compartiendo el link en producción, corregidos
(2026-09-28, mismo día)**:

- **Imagen de Open Graph no se veía al compartir el link**: `og:image`/`twitter:image`
  apuntaban al poster `.webp` del primer video — el archivo cargaba bien (200, confirmado
  real contra `www.bake-brothers.com`), pero el formato `.webp` no tiene soporte confiable
  en varios crawlers de mensajería/redes que generan la vista previa del link (WhatsApp en
  particular). Se generó una copia en `.jpg` del mismo poster
  (`apps/web/public/video/alfajores-mix-og.jpg`, mismo tamaño 1280×720, calidad 85) con
  Pillow, y `og:image`/`twitter:image` apuntan ahora a esa copia — el poster `.webp`
  original sigue igual para el video (no se tocó `VideosHero.jsx`).
- **Faltaba el logo en el hero**: la sección 1-2 (videos) no tenía ninguna marca visible
  más allá del texto pequeño "BAKE BROTHERS" — confirmado real navegando la producción, se
  ve la caja de alfajores sin logo en ninguna esquina. Se agregó el logo real
  (`logo-landing-blanco.png`, el mismo que ya usa el footer) fijo en la esquina superior
  izquierda del hero (`absolute left-6 top-6 sm:left-10 sm:top-8`), como hermano de las dos
  capas de video (`layer1Ref`/`layer2Ref`) en vez de dentro de cada una — así no parpadea
  con el cross-fade entre los dos videos.
- **Mapas con un botón "Abrir en Maps" feo encima**: investigado a fondo antes de tocar
  código, no asumido. Se probó primero reemplazar el embed "rápido"
  (`maps?q=...&output=embed`, el que se usaba) por el embed OFICIAL de Google
  (`maps/embed?pb=...`, el que da real "Compartir → Incorporar un mapa" sobre el negocio
  real "BakeBrothers" en Google Maps) — pero el botón seguía apareciendo igual, confirmado
  real probando ambos formatos lado a lado. Investigado más: es un elemento propio del
  iframe de Google (contenido de `google.com`, cross-origin — no editable desde nuestro
  código) que se comprime a un botón chico "Abrir en Maps ↗" cuando el iframe es bajito
  (la altura que usaba esta sección, 256-288px) y se expande a una tarjeta completa
  (nombre, dirección, estrellas) cuando es más alto (probado real: a 288px de alto sale el
  botón feo, a 320-400px sale la tarjeta linda) — pero el punto exacto donde cambia también
  depende del ancho, no es un único número confiable en todos los tamaños de pantalla
  (probado real: 320px de ancho con 340px de alto todavía mostraba el botón feo). Se
  presentaron 3 opciones al cliente (tarjeta estática, agrandar el mapa aceptando el riesgo
  de inconsistencia, o cambiar a OpenStreetMap) y eligió la tarjeta estática. `Ubicaciones.jsx`
  ya no usa ningún `<iframe>` — cada local es una tarjeta con un ícono de pin (mismo
  `--color-acento` de marca) y un botón "Cómo llegar" que abre la ubicación real en Google
  Maps en una pestaña nueva, con el formato oficial y documentado "Maps URLs"
  (`google.com/maps/search/?api=1&query=...`, sin API key) — mismo destino real, sin ningún
  elemento de Google flotando encima de nuestra tarjeta. `config/landing.js`: `locales`
  cambió su campo `mapaSrc` (embed) por `mapsUrl` (link).

**Mapas: vuelta al embed interactivo de Google, con un ejemplo real del cliente
(2026-09-28, mismo día)**: el cliente vio la tarjeta estática del punto anterior y pidió
"algo así" mandando una captura de referencia — el mapa interactivo de Google con su
propia tarjeta de info completa (nombre, dirección, estrellas, botones), no la tarjeta
plana que se había construido. Investigado antes de revertir a ciegas: esa tarjeta
completa de Google (en vez del botón chico "Abrir en Maps") depende del ANCHO del iframe
además del alto, verificado real con varias combinaciones — a 411px de ancho, con 320px
de alto ya alcanza; a ~350px de ancho, ni 340px de alto alcanza. Por eso `Ubicaciones.jsx`
volvió a usar `<iframe>` con el embed oficial `pb=` (guardado de nuevo en
`config/landing.js` como `mapaSrc`), con `h-[420px]` y el grid en `lg:grid-cols-2` (no
`sm:grid-cols-2` como antes) — así la sección es de una sola columna a todo el ancho en
mobile y tablet (donde dos columnas angostas caerían en la zona de ancho insuficiente) y
recién pasa a dos columnas en `lg` (1024px+, columna ~410px+, ya confirmado que alcanza).
Verificado real en los tres rangos: 1024px con dos columnas de 411px → tarjeta completa
con rating; 768px con una sola columna (~672px) → tarjeta completa; **375px (celular, una
sola columna ~327px) → sigue saliendo el botón chico "Abrir en Maps"**, probado incluso
forzando el iframe a 600px de alto sin ningún cambio — a ese ancho es un límite duro de
Google (undocumented, específico de su embed), no resoluble subiendo el alto. Se le explicó
esto al cliente con evidencia real y eligió mantener el mapa interactivo en todos los
tamaños (aceptando que en celular Google muestre su botón chico en vez de la tarjeta
completa) en vez de usar un componente distinto solo para mobile — decisión consciente,
no un descuido: la mayoría del tráfico de este negocio es mobile, así que el botón chico
de Google seguirá viéndose ahí, mientras que tablet/desktop ya calzan con el ejemplo que
pidió el cliente.

**Logo del hero, más grande (mismo día)**: pedido explícito tras ver el logo agregado en
la iteración anterior — pasó de `h-9 sm:h-11` a `h-14 sm:h-20` (mismo tamaño que ya usa el
logo del footer en desktop), sigue fijo en la esquina superior izquierda sobre ambas capas
de video.

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

## 9. Despliegue — estado real

- **`apps/api`**: en Coolify, servidor Hetzner (`2.28.233.230`), dominio propio
  `https://api.bake-brothers.com` (DNS ya apuntaba al servidor; se movió el `fqdn` de la
  app desde el sslip.io temporal y se redesplegó para que Coolify emitiera el certificado
  Let's Encrypt nuevo — verificado con curl real, sin `-k`, contra el dominio nuevo).
  Healthcheck activo contra `/health`. `DATABASE_URL` usa el rol `app_api` (no `postgres`)
  contra el Supabase de São Paulo (`umyaytrojtbdvdzbrily`). CORS restringido a
  `bake-brothers.com` + `www.bake-brothers.com` + `bake-brothers.vercel.app` + localhost
  — el `www` hizo falta aparte porque el dominio raíz redirige a la versión con "www" como
  oficial en Vercel, y CORS no trata un dominio y su `www` como el mismo origen (encontrado
  en producción, no en pruebas — el navegador manda `Origin: https://www.bake-brothers.com`).
  Los dos dominios propios conviven con el de Vercel todavía (se limpia después de confirmar que todo
  funciona con el dominio nuevo). Redeploy: `POST /api/v1/deploy?uuid=02dnxpcluu0mo2jlminx9lhu`
  vía la API de Coolify (token guardado fuera del repo, no en este archivo).
- **`apps/web`**: en Vercel, proyecto `bake-brothers` (team `mathias-projects-eaced134`),
  dominio real `bake-brothers.vercel.app` — auto-deploy en cada push a `main` (integración
  de GitHub, sin acción manual). `VITE_API_URL` ya está configurada en el dashboard de
  Vercel — **fuera de modo demo**, catálogo real (Carrot Cake, Red Velvet, etc.) servido
  desde el Supabase real. Un slug hardcodeado en `Home.jsx` (remanente del mock viejo)
  rompía el render al conectar la API real; corregido y verificado en vivo.
- Datos de contacto reales (WhatsApp `912944096`, Instagram/Facebook `Bakebrothers.pe`) ya
  están en producción — verificado cargando `bake-brothers.vercel.app` de verdad, no solo
  revisando el código.
- **Base del bot (Semana 2, sin credenciales de Meta todavía)**: `conversaciones` y
  `contenido_rag` (0009/0010) ya están en el Supabase real, con pgvector habilitado. El
  código de `GET/POST /webhook` (ya con el parser real de WhatsApp + arquitectura async +
  idempotencia, ver §7) y `apps/api/src/bot/tools.ts` está en `main` pero **no se
  redesplegó en Coolify todavía** (no había motivo — nada en producción lo necesita hasta
  que exista una app de Meta real). `META_VERIFY_TOKEN` se generó (aleatorio, guardado
  fuera del repo) pero tampoco está configurado en Coolify aún — se hace junto con el
  redeploy, cuando haya una app de Meta real para probar el webhook de punta a punta.
- **`apps/admin` (Semana 3)**: corre local (`pnpm dev:admin`, puerto 5174). Habla directo
  contra Supabase (`supabase-js`, anon key pública — la seguridad la hace RLS/grants, no la
  key) en vez de pasar por `apps/api`: es lo que permite que las políticas RLS filtren
  solo, sin reimplementar el filtro por sede en la app. Cuenta de prueba para desarrollo:
  `mathiwen519+bbdashboard@gmail.com` (creada vía el signup real de Supabase Auth, no una
  fila fabricada a mano), guardada como `admin` en `usuarios_dashboard` — password fuera
  del repo. **Cuentas reales de personal ya creadas** (ver §7, Semana 3):
  `adminalameda@bake-brothers.com`/`adminsantamaria@bake-brothers.com` (operador, Cedros/
  Santa Marina) y `adminbake@bake-brothers.com` (admin) — creadas por INSERT directo en
  `auth.users`/`auth.identities` con pgcrypto (el signup público seguía bloqueado por el
  rate limit de emails), login real verificado. La cuenta de prueba de gmail se conserva,
  no se borró.
- **`apps/admin` en Vercel — desplegado**: proyecto `bake-brothers-admin` (mismo team),
  creado a mano por el cliente desde el dashboard (el MCP de Vercel no tiene permiso para
  crear proyectos nuevos vía API — solo lectura). Dominio real
  `bake-brothers-admin.vercel.app`, **más el dominio propio `dashboard.bake-brothers.com`**
  (Cloudflare → Vercel, no documentado hasta ahora — encontrado al verificar un deploy),
  auto-deploy en cada push a `main`. Causa real de un
  primer deploy fallido (construía `apps/web` en vez de `apps/admin`): el `vercel.json` de
  la raíz del repo tiene el build de `apps/web` hardcodeado y **no está scopeado a ningún
  proyecto** — Vercel lo aplica a cualquier proyecto conectado al repo. Fix:
  `apps/admin/vercel.json` propio (más específico, Vercel lo prefiere para ese proyecto);
  el `vercel.json` raíz no se tocó — `apps/web` sigue dependiendo de él por completo.
  Confirmado con el log real del segundo deploy: corrió `@bakebrothers/admin build`, quedó
  `READY`, y la URL real sirve el login de `apps/admin` ("Bake Brothers · Panel"), no la
  landing.
- **Hallazgo de seguridad real, no buscado (0012 + 0013)**: al verificar los grants de
  0011, `anon` y `authenticated` tenían privilegios totales (`SELECT/INSERT/UPDATE/DELETE`)
  sobre TODAS las tablas de `public` — incluida `customers` (PII) — desde 0001/0004/etc.,
  sin ningún RLS que lo frenara. No era explotable en la práctica porque la anon key nunca
  había viajado a ningún cliente público (`apps/web` nunca tocó Supabase directo) — dejó de
  ser un riesgo latente recién cuando `apps/admin` empezó a embeber esa misma key en su
  bundle, y el dev server de `apps/admin` no llegó a correr (ni siquiera en localhost) hasta
  después de que 0012 ya estaba aplicado — nunca hubo ventana de exposición real, ni
  siquiera local (sin túnel, sin IP pública, nunca desplegado).
  0012 revocó los grants existentes, pero **no** la causa raíz: confirmado vía
  `pg_default_acl` que el proyecto tenía `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN
  SCHEMA public` otorgando todo (tablas, secuencias, funciones) a anon/authenticated en
  cada objeto nuevo — y `postgres` es el rol con el que corren todas las migraciones de
  este proyecto. Sin tocar esa regla, cualquier `create table` futuro iba a reabrir el
  mismo hueco en silencio (es justo lo que ya le había pasado, sin que nadie lo notara, a
  `conversaciones`/`contenido_rag` de 0009/0010 hasta que 0012 las alcanzó por estar
  dentro del "all tables" de ese momento). **0013 revoca esa regla por defecto** —
  probado de verdad: una tabla creada después de 0013 nace sin ningún grant para
  anon/authenticated (confirmado por SQL y por la API REST real). De acá en adelante,
  toda tabla nueva que el dashboard necesite requiere su propio `grant` explícito en la
  migración que la crea, igual que ya hace 0011 — nada queda abierto por defecto.
  Pendiente, menor: la Data API del proyecto también estaba deshabilitada a nivel de
  Project Settings (ajeno a las migraciones, nadie lo había notado porque nada la usaba
  hasta `apps/admin`) — ya se reactivó a mano desde el dashboard de Supabase.

## 10. Seguridad — barrido pre-tráfico-real (2026-09-24)

Barrido completo antes de conectar el cerebro del bot (§ arriba) a tráfico real. Cada
punto se verificó con evidencia real (JWT real, requests HTTP reales, tablas de prueba
reales), no revisando solo el código.

- **Escalación de privilegios en `usuarios_dashboard` — probado, NO vulnerable.** Se creó
  un usuario real de prueba (`operador`, vía signup real de Supabase Auth + confirmación
  manual del email por SQL, JWT real de sesión) y se intentó, vía la API REST real, que se
  cambiara su propio `rol` a `admin` y su propio `sede_id` — ambos intentos devolvieron
  `403 permission denied for table usuarios_dashboard` (código `42501`): `authenticated`
  solo tiene `SELECT` en esa tabla desde 0011/0012, nunca tuvo `UPDATE`. Un `SELECT` de su
  propia fila sí funcionó (confirma que el JWT/setup era válido, no un bloqueo total).
  Usuario de prueba borrado al terminar.
- **RLS/grants por defecto en tablas de 0009+ — reconfirmado con una tabla nueva de
  verdad.** `conversaciones` (RLS activa, políticas correctas por sede) y
  `contenido_rag`/`catering_items`/`reglas_catering` (sin RLS, pero sin ningún grant a
  `anon`/`authenticated` tampoco — cerradas por ausencia de privilegio, que es lo
  esperado, esas tablas las lee `app_api` por conexión directa, no por REST). Como ninguna
  migración desde 0013 había creado una tabla nueva todavía, se creó una tabla de prueba
  real (`_test_default_privileges_0013`) como `postgres` (mismo rol que corre las
  migraciones) — nació sin ningún grant para `anon`/`authenticated`, confirmado por
  `information_schema.role_table_grants` Y por un `SELECT` real como `anon` contra la API
  REST (`403`, `permission denied`). Tabla de prueba borrada al terminar.
- **CORS**: `bake-brothers.vercel.app` retirado de `ORIGENES_PERMITIDOS`
  ([app.ts](apps/api/src/app.ts)) — quedan el dominio real (con y sin `www`), el alias de
  rama de Vercel (no se pidió retirarlo) y localhost.
- **`PATCH /api/orders/:numero/status` — huérfana, confirmado y retirada.** Ningún archivo
  del repo la llamaba (ni `apps/admin`, que habla directo con Supabase, ni `apps/web`, ni
  nada más) — se reportó para decidir en conjunto y el cliente pidió retirarla. Se quitó la
  ruta, la validación de `X-Admin-Key` y `ADMIN_KEY` de `env.ts`/`.env.example`/`Dockerfile`.
  `estadoActual`/`actualizarEstado` quedaron sin uso en `ordersRepo.ts` — no se tocaron,
  fuera del alcance pedido.
- **Rate limiting**: `@fastify/rate-limit` global, 100 req/min por IP
  ([app.ts](apps/api/src/app.ts)). Al escribir el test se encontró un bug real (no
  buscado): el `setErrorHandler` propio de la app convertía CUALQUIER error no-Zod en
  `500` — incluido el `429` que ya arma el plugin de rate-limit — así que el límite
  "andaba" pero el cliente nunca veía el código correcto. Corregido: ahora respeta el
  `statusCode` 4xx de errores de plugins de confianza (rate-limit, body JSON malformado,
  etc.) y solo cae a `500` genérico para lo que de verdad no se esperaba. Probado de
  verdad: 101 requests reales contra `/health` en la misma prueba, la 101 vuelve `429`
  con `Retry-After`.
- **Headers de seguridad**: `@fastify/helmet` global (HSTS, `X-Content-Type-Options`,
  etc.), con `crossOriginResourcePolicy: 'cross-origin'` explícito — el default de helmet
  (`same-origin`) hubiera bloqueado en el navegador las respuestas que `apps/web` ya
  consume desde otro origen, aunque CORS las permitiera (son dos mecanismos
  independientes del browser). Probado con un request real verificando los headers.
- **`pnpm audit` — corrido de verdad, con antes/después real.** Encontró 27
  vulnerabilidades (18 high, 9 moderate), casi todas por versiones resueltas
  desactualizadas dentro de los rangos ya declarados en cada `package.json` — no hacía
  falta cambiar ningún rango, solo `pnpm update -r`: bajó a 4 (todas moderate). Lo más
  relevante para mañana (`fastify` 5.10.0→5.12.5 y su cadena `find-my-way`/`fast-uri`,
  expuestos directo a internet) quedó resuelto. Quedan 4 moderate que **no se tocaron a
  propósito**, porque arreglarlas de verdad implica un major (no algo para decidir solo
  en un barrido de seguridad):
  - `react-router`/`react-router-dom` (open redirect, deserialización insegura en SSR) —
    necesita React Router 7.x. Riesgo real revisado: `apps/web`/`apps/admin` no usan
    Router en modo SSR, y todo `<Navigate>`/`<Link to=...>` del repo apunta a rutas
    internas fijas (`/login`, `/pedidos`, slugs del catálogo), nunca a una URL derivada de
    input del usuario — sin superficie explotable hoy, pero la deuda queda anotada.
  - `vitest`/`@vitest/mocker` (path traversal) — necesita Vitest 4.x (major, tests
    pinneados en `^3.x` en todo el monorepo). Herramienta de desarrollo/test, nunca corre
    contra tráfico real — riesgo práctico nulo hoy.
- **Firma `X-Hub-Signature-256` del webhook — preparada, sin activar (a propósito, falta
  `META_APP_SECRET` real hasta mañana).** `verificarFirmaWebhook`
  ([meta.ts](apps/api/src/bot/meta.ts)): HMAC-SHA256 sobre el body crudo, comparación en
  tiempo constante (`timingSafeEqual`). `POST /webhook` ahora captura el body sin parsear
  (content-type parser propio, encapsulado solo en ese router — no afecta el resto de
  rutas JSON) y, **solo si `process.env.META_APP_SECRET` existe**, exige la firma; si no
  existe, el comportamiento es idéntico al de antes. Probado de punta a punta: sin la
  variable, acepta sin firma (comportamiento actual intacto); con la variable seteada,
  rechaza sin firma, rechaza firma inválida, y acepta con la firma real calculada — la
  activación de mañana no va a necesitar ningún cambio de código, solo setear la variable
  en Coolify.
- Verificado con datos reales tras el barrido: `pnpm build` limpio, `pnpm test` en verde
  (54 tests de dominio + 23 de api sin credenciales, más los que necesitan DB/Anthropic
  reales re-corridos con un rol temporal de solo lectura — borrado al terminar, como
  siempre).

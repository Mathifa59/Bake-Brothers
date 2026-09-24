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
- 🚧 **Semana 3 — Dashboard v1**: `apps/admin` scaffoldeado y probado contra el Supabase real — login, pedidos (lista + cambio de estado + **tiempo real**, 0016: la lista se actualiza sola vía Supabase Realtime, verificado cambiando un estado desde afuera del navegador), stock por sede, **clientes (CRM básico)** con historial de pedidos por cliente (reusa `usePedidos`/`TablaPedidos`, sin duplicar lógica) y columna "Último pedido" en la lista (consulta agregada sobre `orders`, sin cambio de esquema — el máximo `creado_en` por `customer_id`), **atribución por canal** con filtro de fecha, **bandeja de conversaciones** (`/conversaciones` — lista las escaladas por el bot, historial + responder; enviar transiciona `escalada → atendida_por_operador` con el mismo trigger de máquina de estados que orders, 0017; el envío real a Meta es un stub en `apps/api/src/bot/meta.ts`, sin token permanente todavía, no lo llama nada). RLS activa en `orders`/`stock` (0011), `customers` (0014) y `conversaciones` (0017) — todo verificado con JWT real contra la API REST real, incluidos los triggers de transición de estado (orders y conversaciones). 0012/0013 corrigieron un hallazgo real de seguridad (ver §9). Desplegado en Vercel (`bake-brothers-admin.vercel.app`, ver §9). **Semáforo de catering: hecho** (`evaluarSemaforoCatering` en `packages/domain`, `evaluarSemaforoCateringPedido` como tool del bot en `apps/api/src/bot/tools.ts`) — 0018 agrega `reglas_catering.admite_corte_noche_anterior` (decisión tomada junto con el cliente, no en silencio: `anticipacion_horas` plano no alcanzaba para el corte de las 8:30pm, que no es uniforme entre los 14 ítems). Verificado con datos reales dos veces (réplica local + Supabase real de producción). Sin conectar a nada todavía, a propósito. **"Nuevo pedido": hecho** (`apps/admin/src/pages/NuevoPedido.jsx`) — un operador arma un pedido real a mano, sin pasar por el bot. Puente nuevo `POST /api/dashboard/orders` + `GET /api/dashboard/orders/:numero/comprobante.pdf` en `apps/api`, protegido por JWT real: `auth/verificarJwtOperador.ts` verifica la firma contra el JWKS público de Supabase (ES256, clave asimétrica — sin secreto compartido que manejar) y resuelve rol/sede_id reales consultando `usuarios_dashboard` con la conexión de `app_api`, nunca confiando en lo que mande el navegador — un operador queda forzado a su propia sede aunque mande otra en el body (probado real); un admin puede elegir sede. Reusa `pedidosTienda.ts`/`pedidosCatering.ts` (los del bot) sin duplicar lógica — incluye que el gate "solo verde" de catering aplica igual acá, sin excepción para el operador (decisión deliberada, no se construyó ningún override). **Combos como pedido real: nuevo** (`services/pedidosCombos.ts`, 0020) — `order_items.combo_id` (tercera vía junto a product_id/catering_item_id, exactamente una de las tres), precio = `combos.precio_promo` fijo. Un combo con `canal_permitido='whatsapp'` exclusivo se rechaza desde el dashboard (probado real, creando un combo temporal de prueba porque ningún combo real de hoy es así). Comprobante en PDF con **pdfkit** (JS puro, sin Chromium — la imagen Alpine de Coolify es chica) generado al vuelo desde el estado real del pedido, con el logo real (`apps/api/assets/`, copiado explícito en el Dockerfile porque `pnpm deploy` no lo garantizaba) — verificado visualmente, layout y totales correctos. "¿Ya pagó?" Sí/No mapea limpio a `paid`/`confirmed` (confirmado por el propio comentario de `orderStatus.ts`: "confirmed → in_production existe para el pago contra entrega") — `payment_pending` queda reservado para el adelanto del bot, no participa acá. **Tres bugs reales encontrados recién al probar contra el JWT real** (no en la revisión de código): (1) `app_api` no tenía grant en `usuarios_dashboard` — 0021 lo agrega; (2) esa tabla tiene RLS y solo tenía política de SELECT para `authenticated`, ninguna para `app_api` — el grant solo no alcanzaba, 0022 agrega la política de bypass que sí tienen orders/stock/customers/conversaciones desde que se les activó RLS; (3) CORS no incluía el origen de `apps/admin` (ni local ni producción) — agregado. Probado con 7 casos reales de punta a punta (`apps/api/test/dashboardOrders.test.ts`, JWT real de un operador de prueba vía Supabase Auth, sin mock de la verificación): sin auth, JWT inválido, tienda+combo con sede forzada, catering verde pagado, combo whatsapp-exclusivo rechazado, admin eligiendo sede, y el PDF real (bytes `%PDF`) — el caso de rol admin corre en una invocación de vitest aparte (`TEST_ROL_ADMIN=1`) porque el propio test no puede cambiarle el rol al usuario de prueba (mismo motivo que el bug 2: RLS). **Verificación en navegador: completada después** (se resolvió el bloqueo del rate limit — ver el punto de "cuentas reales de personal" más abajo — y se confirmó la pantalla completa logueado de verdad). **Pendiente**: Kanban por columnas (solo se hizo la parte de tiempo real), combos con CRUD (desde el dashboard — vender un combo ya funciona, administrarlos todavía no), envío real de mensajes a Meta.
- 🚧 **Semana 3 (cont.) — cuentas reales de personal + identidad visual del dashboard**: las 3 cuentas reales de operadores/admin (`adminalameda@bake-brothers.com` → operador/Cedros, `adminsantamaria@bake-brothers.com` → operador/Santa Marina, `adminbake@bake-brothers.com` → admin/sin sede) ya existen en `usuarios_dashboard`, con login real probado (password fuera de este archivo). El signup público (`/auth/v1/signup`) seguía bloqueado por el mismo rate limit de emails de Supabase que ya había frenado la verificación de "Nuevo pedido" — se creó cada cuenta con INSERT directo en `auth.users`/`auth.identities` (password hasheado con pgcrypto `crypt(..., gen_salt('bf'))`, el mismo bcrypt que usa Supabase Auth; `email_confirmed_at` seteado directo, sin depender de que el dominio reciba correo — confirmado con `nslookup`: `bake-brothers.com` no tiene MX, no puede recibir email real hoy). Antes de tocar las 3 cuentas reales se validó el método completo con una cuenta descartable (creada, un login por password real contra `/auth/v1/token` confirmó un `access_token` de verdad, borrada). En esa validación salió un bug real de Postgres/GoTrue: dejar `confirmation_token` (y las demás columnas `*_token`/`email_change*`) en `NULL` en vez de `''` rompe el login con `500 unexpected_failure` — GoTrue las escanea como `string` Go, no como nulables (`sql: Scan error on column ... converting NULL to string is unsupported`, visible en los logs de `auth_logs`). Las 3 cuentas reales ya se crearon con esas columnas en `''` desde el inicio. Saludo nuevo al entrar: `AuthContext.jsx` ahora trae `sedes(nombre)` en el mismo query de `usuarios_dashboard` (mismo patrón que ya usan `usePedidos`/`useConversaciones`); operador ve "Bienvenido/a, Administrador/a de [sede real]", admin ve un saludo general sin sede — verificado con captura real logueado como ambos roles. Identidad visual: `imagenes/logo/` tenía 5 archivos nuevos (logo real sin fondo + 4 variaciones cromáticas); se copió `LogoBakeBrothers-sin-fondo.png` a `apps/admin/public/img/logo-bakebrothers.png` y reemplaza el texto placeholder del header y del login. Se muestreó el color real de `BakeBrothers-caramelo.png` (`#A96E34`) y se agregó como `--color-caramelo`/`--color-caramelo-suave` en `index.css` — antes la interfaz era blanco/negro/gris puro; ahora el nav activo, su hover y el saludo lo usan (las variantes negro/blanco/crema no se usaron: casi idénticas a tokens ya existentes o sin ningún fondo oscuro real donde aplicarlas). **Bug de plataforma encontrado al verificar, corregido**: el logo con solo `h-9 w-auto` (mismo patrón que ya usa `apps/web/src/components/Logo.jsx`) se renderizaba aplastado (17.5px de ancho en vez de ~64px) específicamente en el navegador de previsualización de esta sesión — el motivo exacto no se determinó (no dependía de flexbox anidado, confirmado quitando un wrapper de sobra), pero forzar `width`/`height` explícitos en el `<img>` (además de las clases) lo arregló de forma robusta e independiente del motor de renderizado. Build y los 54+23 tests de siempre en verde.
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

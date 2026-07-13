# CLAUDE.md — Bake Brothers

> Documento de contexto persistente del proyecto. Léelo completo al inicio de cada sesión.
> Si tomas una decisión relevante o cambias el rumbo, actualiza este archivo.

---

## 1. Qué es esto

`bake-brothers` empezó como una SPA de e-commerce de pastelería/repostería: demo de frontend
completa, **sin backend real**. Estado actual del repo:

- React 18 (JSX puro, sin TypeScript) + Vite 6
- Tailwind CSS v4 (theme en CSS con `@theme`, sin `tailwind.config.js`) — paleta propia
  (crema, hueso, tinta, acento), tipografías Fraunces + Albert Sans
- `react-router-dom` con `HashRouter` (rutas `#/catalogo`), pensado para hosting estático
- Estado global con Context API nativo (`CartContext`), sin Redux
- Calendario custom hecho a mano (`src/components/DatePicker.jsx`), sin librería de fechas
- **`src/data/mock.js` es la ÚNICA fuente de datos**: productos, categorías, ofertas,
  pedidos, distritos. No hay `fetch`/`axios` en todo el proyecto.

Estructura actual:

```
src/
├── components/   Header, Footer, ProductCard, CartDrawer, DatePicker, CheckoutSteps...
├── context/      CartContext.jsx
├── data/         mock.js
└── pages/        Home, Catalogo, ProductoDetalle, Carrito, Checkout, Ofertas,
                  Catering, Auth, Cuenta...
```

Flujos que ya existen en el front (y cuyas reglas hay que preservar):

1. **Catálogo**: filtros (categoría, búsqueda, precio, disponibilidad, ofertas) y orden,
   todo client-side sobre el array de mock.
2. **Detalle de producto**: tamaño (Personal / Mediano / Grande, con multiplicador de
   precio), extras (dedicatoria, vela, decoración a S/8), botón de WhatsApp con mensaje
   prellenado.
3. **Carrito**: precio calculado por tamaño + extras, cupón `BAKE10` hardcodeado,
   delivery S/12 (gratis sobre S/150).
4. **Checkout**: wizard de 5 pasos (datos → entrega → fecha/hora → pago simulado →
   confirmación). El `DatePicker` soporta fecha mínima, usada para los avisos de
   **48h de anticipación en tortas** y **24h en bocaditos**.
5. **Catering**: 4 paquetes + formulario de cotización (mismo `DatePicker`); el envío solo
   cambia estado local.
6. **Auth/Cuenta**: no valida nada real; "Mis Pedidos" muestra 5 pedidos hardcodeados con
   timeline de estado.

---

## 2. A dónde vamos

Convertirlo en una plataforma real con **tres consumidores sobre un mismo núcleo**:

```
WhatsApp del cliente ──► Servicio de bot ──┐
                                           ├──► API + Postgres ──► Dashboard del negocio
Tienda web (React) ────────────────────────┘
```

El bot toma pedidos por WhatsApp. El dashboard le permite al negocio ver esos pedidos en
tiempo real, cambiar su estado, gestionar producción y responder conversaciones.

### La regla que ordena todo el proyecto

> **El cálculo de precios, la validación de anticipación y la validación de capacidad viven
> en UN solo módulo (`packages/domain`). El front, el bot y el dashboard lo importan.
> Nunca se duplica esta lógica.**

Si el bot calcula precios por su cuenta, en tres semanas hay tres lógicas de precio que se
contradicen. En pastelería el precio depende de tamaño + extras + delivery + cupón: es
exactamente donde más duele.

---

## 3. Decisiones tomadas (no las cuestiones, no propongas alternativas)

| Decisión | Detalle |
|---|---|
| Base de datos | Postgres vía **Supabase** (Realtime para el dashboard, Auth para el login del negocio, Storage para comprobantes de pago, RLS para aislar tenants) |
| API / bot | **Node + TypeScript + Fastify**, desplegado en Railway/Render. NO en Edge Functions: el bot necesita logs, reintentos y un módulo de dominio testeable. |
| Monorepo | pnpm workspaces |
| WhatsApp | **Cloud API oficial de Meta**. NO Baileys / whatsapp-web.js. |
| Multi-tenant | **Desde la primera migración**. Toda tabla de negocio lleva `tenant_id`. |
| Front | Se mantiene en JSX sin TypeScript. No lo migres. |

### Monorepo

```
apps/
├── web/        el front actual, movido tal cual (JSX, Vite)
├── api/        Fastify: API REST + webhook de WhatsApp + lógica del bot
└── admin/      dashboard del negocio (React + Vite + TS)
packages/
└── domain/     TypeScript puro, sin I/O: precios, reglas, máquina de estados
```

### Por qué multi-tenant desde el día 1

Esto no es un proyecto único: es el **tenant #1 de un producto** vendible a cualquier
pastelería, restaurante o florería. Agregar `tenant_id` hoy cuesta cero; agregarlo cuando
ya hay 3 negocios en producción es reescribir el esquema y migrar datos.

Corolario: nada específico de "Bake Brothers" se hardcodea. Colores, textos, catálogo,
reglas de anticipación, zonas de delivery y horarios son **configuración del tenant**.

---

## 4. Reglas de negocio (fuente de verdad)

Hoy están dispersas en los componentes. Hay que extraerlas a `packages/domain`.

- **Precio de ítem** = `precio_base × multiplicador_de_tamaño + Σ extras`
  - Tamaños: Personal / Mediano / Grande, cada uno con su multiplicador.
  - Extras: dedicatoria, vela, decoración (S/8).
- **Delivery**: S/12; gratis si el subtotal supera S/150.
- **Cupones**: `BAKE10` (10%). Debe volverse tabla, no constante.
- **Anticipación mínima**: 48h para tortas, 24h para bocaditos. Es una propiedad de la
  **categoría**, configurable por tenant, no un `if` en el código.
- **Capacidad de producción por día** *(no existe en el mock — requisito real)*: el negocio
  no puede aceptar 40 tortas para el mismo domingo. Cupos por día y por tipo de producto,
  con posibilidad de bloquear días completos desde el dashboard.
- **Zonas de delivery**: distritos cubiertos; fuera de zona no se acepta pedido.
- **Horarios de entrega**: franjas válidas por día.

### Estados del pedido

```
draft → confirmed → payment_pending → paid → in_production → out_for_delivery
      → delivered
      ↳ cancelled (desde cualquier estado previo a delivered)
```

`payment_pending` existe porque el flujo real en Perú es Yape/Plin: el cliente manda una
captura y **una persona la verifica** desde el dashboard.

---

## 5. WhatsApp Cloud API — lo que hay que saber antes de tocar código

Estas cosas muerden si se descubren tarde:

- **El número no puede estar activo en la app de WhatsApp.** Si el dueño usa ese número hoy,
  hay que migrarlo o conseguir otro.
- **Ventana de 24 horas**: solo se pueden mandar mensajes de texto libre dentro de las 24h
  posteriores al último mensaje del cliente. Fuera de eso hacen falta **plantillas aprobadas
  por Meta**. Los avisos de estado ("tu pedido está en camino") son plantillas de utilidad:
  hay que crearlas y esperar aprobación. **Redactarlas y enviarlas a aprobación en Fase 1**,
  no al final.
- **Los webhooks se reintentan.** Deduplicar por `message_id` en base de datos o se duplican
  pedidos.
- **Límites de UI**: máximo 3 botones por mensaje interactivo; máximo 10 filas por sección
  en una lista. El catálogo debe navegarse por categorías para caber.
- Verificar la firma `X-Hub-Signature-256` de cada webhook.
- Responder al webhook con 200 **de inmediato** y procesar en background. Meta corta a los
  pocos segundos.
- **Para la demo no hace falta verificación de Meta**: el número de prueba de Cloud API
  permite mandar mensajes gratis a 5 números registrados. Suficiente para grabar el video
  de venta.

---

## 6. Diseño del bot

**Máquina de estados determinista**, no un bot "puro LLM". El flujo de pedido es
determinista y un error de precio es plata perdida.

```
IDLE → CATEGORÍA → PRODUCTO → TAMAÑO → EXTRAS → (¿otro producto?)
     → DATOS → DISTRITO → FECHA/HORA → CUPÓN → RESUMEN → PAGO → CONFIRMADO
```

- El estado de la conversación **se persiste en base de datos**, nunca en memoria del
  proceso. Si el servicio se reinicia, ningún pedido a medias se pierde.
- El LLM entra en exactamente dos puntos:
  1. **NLU**: mapear texto libre a intent + slots ("quiero una torta de chocolate mediana
     para el sábado" → `add_item`, producto, tamaño, fecha).
  2. **FAQ**: responder preguntas fuera de flujo ("¿tienen sin azúcar?", "¿a qué hora
     abren?") desde datos del tenant.
  Los totales, la anticipación y la capacidad **siempre** los resuelve `packages/domain`.
- **Handoff humano**: si un operador responde desde el dashboard, el bot se **pausa** en esa
  conversación (flag `bot_paused_until`). Sin esto, el bot le responde encima a la dueña.
- Comandos de escape siempre disponibles: `menu`, `cancelar`, `humano`.

---

## 7. Dashboard del negocio

Lo que decide si lo usan o lo abandonan:

- **Kanban de pedidos por estado**, con **Realtime** (Supabase Realtime) y **sonido** al
  entrar un pedido nuevo.
- **Vista de producción / calendario**: qué se hornea cada día, cupos usados vs disponibles,
  botón para bloquear un día.
- **Verificación de pagos**: ver la captura de Yape que mandó el cliente y aprobar/rechazar
  (`payment_pending` → `paid`).
- **Bandeja de conversaciones**: leer el chat de WhatsApp, responder a mano, pausar el bot.
- **Cambio de estado** que dispara automáticamente la plantilla de WhatsApp al cliente.
- **Métricas**: pedidos/día, ticket promedio, productos top, % de conversaciones que
  terminan en pedido.
- **Catálogo**: CRUD de productos, precios, tamaños, extras, cupones, zonas y capacidad.
  (Si el negocio no puede subir un producto solo, el producto no es vendible.)

---

## 8. Modelo de datos

Todas las tablas de negocio llevan `tenant_id`, con RLS que impide cruzar tenants.

| Tabla | Notas |
|---|---|
| `tenants` | negocio, config (colores, horarios, moneda, número de WhatsApp) |
| `users` | operadores del dashboard, con rol y `tenant_id` |
| `categories` | incluye `lead_time_hours` (48 tortas / 24 bocaditos) |
| `products` | precio base, categoría, disponibilidad, oferta |
| `product_sizes` | Personal/Mediano/Grande + multiplicador |
| `extras` | dedicatoria, vela, decoración (precio) |
| `coupons` | código, tipo, valor, vigencia, tope de usos |
| `delivery_zones` | distrito, costo, mínimo para gratis |
| `production_capacity` | fecha, tipo, cupos totales, cupos usados, bloqueado |
| `customers` | nombre, teléfono (clave para cruzar WhatsApp ↔ web) |
| `orders` | canal (`web` \| `whatsapp`), estado, totales, fecha/hora de entrega |
| `order_items` | producto, tamaño, extras, precio **congelado** al momento del pedido |
| `payments` | método (yape/plin/link), URL del comprobante, estado, verificado_por |
| `conversations` | `wa_id`, estado del bot, `bot_paused_until`, `last_inbound_at` |
| `messages` | dirección, tipo, contenido, `wa_message_id` **UNIQUE** (dedupe) |

`order_items` guarda el precio calculado, no una referencia viva: si mañana sube el precio
de la torta, los pedidos viejos no cambian.

---

## 9. Roadmap por fases

> **Una fase por sesión.** No mezclar. Al terminar cada fase, actualizar este archivo.

### Fase 0 — Cimiento (la más importante, la menos sexy)

1. Reestructurar a monorepo pnpm. Mover el front a `apps/web` **sin cambiar su
   comportamiento** (debe seguir levantando y funcionando igual).
2. Leer `src/data/mock.js` y `src/pages/*` y extraer las reglas de la sección 4 a
   `packages/domain` como **funciones puras con tests (vitest)**.
3. Migraciones SQL en `apps/api/migrations` con el esquema de la sección 8 + seed que carga
   Bake Brothers (tenant #1) con los datos actuales del mock.
4. API en Fastify con validación zod:
   - `GET /api/products`, `/api/products/:id`, `/api/categories`, `/api/delivery-zones`
   - `GET /api/availability?date=&category=` → cupos disponibles
   - `POST /api/orders` → **calcula el total en el servidor** con `packages/domain`, valida
     anticipación y capacidad. **Nunca confía en el total que manda el cliente.**
   - `GET /api/orders`, `PATCH /api/orders/:id/status`
5. Reemplazar `mock.js` en el front por llamadas a la API. UI intacta.

**Aceptación**
- `pnpm test` pasa; hay un test por cada regla de la sección 4.
- La tienda web funciona igual que antes, leyendo de Postgres.
- `POST /api/orders` con una torta para dentro de 12h → rechazado (regla de 48h).
- `POST /api/orders` en un día sin cupos → rechazado.
- Ninguna consulta puede leer datos de otro tenant.

### Fase 1 — Bot (happy path)

1. Webhook `POST /webhook/whatsapp` + verificación `GET` + validación de firma. Responder
   200 inmediato, procesar en background.
2. Dedupe por `wa_message_id`. Persistir `conversations` y `messages`.
3. Máquina de estados de la sección 6, con estado en DB. Mensajes interactivos (listas de
   categorías/productos, botones de tamaño).
4. Al confirmar: crear `order` con `channel = 'whatsapp'` usando **la misma** función de
   `POST /api/orders`.
5. Comandos `menu` / `cancelar` / `humano`.
6. Redactar las plantillas de estado y **enviarlas a aprobación de Meta ya** (tardan).

**Aceptación**
- Un pedido completo por WhatsApp aparece en `orders` con el total correcto.
- Reenviar el mismo webhook dos veces no duplica nada.
- Pedir una torta para mañana → el bot la rechaza y ofrece la primera fecha válida.

### Fase 2 — Dashboard (el hito que vende)

1. `apps/admin`: login (Supabase Auth), Kanban de pedidos, **Realtime + sonido**.
2. Detalle de pedido, cambio de estado.
3. Vista de producción/calendario con cupos.

**Aceptación**: *un pedido hecho por WhatsApp aparece solo en el dashboard, sin refrescar.*
Este es el clip del video de venta.

### Fase 3 — Producción real

- Pagos: Yape/Plin con captura → Storage → `payment_pending` → verificación en dashboard.
- Envío de plantillas al cambiar de estado (respetando la ventana de 24h).
- Bandeja de conversaciones + handoff humano.
- CRUD de catálogo, cupones, zonas y capacidad.

### Fase 4 — Producto

- NLU con LLM sobre la máquina de estados.
- Métricas.
- Onboarding de un segundo tenant sin tocar código.

---

## 10. Reglas de trabajo

- **Antes de escribir código, lee el repo y presenta un plan. Espera OK.**
- Una fase por sesión. No adelantes trabajo de fases siguientes.
- No agregar librerías innecesarias. No migrar el front a TypeScript.
- Nada de lógica de precios fuera de `packages/domain`.
- Nada específico de Bake Brothers hardcodeado: va en la config del tenant.
- Al terminar una fase, actualizar este archivo con lo hecho y lo aprendido.

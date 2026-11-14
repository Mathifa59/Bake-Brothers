# Bake Brothers — resumen del proyecto (para la integración con Metricool y ManyChat)

> Resumen de entrada para otro agente. La fuente de verdad completa es `CLAUDE.md` (raíz del repo). Aquí va lo necesario
> para entender el sistema y decidir cómo encajan Metricool y ManyChat. **No hay claves ni contraseñas en este archivo**
> (viven en Coolify, Vercel y Supabase, y en `BakeBrothers-datos-privados\`, fuera de git).

## 1. Qué es

Proyecto exclusivo de **Bake Brothers** (Corporación Hermanos Loarte S.A.C.), pastelería con 2 locales en Chorrillos, Lima:
**Cedros** y **Santa Marina**. No se revende (el modelo multi-tenant original se descartó; `tenant_id` sigue en las tablas con una sola fila).
Tres piezas:

1. **Web** (`apps/web`, React 18 + Vite + Tailwind, JSX sin TypeScript): sitio de 3 páginas (`/`, `/menu`, `/locales`) + `/privacidad`. Todo empuja a WhatsApp. **Sin carrito, checkout ni formularios.** Dominio: `https://www.bakebrothers.pe`.
2. **Bot omnicanal** (`apps/api`, Fastify + zod + pg, TypeScript): hoy atiende **WhatsApp** de punta a punta (Claude con herramientas sobre catálogo/precios/reglas reales). Messenger e Instagram llegan al mismo webhook pero **no tienen parser todavía**.
3. **Bake OS** (`apps/admin`, el dashboard/CRM, React): pedidos, producción, órdenes de mayoristas, stock, catálogo, clientes, conversaciones, métricas, «Origen de clientes». Dominio: `https://dashboard.bakebrothers.pe`. Pensado para celular primero (375 px).

Monorepo pnpm: `apps/web`, `apps/api`, `apps/admin`, `packages/domain`.

**Regla que ordena todo:** la lógica de precios, anticipación, cortes, horarios, semáforo de catering y máquinas de estado vive **solo en `packages/domain`** (TS puro, con tests). Web, bot y dashboard la importan; nunca se duplica.

## 2. Infraestructura

| Pieza | Dónde |
|---|---|
| Base de datos | Supabase (Postgres, São Paulo, plan free). Migraciones `0001→0051` en `apps/api/migrations/`, aplicadas al real. RLS por sede en `orders`, `stock`, `customers`, `conversaciones`, etc. |
| API | Coolify en Hetzner, `https://api.bake-brothers.com` (el webhook es `/webhook`; **no cambió con el cambio de dominio de la web**). Redeploy manual: lo hace el usuario. `GET /health` devuelve el commit que corre. |
| Web y panel | Vercel, autodeploy al hacer push a `main`. |
| Auth del panel | Supabase Auth. Roles: `admin` y `operador` (en pantalla «empleado»: ve Pedidos, Nuevo pedido, Producción, Órdenes, Conversaciones, Stock, Ajustes, Avisos de su sede). |
| Contacto | WhatsApp `912944096` (web y atención), Instagram y Facebook `bakebrothers.pe` (cuenta única de marca, no por sede). |

## 3. Cómo funciona el bot de WhatsApp (lo que más importa para ManyChat)

- **Conexión directa a la Cloud API de Meta**, sin proveedor intermedio (BSP). Un **número solo para el bot**, registrado en `whatsapp_conexiones` (token de usuario del sistema, cifrado con AES). Alta con `pnpm whatsapp:alta` y `pnpm whatsapp:registrar -- --bot …`. Plan de migración del número del cliente: `docs/migracion-numero.md`.
- **Un solo número para los dos locales:** la conversación nace sin local y el bot **pregunta el local de recojo**; un delivery nace sin local y cualquier persona lo toma con «Me lo quedo».
- **Flujo:** `POST /webhook` verifica firma (`META_APP_SECRET`, 503 en producción si falta), marca el mensaje en `mensajes_webhook_procesados` (idempotencia por `mensaje_id`), responde 200 enseguida y procesa en segundo plano (`bot/procesarWebhookWhatsApp.ts` → `bot/cerebro.ts`). Un fallo interno **escala a una persona**, nunca deja un mensaje sin respuesta.
- **Cerebro:** loop de tool-use con Claude (modelo configurable `BOT_MODELO`, hoy Sonnet; Haiku preparado), tope de 6 vueltas. Herramientas: precio, disponibilidad, combos, listar catálogo, reglas de catering, `crearPedido`, `registrarConsentimientoPromociones`, `escalarAHumano`. Hay reglas que hace cumplir **el servidor y no el modelo**: alergias (respuesta fija), catering siempre a una persona, corte del día, horarios, agotados por local, mayoristas, delivery solo en distritos con cobertura, el bot **nunca da precios de envío ni promete horas exactas**.
- **Interruptor «Bot activo / apagado»** (Ajustes, tabla `configuracion_bot`): hoy arranca **apagado** (no hay saldo de Anthropic). Apagado: el mensaje entra a Conversaciones como «esperando persona», con aviso en campana y push, y una bienvenida automática opcional.
- **Ventana de 24 h de WhatsApp:** el servidor rechaza texto libre pasada la ventana; hay que enviar una **plantilla** aprobada (se leen desde Meta y se envían a mano desde el panel). Plantillas listas para crear en Meta: `docs/plantillas-whatsapp.json` / `.md` (9 esenciales, 3 opcionales, todas UTILITY/es). **Aún no hay disparadores automáticos de plantillas.**
- **Pagos:** Santa Marina y todo delivery cobran con Baker Brothers E.I.R.L.; Cedros con Corporación Hermanos Loarte S.A.C. El recojo se paga en tienda; el delivery, por adelantado. Una captura de pago se lee con visión y queda como «pago reportado»: **una persona lo confirma** (Sara, administradora). El bot nunca marca pagado.
- **Tono:** español con tuteo peruano (hay un test que falla si aparece voseo). Sin `**doble asterisco**` (WhatsApp).

## 4. Datos y modelos que tocan marketing

- **Atribución:** `orders.campana` y `orders.ctwa_clid` existen. Hoy la ruta es: link con `?utm_…` en la web → la web agrega «(ref: tt-halloween)» al mensaje de WhatsApp → el bot lee la referencia (`packages/domain/src/campana.ts`) → queda en `orders.campana`. Se ve en la pantalla **«Origen de clientes»** (`/atribucion`), que hoy dice que se activa con los links de campaña de Instagram y Facebook. **No hay captura de `ctwa_clid` (anuncios que abren WhatsApp) cableada todavía.**
- **Consentimiento de marketing:** `customers.acepta_marketing` (NULL = no se sabe), `acepta_marketing_en`. El bot pregunta **una sola vez**, después de registrar un pedido, y lo guarda (solo si estaba NULL). **Todo envío masivo debe pasar por `puedeRecibirEnvioMasivo()`** (`packages/domain/src/consentimientoMarketing.ts`): solo `acepta_marketing === true`, con teléfono y no interno. **Nunca filtrar por «tiene teléfono».** Hoy no existe ningún envío masivo.
- **Clientes:** teléfono único en formato E.164 (`+51…`), con segundo número opcional. ~6,190 contactos importados de la agenda (`origen = 'contactos'`, consentimiento NULL: ninguno recibe envíos masivos), 83 mayoristas (74 sin teléfono) y 2 clientes internos (las propias tiendas, no cuentan como ventas).
- **Messenger / Instagram:** `POST /webhook` detecta `object: "page"` e `"instagram"` y **guarda el payload crudo completo** en `eventos_meta_sin_procesar` (0025) para construir el parser después con ejemplos reales. No se responde nada por esos canales.
- **Conversaciones:** tabla `conversaciones` (canal, estado `activa/escalada/atendida_por_operador/cerrada`, historial jsonb, `customer_id`, `whatsapp_phone_number_id`, `contexto`). Bandeja en el panel con tiempo real, no leídos y respuestas rápidas.

## 5. Decisiones ya tomadas sobre esta integración

- **ManyChat (Instagram/Facebook), links de campaña y Mifact = «fase siguiente»** (decisión del cliente, 2026-11-13). No se ha construido nada de eso.
- **Formulario de contacto: no se construye.** Todo va a WhatsApp.
- Metricool: **no hay ninguna referencia en el código.** En este entorno hay conectadas herramientas de programación de publicaciones y analítica por red social (probablemente Metricool: verificar qué cuenta y qué marcas ve antes de asumir).

## 6. Puntos a decidir con el otro agente (riesgos reales)

1. **ManyChat y el número de WhatsApp.** Hoy el número del bot está conectado **directo a la Cloud API** con nuestro webhook. ManyChat se conecta como proveedor sobre su propio flujo: **dos sistemas no pueden recibir y responder el mismo número a la vez** sin duplicar respuestas. Lo más seguro: ManyChat solo para **Instagram y Messenger**, y dejar WhatsApp con el bot propio. Cualquier otra opción exige decidirlo con el cliente.
2. **Quién responde en Instagram/Facebook.** Opciones: (a) ManyChat responde con flujos y **empuja a WhatsApp** con un enlace que lleve la referencia de campaña («(ref: …)»); (b) ManyChat reenvía el mensaje a nuestra API para que lo atienda el mismo cerebro (requiere un parser y un envío nuevos). La (a) cuadra con el principio del sitio («todo empuja a WhatsApp») y no toca el cerebro.
3. **Atribución.** Hay que definir una convención de `?utm_…` / `(ref: …)` común entre Metricool (links de publicaciones y anuncios) y ManyChat (flujos, comentarios con palabra clave) para que `orders.campana` y «Origen de clientes» funcionen. Falta decidir si se captura también `ctwa_clid`.
4. **Consentimiento.** Si ManyChat captura contactos o suscripciones (Instagram/Messenger), **no equivale** a `acepta_marketing` de WhatsApp: no mezclar listas ni usar esos contactos para envíos por WhatsApp sin el consentimiento propio de ese canal.
5. **Datos personales.** No mandar a servicios externos nombres, teléfonos ni pedidos de clientes sin decisión explícita del cliente; la política de privacidad (`/privacidad`) está pensada para el alta del número en Meta y habría que revisarla si entra ManyChat.
6. **Metricool.** Útil para programar publicaciones y leer analítica de las cuentas de marca; no toca pedidos. Un posible puente: traer a Bake OS las métricas por campaña (alcance/clics) para cruzarlas con `orders.campana`. Hay que ver qué expone su API y qué plan tiene la cuenta.

## 7. Reglas de trabajo del proyecto (el otro agente debe respetarlas)

- Presentar un plan y **esperar OK** antes de escribir código; una rama aparte por pedido, tests y OK del usuario antes de `main`.
- **Nada al Supabase real sin OK explícito**; si el conector rechaza una migración, se entrega el SQL para el SQL Editor (no se fuerza por otra vía). Toda tabla nueva necesita sus `grant` explícitos (0013 quitó los privilegios por defecto) y RLS.
- Cero secretos en el repo o en el chat. Datos reales de clientes (Excels, CSV, hojas impresas) viven en `BakeBrothers-datos-privados\`, **nunca** en git. Nunca `git add -A`.
- Responder siempre en español. Sin llamadas reales a Claude/Anthropic para probar (no hay saldo): se mockea el SDK.
- Windows: no hay `pnpm` global (usar `npx vitest`, `npx tsc`, `npx vite build`); recompilar `packages/domain` (`npx tsc -p .`) antes de los tests del API; base local de pruebas en Docker (`bb-pg-sim`).
- Nada de `reply` dentro del callback de `withTenantTx` en rutas nuevas (responder después del commit).
- Para verificar un Redeploy: `curl https://api.bake-brothers.com/health` y comparar `commit` con `git rev-parse --short HEAD`.

## 8. Estado actual y pendientes (2026-11-14)

- **En `main` y producción:** web, Bake OS, API con bot de WhatsApp (apagado por falta de saldo), catálogo gestionable, Órdenes/Producción/Stock, horarios con una sola fuente (`sedes_horarios`), pedido «para hoy» con validaciones, corte de las 11:00 p. m. para todos.
- **En rama, esperando OK:** `feature/hoja-unica-del-dia` (una sola hoja imprimible con todas las órdenes del día).
- **Esperando al cliente/equipo:** cuenta de Sara (confirma pagos), lista de perfiles del equipo, teléfonos de mayoristas, Excel del catálogo (qué se vende hoy y precios), fotos de ~24 productos, quién ve Métricas, saldo de Anthropic para encender el bot.
- **No empezado:** parser de Messenger/Instagram, envíos masivos, disparadores automáticos de plantillas, facturación con Mifact (emisores creados, sin series ni token), captura de `ctwa_clid`, formulario de contacto (Resend, mejora futura).
- **Para ubicarse en el código:** `apps/api/src/bot/` (webhook, cerebro, tools, meta), `apps/api/src/services/`, `apps/api/migrations/`, `packages/domain/src/`, `apps/admin/src/pages/`, `docs/` (plantillas, migración del número, salida a producción, encendido del bot).

# Bake Brothers — estado del proyecto al 26 de noviembre de 2026

Documento de traspaso para otro Claude (chat) que necesite el contexto completo de lo último que se hizo, lo que se corrigió y lo que falta. **La fuente de verdad detallada sigue siendo `CLAUDE.md`** (raíz del repo); este archivo es el resumen del tramo más reciente y la lista de pendientes.

Responder siempre en **español** (tuteo peruano). Los números de pedido van «BB-xxxx».

---

## 1. Qué es y dónde vive

Monorepo de Bake Brothers (pastelería, 2 locales en Chorrillos, Lima: **Cedros** y **Santa Marina**).

| Pieza | Carpeta | Dónde corre |
|---|---|---|
| Landing | `apps/web` | Vercel, proyecto `bake-brothers` → `https://www.bakebrothers.pe` |
| Panel «Bake OS» | `apps/admin` | Vercel, proyecto `bake-brothers-admin` → `https://dashboard.bakebrothers.pe` |
| API + bot de WhatsApp | `apps/api` (Fastify) | Coolify → `https://api.bake-brothers.com` (el webhook y la API NO cambiaron de dominio) |
| Reglas de negocio | `packages/domain` | librería compartida (precios, estados, horarios, comprobantes…) |
| Base de datos | Supabase real, ref `umyaytrojtbdvdzbrily` | migraciones `apps/api/migrations/` |

**Estado de producción hoy (verificado el 2026-11-26, tras el último Redeploy):** `main` = `a11ca3c`; `https://api.bake-brothers.com/health` responde `{"ok":true,"commit":"a11ca3c"}`; el panel y la landing en Vercel salen del mismo commit. En el Supabase real están aplicadas las migraciones 0001→0051 y 0053→0059 (la 0052 pertenece a una rama de respuestas automáticas de Instagram que no se ha mergeado; la 0060 está en espera). **No hay nada pendiente de mergear ni de aplicar a la base.**

## 2. Lo hecho en este último tramo (todo en `main`, publicado)

1. **Hook anti-DROP** (`scripts/hook-sin-drop.mjs`, registrado en `.claude/settings.json`): bloquea en Claude Code cualquier texto con borrado de bases, tablas o esquemas (Bash, PowerShell, `execute_sql`, `apply_migration`).
2. **Mifact en producción.** Las dos razones sociales emiten con su propia serie y correlativo. Baker Brothers E.I.R.L. cobra Santa Marina y todo el delivery; Corporación Hermanos Loarte S.A.C. cobra Cedros. El entorno se deduce de la URL (empieza con `demo.` = demo). Se emitieron **dos boletas reales**: BB-2500 (Santa Marina, Baker Brothers) y BB-2501 (Cedros, Hermanos Loarte), ambas `B002-00000001`, en estado «En proceso».
3. **Panel reorganizado:** «Control Tower» se fundió en **Resumen** (tarjeta «Hoy · prioridades» arriba, contador rojo en «Resumen»); el importador de códigos de Mifact pasó a una pestaña de **Catálogo** («Códigos de Mifact»), que solo se ve con `VITE_MIFACT_IMPORTADOR=true` (apagada). `VITE_MIFACT_ACTIVO` quedó solo para el botón «Comprobante» de los pedidos.
4. **Landing:** Google Tag Manager `GTM-TQQGD3V9` con Consent Mode (analítica denegada hasta que la persona acepte), aviso de cookies de ancho completo, evento `whatsapp_click` al `dataLayer`, y sección de cookies en la política de privacidad (**borrador que debe revisar el cliente**).
5. **Corrección de «Nuevo pedido» y Stock:** mostraban el tamaño oculto «Mediana» de las empanadas (solo para mayoristas) y el pedido fallaba con `TAMANO_NO_APLICA`. Ahora filtran `visible_publico = true`. La casilla «¿Ya pagó?» pasó a decir «Pagado».
6. **Boletas «En proceso» (rama mergeada el 26-nov):**
   - Las boletas llegan a SUNAT por el **resumen diario**: Mifact las deja «En proceso» (101) y las pasa a «Aceptado» (102) en la madrugada siguiente. Una baja solicitada (108) pasa a «Anulado» (105) al terminar el día.
   - El panel muestra una **nota** bajo cada boleta que explica eso (regla pura `notaEstadoComprobante` en el dominio).
   - La API **consulta sola a Mifact cada 30 min** las boletas en proceso o con baja solicitada de días anteriores (`apps/api/src/mifact/actualizacionAutomatica.ts`, función `actualizarEstadosPendientes`). Tope de 50 por vuelta, de a una; no reconsulta una consultada hace menos de 60 min; no toca lo de hoy, ni lo pendiente de envío, ni estados finales. Se apaga con `MIFACT_ACTUALIZACION_AUTOMATICA=false`. El botón «Actualizar estado» sigue funcionando.
7. **Pago en «Nuevo pedido» (mergeado el 26-nov, migración 0059 aplicada):**
   - El selector «¿Con qué pagó?» aparece solo si se marca «Pagado», con Yape, Plin, Transferencia, Tarjeta y **Efectivo**.
   - El servidor manda: sin pagar, el pedido nace «Confirmado» y se guarda como `contraentrega` (paga al recoger), aunque el navegador mande otro medio; pagado exige un medio y no acepta `contraentrega` (400).
   - Alcance: solo Nuevo pedido del panel. El bot y `POST /api/orders` no usan «efectivo».
   - El PDF del pedido imprime el medio con su nombre y la hoja de agendados dice EFECTIVO.

8. **Alerta de boletas sin respuesta (mergeada y desplegada el 26-nov):** en el Resumen, una boleta o factura que sigue esperando a Mifact/SUNAT (`pendiente_envio`, `en_proceso` o `anulacion_solicitada`) **más de 2 días** sale como fila («B002-… lleva N días sin respuesta de SUNAT · avisa a Mifact»), la más antigua primero, y suma al contador rojo de «Resumen». Los comprobantes no se leen por Supabase (sin permisos para el panel): salen de la API, `GET /api/dashboard/comprobantes/sin-respuesta` (solo Administración); solo se consulta con `VITE_MIFACT_ACTIVO`, y si falla, el resto de las alertas se muestra igual. Regla pura en `packages/domain/src/alertas.ts` (`DIAS_SIN_RESPUESTA_COMPROBANTE`). Hoy no debería salir ninguna: BB-2500 y BB-2501 tienen un día.
9. **Avisos de pedido nuevo del bot, de cualquier día:** antes solo avisaba los pedidos «para hoy»; ahora todo pedido que el bot registra (título «Pedido para hoy N» o «Pedido nuevo N»). Los avisos `orden_nueva`, `pedido_nuevo` y `pago_reportado` respetan `avisa_ordenes` / `avisa_pagos` de cada perfil (`usuario_recibe_aviso`, migración 0054). Arreglo de la etiqueta del push: un pedido o un pago ya no reemplaza la notificación del mensaje de su conversación (solo los avisos de mensaje comparten etiqueta por conversación). El dueño decidió dejar así los avisos de pedidos de cualquier día.
10. **CORS limpiado y verificado desde fuera tras el Redeploy:** `apps/api/src/app.ts` ya no permite `bake-brothers.com`, `www.bake-brothers.com`, `dashboard.bake-brothers.com`, `bake-brothers-admin.vercel.app` ni el alias de rama de la landing. Quedan `www.bakebrothers.pe`, `bakebrothers.pe`, `dashboard.bakebrothers.pe`, `localhost:5173` y `:5174`, y el patrón acotado de vistas previas del panel (`bake-brothers-admin-…-mathias-projects-eaced134.vercel.app`). Verificado: los dominios nuevos reciben permiso y los viejos no; los dominios viejos siguen redirigiendo (307/308) al nuevo, así que a la gente no se le rompe nada.
11. **`docs/migracion-numero.md` reescrito para un portafolio comercial NUEVO de Meta** (el anterior fue hackeado). Decisiones: razón social **BAKER BROTHERS E.I.R.L.** (RUC 20612010880; pendiente de que Javier lo confirme), nombre visible del número **«Bake Brothers»** (riesgo previsto: el nombre legal lleva «Baker», con «r»; plan: que la web y las redes muestren «Bake Brothers» y que el sitio diga que es una marca de BAKER BROTHERS E.I.R.L.). Incluye qué documentos suele pedir Meta, cómo **detectar antes de la noche si el número estuvo en el portafolio hackeado** (6 pasos, el último una prueba en seco en la WABA nueva que no pide el código) y qué hacer según el resultado (noche normal / liberarlo uno mismo / caso con soporte de Meta sin borrar la cuenta del celular / **plan B: número nuevo solo para el bot**). Hallazgos: el portafolio anterior no dejó rastro en la base (0 conexiones, 0 mensajes y 0 eventos de Meta); hay que **cambiar `META_VERIFY_TOKEN`** y usar el secreto de la app nueva; el bot arranca **apagado**.

Pruebas al cierre: dominio 478, API 864 pasan / 84 saltadas (necesitan Claude real o JWT reales).

## 3. Errores míos corregidos (para no repetirlos)

- Dije que los códigos de Mifact viajaban en las líneas de los comprobantes: **falso**. El `COD_ITEM` sale del `slug` del producto (truncado a 30 caracteres; dos slugs de sándwiches triples lo exceden). La tabla `mifact_codigos` **no se usa en la emisión**.
- Dije que Control Tower servía al personal local: **falso**, era solo de Administración.
- Un test del harness redirigía mal una importación y el Catálogo pegó contra el Supabase real; se corrigió el plugin y el arnés se borró.
- Las pruebas con la hora del día fallaban pasadas las 8 p. m. (corte): ahora fijan la hora.
- Lección general: **medir desbordes y errores de consola no basta**; mirar capturas reales a 375, 1280 y 1440 px.

## 4. Pendiente

### 4.1 Verificar mañana (27-nov)
Cuando el dueño avise que pulsó «Actualizar estado» en BB-2500 y BB-2501 (o la actualización automática ya las pasó), **verificar en la base, solo lectura**, que `comprobantes.estado` sea `aceptado` / `estado_codigo` 102 y revisar `sunat_*`. Si salen 103 (observaciones) o 104 (rechazado), diagnosticar con la descripción de SUNAT. **No anular las boletas** hasta que Mifact explique cómo se anula una boleta bajo el resumen diario.

### 4.2 Esperando respuesta de terceros
- **Mifact:** código de establecimiento (anexo) de Santa Marina; que la plantilla de PDF de Baker Brothers use la de Hermanos Loarte (la de Baker Brothers imprime «VALOR UNIT.» = precio con IGV, la otra imprime «IMPORTE (Inc. IGV)», más clara); cómo se anula una boleta con resumen diario; archivo de productos de Baker Brothers (Santa Marina).
- **Cliente (dueño):** revisar el texto de cookies de la política de privacidad; configurar en GTM el activador y la etiqueta de `whatsapp_click` y marcarlo evento clave en GA4 (y comprobar Tiempo real); lista de mayoristas con teléfono (74 sin teléfono; las dos «TIENDA» son internas y no lo necesitan); marcar «Encargado» a `caja.cedros` y `caja.santamarina` cuando existan (las cuentas del equipo no están pendientes del cliente: Sara, administradora y quien confirma pagos, y Caja Santa Marina tienen correo ya conocido; las demás son usuario y contraseña creados por nosotros y no necesitan correo); precios internos de Unidades (empanada S/ 3 y alfajor S/ 8 para Calle se saben, pero no están cargados); precios de mayoristas; corrección de precios de Mifact de Santa Marina; fotos de unos 24 productos; ejemplos de Search Console (179 URL «bloqueadas por robots.txt», 144 con redirección, 4 con 404); usar «Cambio de dirección» en Search Console (`www.bake-brothers.com` y `bake-brothers.com` ya redirigen con 308, verificado el 26-nov).

### 4.3 Trabajo técnico por hacer (en orden aproximado)
1. **EN ESPERA** (el dueño la pausó hasta que se use el importador): **migración de códigos de Mifact por empresa (será la 0060, necesita OK explícito antes de tocar la base real):** columna `emisor` obligatoria (`baker_brothers` / `hermanos_loarte`); las 80 filas actuales pasan a `hermanos_loarte`; índices únicos por emisor+código, emisor+producto+almacén y emisor+tamaño+almacén, y recién después quitar los viejos; el servicio filtra por emisor; el importador pregunta «¿De qué empresa es este Excel?». Orden: migración → Redeploy de la API → encender `VITE_MIFACT_IMPORTADOR`.
2. **HECHO (ya en `main` y desplegado, ver puntos 8–10 de la sección 2):** alerta de boletas sin respuesta, avisos de pedidos nuevos y limpieza de CORS.
   **Pendiente de aprobación del dueño (solo propuesta, nada hecho):** una línea en el pie de la landing y en la política de privacidad que diga que Bake Brothers es una **marca de BAKER BROTHERS E.I.R.L.** (ayuda a que Meta acepte el nombre visible «Bake Brothers»). Es un cambio de `apps/web`: va directo a `main` cuando lo apruebe.
3. **Plantillas de WhatsApp** automáticas por disparadores (hoy se mandan a mano desde Conversaciones); **ManyChat / Instagram y Facebook** y links de campaña (fase siguiente); formulario de contacto con Resend (decidido: no se construye por ahora).
4. **PRIORIDAD SIGUIENTE — migración del número de WhatsApp** al API de Meta, con un **portafolio comercial nuevo** (el anterior fue hackeado): `docs/migracion-numero.md` (reescrito el 26-nov) trae qué crea el dueño en Meta y en qué orden, qué hace Claude Code y la checklist de la noche. **Bloqueos de esta etapa, en este orden:** (a) el dueño averigua si el número estuvo en el portafolio hackeado y avisa el resultado (con eso se elige: noche normal, liberarlo, caso con soporte de Meta o plan B con número nuevo); (b) Javier confirma que el portafolio va a nombre de BAKER BROTHERS E.I.R.L.; (c) el dueño crea el portafolio, verifica el negocio y la app, y genera el token del usuario del sistema (que nunca se pega en el chat). Mientras tanto no se toca nada del webhook ni de la conexión con Meta. **En espera** (hasta que haya saldo de Anthropic): las 32 conversaciones de prueba con Claude real y evaluar Haiku (`docs/cambio-a-haiku.md`); el bot arranca **apagado** y el equipo atiende a mano.
5. **Limpieza** (CORS ya está hecho): cambiar el login `adminbake@bake-brothers.com` por un correo del dominio nuevo (cuidado: es un usuario real de Supabase Auth); quitar `http://localhost:5174/**` de Redirect URLs de Supabase; el catálogo público `GET /api/products` no mira el stock por sede; el repo pasará a privado después del lanzamiento (comprobar acceso de Coolify y Vercel); decidir plan de Supabase (el gratuito se pausa y no tiene copias automáticas).

## 5. Reglas de trabajo que el dueño fijó

- **Nunca** `DROP DATABASE`, `DROP TABLE` ni `DROP SCHEMA`, ni siquiera en bases locales: usar `ALTER` o una base nueva (quitar un constraint, trigger, política o función sí se permite). Hay un chequeo estático, otro en los tests y el hook de Claude Code.
- **Landing (`apps/web`): directo a `main`, sin ramas.** Panel y API: **rama + plan + OK explícito** antes de mergear; cualquier migración al Supabase real **necesita OK explícito** y se registra en el historial de migraciones.
- No aplicar nada a la base real ni mergear API/panel sin el OK del dueño; no pegar tokens en el chat; nunca `git add -A` (hay JPG de WhatsApp y `disenos/` sueltos en la raíz que no son del código).
- Actualizar `CLAUDE.md` cuando se tome una decisión relevante.
- Ante un Redeploy de la API, verificar con `GET /health` (muestra el commit corriendo).

## 6. Cómo probar en esta máquina

- `pnpm` no funciona aquí: usar `npx vitest`, `npx vite build`, `npx tsc`, `npx tsx`.
- Pruebas de API con base local: Docker Desktop (hay que abrirlo) → contenedor `bb-pg-sim` (puerto 55432); base local de pruebas `bb_estado_auto` con las migraciones hasta la 0059; `DATABASE_URL=postgres://postgres:bbtest_local@localhost:55432/bb_estado_auto`. Nunca apuntar las pruebas al Supabase real. Los archivos de test corren en secuencia.
- El Browser pane no avanza las animaciones salvo que una captura fuerce los fotogramas.
- Hay datos privados (clientes, hojas impresas, respaldos) en `C:\Users\MathiasVasquez\Desktop\BakeBrothers-datos-privados\`, fuera de git: **nunca** subirlos.

## 7. Seguir desde otro dispositivo

**Lo que SÍ viaja con el repo** (todo en `main`, GitHub): el código, las 59 migraciones, `CLAUDE.md` (fuente de verdad detallada), este documento, `docs/migracion-numero.md`, `docs/salida-produccion.md`, `docs/perfiles-equipo.md`, `docs/cambio-a-haiku.md`, `docs/plantillas-whatsapp.*` y `.claude/settings.json` (con el hook anti-DROP).

**Lo que NO viaja y hay que traer o rehacer en el otro equipo:**
- **Variables y claves:** ninguna está en git. Las de producción viven en Coolify (API) y Vercel (landing y panel); las claves generadas están en `BakeBrothers-datos-privados\claves-para-coolify.txt` (solo en el equipo original). `apps/api/.env` hay que crearlo desde `.env.example` con una `DATABASE_URL` **local de pruebas**; nunca poner ahí la del Supabase real.
- **`BakeBrothers-datos-privados\`:** clientes, hojas impresas, respaldos, el Excel de Mifact y los SQL de carga. Si hace falta algo de ahí, copiarlo a mano; no subirlo nunca al repo.
- **Contraseñas y tokens:** gestor de contraseñas (cuentas del equipo, token de Mifact, token de Meta cuando exista). No se pegan en el chat.
- **Conectores de Claude:** el conector de Supabase (proyecto `umyaytrojtbdvdzbrily`) y el de Vercel hay que volver a autorizarlos en el otro equipo para consultar la base o los deploys. Sin ellos, igual se puede trabajar en código y pruebas locales.
- **Memoria local de Claude Code** (`~/.claude/projects/…/memory`): no se sincroniza. Sus tres reglas ya están en la sección 5 (español siempre; nunca `drop table`; landing directo a `main`).
- **Docker + base local:** `bb-pg-sim` y la base `bb_estado_auto` se crean de nuevo: Postgres 16, aplicar las migraciones en orden (en una base local de pruebas se omiten 0010 y 0015, que necesitan pgvector, y se evita tocar la 0052 de otra rama).

**Primeros pasos en el otro equipo:**
1. `git clone` del repo, `git checkout main` y `git pull`; confirmar que `git log -1` sea `a11ca3c` o posterior.
2. Leer, en este orden: este documento, la sección «Decisiones y pendientes del cliente» y las secciones 7–10 de `CLAUDE.md` que toquen lo que se vaya a hacer.
3. `npm`/`pnpm`: instalar dependencias (en el equipo original `pnpm` no funciona y se usa `npx`); reconstruir `packages/domain` (`npx tsc -p .` dentro de esa carpeta) antes de compilar el panel.
4. Verificar producción antes de tocar nada: `GET https://api.bake-brothers.com/health` (muestra el commit que corre) y comparar con `git rev-parse --short HEAD`.

**Lo primero que hay que hacer cuando el dueño hable** (ver sección 4): (1) si avisa que pulsó «Actualizar estado» en BB-2500 y BB-2501, comprobar en la base, solo lectura, que estén `aceptado` / 102; (2) si cuenta si el número estuvo en el portafolio hackeado, ajustar el plan de `docs/migracion-numero.md`; (3) si aprueba la línea «marca de BAKER BROTHERS E.I.R.L.», agregarla al pie y a la política de privacidad de la landing (directo a `main`).

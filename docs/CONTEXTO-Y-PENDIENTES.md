# Bake Brothers — contexto completo y lista de pendientes (26 de noviembre de 2026)

**Para qué sirve este archivo:** que una sesión nueva de Claude (otro chat, otro equipo) tenga TODO el contexto de lo trabajado y sepa exactamente qué falta, sin depender de la conversación anterior. Se lee en este orden:

1. Este archivo (visión completa y pendientes).
2. `CLAUDE.md` (raíz del repo): el registro detallado, cronológico y muy largo de cada decisión, bug y verificación. Es la fuente de verdad fina; úsalo para buscar el detalle de un tema concreto (con Grep), no hace falta leerlo entero.
3. `docs/estado-del-proyecto-2026-11-26.md`: resumen del último tramo y cómo seguir desde otro dispositivo.
4. `docs/migracion-numero.md`: plan de la migración del número de WhatsApp (la prioridad siguiente).

**Reglas de la sesión:** responder siempre en **español** (tuteo peruano); los pedidos se nombran «BB-xxxx»; no pegar tokens ni contraseñas en el chat; nunca `git add -A` (hay JPG de WhatsApp, `disenos/` e imágenes sueltas en la raíz que no son código).

---

## 1. Qué es el proyecto

Proyecto **exclusivo** de Bake Brothers (Corporación Hermanos Loarte S.A.C.), pastelería con **2 locales en Chorrillos, Lima: Cedros y Santa Marina**. No se revende (el plan multi-tenant original fue descartado; `plan bb.md` está obsoleto).

Tres piezas, un monorepo:

| Pieza | Carpeta | Dónde corre |
|---|---|---|
| **Landing / sitio** (3 páginas: Inicio, Menú, Locales + Privacidad). Sin carrito, sin checkout, sin formularios: todo empuja a WhatsApp | `apps/web` (React + Vite + Tailwind, JSX sin TypeScript) | Vercel, proyecto `bake-brothers` → `https://www.bakebrothers.pe` |
| **Panel «Bake OS»** (pedidos, producción, stock, catálogo, clientes, conversaciones, métricas, equipo, unidades, avisos push) | `apps/admin` (React + Vite; habla directo con Supabase con RLS y con la API para lo sensible) | Vercel, proyecto `bake-brothers-admin` → `https://dashboard.bakebrothers.pe` |
| **API + bot omnicanal de WhatsApp** (Fastify + zod + pg, TypeScript ESM) | `apps/api` | Coolify (Hetzner) → `https://api.bake-brothers.com` (el webhook `/webhook` y la API **no** cambiaron de dominio) |
| **Reglas de negocio compartidas** | `packages/domain` | librería: precios, anticipación, capacidad, estados de pedido, horarios, cortes, semáforo de catering, comprobantes, alertas, perfiles… |
| **Base de datos** | Supabase real, ref `umyaytrojtbdvdzbrily` (São Paulo) | migraciones en `apps/api/migrations/` |

**Regla que ordena todo:** el cálculo de precios y la anticipación mínima viven **solo** en `packages/domain`; el front, el bot y el panel lo importan. Nunca se duplica.

**Dominios vigentes:** landing `www.bakebrothers.pe` (y `bakebrothers.pe`, `bake-brothers.com`, `www.bake-brothers.com` redirigen ahí con 308); panel `dashboard.bakebrothers.pe` (`dashboard.bake-brothers.com` y `bake-brothers-admin.vercel.app` redirigen con 307); API `api.bake-brothers.com`.

## 2. Estado de producción hoy

- `main` = `ea8d5a3` (docs) sobre `a11ca3c`; `GET https://api.bake-brothers.com/health` responde el commit que corre (`a11ca3c` verificado tras el último Redeploy). **No hay nada sin mergear ni sin desplegar.** Ramas viejas mergeadas se pueden ignorar. Excepción: la rama `feature/respuestas-automaticas-instagram` (tiene la migración 0052) **sigue sin mergear** a propósito.
- Supabase real: migraciones **0001→0051 y 0053→0059** aplicadas (0052 es de la rama de Instagram; **0060 está en espera**).
- **El bot arranca APAGADO** (`configuracion_bot.bot_activo = false`): hoy cada mensaje de WhatsApp lo responde una persona desde el panel (Conversaciones). El número de WhatsApp todavía **no** está migrado a la API de Meta; el webhook de producción responde 503 sin firma (no hay nada apuntando).
- Mifact **en producción** (no demo): se emitieron 2 boletas reales, BB-2500 (Santa Marina, BAKER BROTHERS E.I.R.L.) y BB-2501 (Cedros, Corporación Hermanos Loarte S.A.C.), ambas `B002-00000001`, en estado «En proceso» (101) a la espera de SUNAT.
- Primer pedido real fue BB-2500 (el contador se dejó en 2499 al limpiar los datos `[PRUEBA]`).
- Pruebas al cierre: dominio 478; API 864 pasan / 84 saltadas (las saltadas necesitan Claude real o JWT reales).

## 3. Historia del proyecto en una página

1. **Semana 1 (sep-2026):** poda de la tienda virtual vieja, esquema nuevo (sedes, stock por sede, combos, catering con semáforo, usuarios del dashboard), catálogo real (58 productos, 13 combos, 14 ítems de catering), fotos reales, dominio de precios en `packages/domain`. Se retiró cupones y el cálculo automático de delivery (lo cotiza una persona).
2. **Semana 2 — bot:** webhook de Meta (idempotente, async, firma `X-Hub-Signature-256`), cerebro con tool-use real contra Claude (`bot/cerebro.ts`), RAG con pgvector/Voyage, `crearPedido` real (tienda, combos; catering siempre pasa a una persona), garantías forzadas **por código** (alergias por regex, semáforo amarillo/rojo escala, límite de 6 vueltas, el servidor decide sede/horario/stock/corte, no el modelo).
3. **Semana 3 — dashboard** (luego «Bake OS»): login, pedidos en tiempo real, stock por sede, clientes, atribución («Origen de clientes»), conversaciones con aviso sonoro y push, métricas (funciones SQL con RLS, hora de Lima), «Nuevo pedido», comprobante PDF, cuentas reales del equipo, rediseño mobile-first. Hallazgo de seguridad grave corregido (0012/0013: `anon` tenía todos los permisos).
4. **Landing:** de una sola vista con videos (GSAP/Lenis) a **sitio de 3 páginas** a pedido del cliente tras feedback real (tipografía Fredoka por el logo sans-serif, menú real con el catálogo, locales con mapa). SEO por ruta, 404 reales, GTM + Consent Mode + aviso de cookies.
5. **Lanzamiento (nov-2026):** reglas de lanzamiento (pago, delivery, catering a persona, horarios por tabla `sedes_horarios` como única fuente, corte 11 p. m.), «lo agotado no se vende», atender solo con personas (bot apagable), avisos push, catálogo gestionable con fotos en Supabase Storage, clientes con teléfono E.164 único, 83 mayoristas importados, 6,190 contactos de la agenda como base (sin consentimiento de marketing), Órdenes (flujo del Excel del equipo), Producción, Unidades/porcionado, Equipo y perfiles, Mifact (boletas y facturas electrónicas), dominios nuevos `.pe`.
6. **26-nov (último tramo):** nota y actualización automática de boletas «En proceso», pago «Efectivo» en Nuevo pedido (0059), alerta de boletas sin respuesta, avisos de todo pedido nuevo del bot, CORS limpiado, plan de migración del número reescrito para un portafolio Meta nuevo.

## 4. Decisiones del dueño que NO se re-litigan

**Negocio y cobros**
- Dos razones sociales: **BAKER BROTHERS E.I.R.L.** (RUC 20612010880) cobra y factura **Santa Marina y TODO delivery**; **Corporación Hermanos Loarte S.A.C.** (RUC 20605451005) cobra y factura **Cedros**. Regla en `entidadDeCobro` (dominio).
- **Delivery:** siempre pago adelantado; lo cotiza y coordina una persona (el bot NUNCA da un monto); solo a los distritos de `DISTRITOS_DELIVERY`; nace **sin sede** y cualquiera del personal lo toma con «Me lo quedo».
- **Recojo:** se paga en la tienda («Canceló en tienda»); el bot no ofrece pago adelantado (si el cliente lo pide: Santa Marina da `DATOS_PAGO`; Cedros se deriva a una persona). Tarjeta/Izipay: lo genera una persona.
- **Catering: siempre una persona** (el bot consulta el semáforo solo para dejar contexto). **Mayoristas:** el bot no cotiza ni toma pedidos; los deriva al +51 986 639 228. Precios válidos = los de Cedros, iguales en los dos locales; no se usan precios de Mifact.
- **Corte:** pedidos para mañana hasta las **11:00 p. m.** (todos); después, pasado mañana. «Para hoy»: el bot sí crea el pedido si hay stock, la hora cae dentro del horario del local y no es un producto solo por encargo; si no puede validarse, escala a una persona con resumen. Personas atienden WhatsApp: lunes a sábado 8:00 a. m.–8:30 p. m., domingo 10:00 a. m.–8:30 p. m.
- **Horarios** de los locales: única fuente = tabla `sedes_horarios`; la web y el JSON-LD se regeneran con `pnpm --filter @bakebrothers/api horarios:web` (pasos exactos en `CLAUDE.md`, «Cómo cambiar un horario»).
- **Pago en Nuevo pedido:** sin «Pagado» el pedido nace Confirmado y `contraentrega`; con «Pagado» se exige medio (Yape, Plin, transferencia, tarjeta, efectivo).
- **Lo agotado no se vende:** una sola regla en `packages/domain/src/disponibilidadSede.ts`; la venta NO descuenta el conteo; el bot dice «se nos agotó en <local>» y ofrece el otro.
- **Consentimiento de marketing:** el bot lo pide una vez, tras registrar un pedido; solo `acepta_marketing = true` puede recibir envíos masivos (`puedeRecibirEnvioMasivo`). Los 6,190 contactos importados y los 135 «por revisar» están en NULL: ningún envío masivo hasta que acepten. Hoy no existe ningún envío masivo.
- **Facturación Mifact:** el receptor sale siempre del cliente del pedido (nunca datos de ejemplo); correlativo lo genera nuestro sistema; nunca se reutiliza un número que pudo llegar a Mifact; la llamada a Mifact va fuera de transacciones; el token jamás se guarda ni se muestra. Emisión **a mano** (botón «Comprobante», solo Administración); **la emisión automática al confirmar pago NO está construida** (variable reservada `MIFACT_EMISION_AUTOMATICA=false`, nada la lee). El código de ítem del comprobante sale del `slug` del producto, no de `mifact_codigos`.
- **Perfiles del equipo:** administracion, caja, venta_digital, ordenes, produccion (+ `empleado_temporal` para `adminalameda` y `adminsantamaria` hasta probar las cuentas nuevas). Se hace cumplir en menú, API y RLS. Sara = administradora y quien confirma pagos.
- **Panel:** «Control Tower» vive dentro del Resumen; el importador de códigos de Mifact es una pestaña de Catálogo apagada (`VITE_MIFACT_IMPORTADOR`); Simulador y Mifact-menú ocultos.
- **Landing:** sin formulario de contacto (todo a WhatsApp); las tarjetas de producto enteras son enlace a WhatsApp (decidido).

**Reglas de trabajo fijas**
- **Nunca** `DROP DATABASE/TABLE/SCHEMA`, ni en local: usar `ALTER` o una base nueva. Hay chequeo estático, chequeo en los tests y un hook de Claude Code (`scripts/hook-sin-drop.mjs`) que bloquea hasta el texto.
- **Landing (`apps/web`): directo a `main`, sin ramas.** **Panel y API: rama + plan + OK explícito** antes de mergear. **Toda migración a la base real necesita OK explícito** y se registra en el historial de Supabase. Nunca apuntar pruebas al Supabase real.
- Antes de escribir código en un tema nuevo: leer el repo y presentar plan; esperar OK.
- Actualizar `CLAUDE.md` con cada decisión relevante.
- Tras un Redeploy de la API, verificar con `GET /health` (muestra el commit corriendo).
- Medir desbordes y consola NO basta: mirar capturas reales a 375, 1280 y 1440 px.

## 5. PENDIENTES — todo lo que falta

### 5.1 En stand by (decisión del dueño; no hacer hasta que lo diga)
1. **Línea «Bake Brothers es una marca de BAKER BROTHERS E.I.R.L. · RUC 20612010880»** en el pie de la landing (`apps/web/src/components/landing/ClosingFooter.jsx`, cerca del crédito de DevHorses) y al inicio de la política de privacidad (`apps/web/src/pages/Privacidad.jsx`, que hoy ya nombra a la E.I.R.L. como responsable de Santa Marina). Sirve para que Meta acepte el nombre visible «Bake Brothers» (el nombre legal lleva «Baker», con «r»). Depende de: (a) que Javier confirme que la razón social del portafolio es BAKER BROTHERS E.I.R.L.; (b) si el RUC va en el pie o solo en la política. Es un cambio de landing: va directo a `main` cuando lo apruebe, verificando en el sitio publicado.
2. **Migración 0060 (códigos de Mifact por empresa):** columna `emisor` obligatoria (`baker_brothers` / `hermanos_loarte`); las 80 filas actuales de `mifact_codigos` pasan a `hermanos_loarte`; índices únicos nuevos por emisor+código, emisor+producto+almacén y emisor+tamaño+almacén y **recién después** quitar los tres viejos; el servicio filtra por emisor; el importador pregunta «¿De qué empresa es este Excel?». Orden: migración → Redeploy de la API → encender `VITE_MIFACT_IMPORTADOR`. Necesita OK explícito antes de tocar la base real. Hasta que se use el importador no hace falta.
3. **Pruebas con Claude real** (32 conversaciones de `apps/api/test/fixtures/conversaciones/`, `cerebro.test.ts`, `cerebroTamano`, `capturaPagoReal`, `cerebroAgotadoLocal`) y **evaluar Haiku** (`docs/cambio-a-haiku.md`; variables `BOT_MODELO` y `BOT_MODELO_CAPTURAS`): esperan **saldo de Anthropic** (clave nueva, revocar la anterior). El comportamiento del prompt (regla 10, 11, 13 etc.) no se ha probado con el modelo real tras los últimos cambios; lo que hace cumplir el servidor sí está probado.

### 5.2 PRIORIDAD SIGUIENTE — migración del número de WhatsApp a la API de Meta
Plan completo en `docs/migracion-numero.md` (parte 1: qué crea el dueño en Meta, 11 pasos; parte 2: qué hace Claude; checklist de la noche; cómo volver atrás). **Portafolio comercial NUEVO** (el anterior fue hackeado). Decidido: razón social **BAKER BROTHERS E.I.R.L.**, nombre visible **«Bake Brothers»**; un solo número para los dos locales; el bot arranca **apagado**.
Bloqueos, en orden:
1. **El dueño averigua si el número estuvo en el portafolio hackeado** y avisa. Con eso se elige: noche normal / liberarlo uno mismo / caso con soporte de Meta (sin borrar la cuenta del celular) / **plan B: número nuevo solo para el bot**. El documento trae 6 formas de detectarlo y una prueba en seco en la WABA nueva.
2. **Javier confirma** que el portafolio va a nombre de la E.I.R.L.
3. El dueño crea el portafolio, verifica el negocio (documentos: ficha RUC/SUNAT, comprobante de dirección), la app, el método de pago y el **usuario del sistema con token que no vence** (el token nunca se pega en el chat: va por terminal/gestor).
4. Variables en Coolify: `META_APP_SECRET` (de la app NUEVA), `META_VERIFY_TOKEN` (**cambiarlo**), `WHATSAPP_TOKEN_ENCRYPTION_KEY` (ya cargada), `DATOS_PAGO` (ya cargada); Redeploy; apuntar el webhook de la app a `https://api.bake-brothers.com/webhook`.
5. Registrar el número: `pnpm whatsapp:alta -- --bot --waba <id> --phone <id>` (register + subscribed_apps + registro en Bake OS; token y PIN por terminal; `--simular` y `--solo-meta` para ensayar).
6. **Crear en Meta las plantillas** (`docs/plantillas-whatsapp.json` es la fuente; `.md` generado): 9 esenciales (`pedido_confirmado`, `pago_confirmado`, `pago_pendiente`, `envio_cotizado`, `pedido_listo_para_recoger`, `pedido_en_camino`, `recordatorio_entrega`, `seguimiento_consulta`, `pedido_entregado`) y 3 opcionales. Hoy se envían **a mano** desde Conversaciones («Elegir una plantilla»); las lee de Meta, no están escritas en el panel.
7. Primer envío real de plantilla y primera respuesta desde el panel se prueban esa noche (nunca se han probado contra Meta real).
Mientras tanto: **no se toca nada del webhook ni de la conexión con Meta.**

### 5.3 Verificaciones que me tocan cuando el dueño avise
- **BB-2500 y BB-2501:** cuando diga que pulsó «Actualizar estado» (o la actualización automática de cada 30 min ya las pasó), comprobar **en la base, solo lectura**, que `comprobantes.estado = 'aceptado'` y `estado_codigo = 102`, y revisar `sunat_*`. Si salen 103 (observaciones) o 104 (rechazado), diagnosticar con la descripción de SUNAT. **No anular las boletas** hasta que Mifact explique cómo se anula una boleta bajo el resumen diario.
- En el panel real (necesita sesión del dueño): que la alerta de boletas sin respuesta no aparezca hoy (solo tienen un día), que el login a `dashboard.bakebrothers.pe` siga funcionando y que «Nuevo pedido» muestre Efectivo al marcar «Pagado».

### 5.4 Esperando a terceros
**Mifact:** código de establecimiento (anexo) de **Santa Marina** (variable `MIFACT_BAKER_BROTHERS_CODIGO_ANEXO_SANTA_MARINA`, ya soportada en código); que la plantilla de PDF de Baker Brothers use la de Hermanos Loarte (la de Baker Brothers imprime «VALOR UNIT.» = precio con IGV; la otra «IMPORTE (Inc. IGV)», más clara); cómo se anula una boleta con resumen diario; archivo de productos de Baker Brothers (Santa Marina; hoy los códigos cargados son de Cedros); los domicilios fiscales de ambos emisores quedaron según la consulta pública de SUNAT, sin confirmar con Mifact.
**Javier:** razón social del portafolio; precios de mayoristas; corrección de los precios de Mifact de Santa Marina (valen los de Cedros); si Santa Marina tiene precios distintos en realidad.
**Cliente / dueño:**
- Revisar el **texto de cookies** de la política de privacidad (es borrador legal).
- Configurar en **GTM** el activador «Evento personalizado = `whatsapp_click`» y la etiqueta de evento GA4 con el parámetro `producto`, marcarlo evento clave en GA4 y comprobar Tiempo real; activar en el flujo de GA4 «Cambios de página según el historial del navegador» (la web es SPA).
- **Mayoristas con teléfono:** 74 sin teléfono (las dos «TIENDA CEDROS / S. MARINA» son internas y no lo necesitan). Se cargan sin pisar nada.
- Marcar **«Encargado»** a `caja.cedros` y `caja.santamarina` cuando existan (permite porcionar): interruptor al crearlas en Equipo, o `update usuarios_dashboard set es_encargado = true where usuario in (...)`.
- **Precios internos de Unidades** (lista vacía; se sabe empanada S/ 3 y alfajor S/ 8 para Calle, sin cargar; se cargan en Unidades → Precios).
- **Excel del catálogo** (`Catalogo_Bake_Brothers_para_revision.xlsx`): qué se vende hoy y precios actuales; de ahí salen los **17 productos** que no existen en el catálogo, las **16 diferencias**, los **11** que no están en su Excel de operaciones y la decisión de crear la familia **Helados** (hoy en «Bebidas»).
- **Fotos:** unos 24 productos sin foto; Milhojas con crema pastelera (no tiene producto); la **foto oficial del Cuchareable de alfajor** ya está lista en `BakeBrothers-datos-privados\fotos-para-subir\` y la **sube el dueño** desde Catálogo → Cuchareable → hacerla principal.
- **Search Console:** enviar el sitemap `https://www.bakebrothers.pe/sitemap.xml` en la propiedad nueva, usar «Cambio de dirección» desde `bake-brothers.com`, y pasar ejemplos de las 179 URL «bloqueadas por robots.txt», 144 con redirección y 4 con 404 (el Excel de cobertura solo trae conteos).
- **Equipo:** confirmar que ya se crearon las cuentas reales desde la pantalla Equipo (Sara con `sara.leon@bakebrothers.pe`, administración; Caja Santa Marina con `cajasantamarina@gmail.com`; las demás son usuario + contraseña creados por nosotros y no necesitan correo) y, hecho eso, **borrar la cuenta de prueba «Prueba Cedros»** (SQL de borrado en `CLAUDE.md`, sección «Cuenta de empleado de PRUEBA») y pasar `adminalameda` y `adminsantamaria` fuera de `empleado_temporal`.
- Plan de **Supabase**: el gratuito se pausa por inactividad y no tiene copias automáticas; decidir plan.

### 5.5 Trabajo técnico por hacer (orden aproximado)
1. **Plantillas de WhatsApp automáticas por disparadores** (confirmación, pago, listo, en camino, entregado, recordatorio, reseña): hoy solo manual.
2. **ManyChat / Instagram y Facebook** y links de campaña con atribución (los eventos crudos de Messenger/Instagram ya se guardan en `eventos_meta_sin_procesar`; falta el parser real; la rama `feature/respuestas-automaticas-instagram` con la 0052 está sin mergear).
3. **Emisión automática de comprobantes** al confirmar el pago (hoy es manual) y, si el contador lo pide, política para reutilizar números rechazados por validación.
4. **Alertas y avisos extra opcionales:** más avisos push (hoy: mensajes, pedidos nuevos, órdenes, pagos reportados).
5. **Limpieza y deuda:**
   - Cambiar el login real `adminbake@bake-brothers.com` por un correo del dominio nuevo (es un usuario de Supabase Auth: cambiarlo con cuidado y OK).
   - Quitar `http://localhost:5174/**` de Redirect URLs de Supabase Auth y probar «Define tu contraseña» con un enlace real a `dashboard.bakebrothers.pe`; configurar SMTP propio (Resend) en Supabase antes de invitar a más gente.
   - El catálogo público `GET /api/products` aún muestra `products.disponible` sin mirar el stock por sede.
   - `apps/web/src/components/DatePicker.jsx` y `pages/Catering.jsx` (tienda vieja, no enrutados) usan el huso del dispositivo: si algún día se reactivan, pasarlos a `zonaLima`.
   - La columna de texto `sedes.horario` está en desuso (nada la lee): se puede borrar en una migración posterior.
   - La pantalla Stock muestra y levanta la fila de «producto entero» agotada (hecho), pero no la crea.
   - Quitar el registro huérfano `.git/worktrees/bb-main-check` (falta permiso).
   - El repo es **público** hasta después del lanzamiento: luego pasa a privado (comprobar que Coolify y Vercel conservan acceso; Coolify pasa a GitHub App).
   - Dos vulnerabilidades moderadas conocidas sin arreglar a propósito (`react-router` open redirect/SSR no usado; `vitest` path traversal solo dev): requieren majors.
6. **Etapa 5 de Órdenes:** ya integrada; ajustes finos según el uso real del equipo (hoja única del día en PDF, mayoristas, Rappi).
7. **Mejora futura:** formulario de contacto con Resend (decidido NO construirlo por ahora).

## 6. Cómo trabajar en esta máquina / otro equipo

- `pnpm` no funciona en el equipo original: usar `npx vitest`, `npx vite build`, `npx tsc`, `npx tsx`. Reconstruir el dominio (`npx tsc -p .` dentro de `packages/domain`) antes de compilar el panel.
- **Pruebas de API:** Docker Desktop → contenedor `bb-pg-sim` (puerto 55432, contraseña local `bbtest_local`), base local `bb_estado_auto` con las migraciones hasta la 0059; `DATABASE_URL=postgres://postgres:bbtest_local@localhost:55432/bb_estado_auto`. En una base local limpia se omiten 0010 y 0015 (necesitan pgvector). Los archivos de test corren **en secuencia** y **nunca dos suites a la vez** (comparten la base). Nunca apuntar a Supabase real.
- **No viaja con git:** claves y variables (viven en Coolify/Vercel; claves generadas en `BakeBrothers-datos-privados\claves-para-coolify.txt`), la carpeta `C:\Users\MathiasVasquez\Desktop\BakeBrothers-datos-privados\` (clientes, hojas impresas, respaldos, Excel de Mifact y SQL de carga — **nunca al repo**), contraseñas (gestor), autorización de los conectores de Supabase y Vercel, y la memoria local de Claude Code (sus 3 reglas ya están arriba).
- Verificar producción antes de tocar nada: `GET https://api.bake-brothers.com/health` vs `git rev-parse --short HEAD`.
- El Browser pane no avanza animaciones salvo que una captura fuerce los fotogramas; en él `document.hidden` y `document.hasFocus()` pueden dar valores raros (no reproducible por un usuario real).

## 7. Errores míos ya corregidos (no repetirlos)

- Dije que los códigos de Mifact viajaban en las líneas de los comprobantes: **falso** (`COD_ITEM` sale del `slug`, truncado a 30 caracteres; dos slugs de sándwiches triples lo exceden).
- Dije que Control Tower servía al personal local: **falso**, era solo de Administración.
- Un arnés de prueba redirigió mal una importación y el Catálogo pegó contra el Supabase real (corregido; arnés borrado).
- Pruebas con la hora del día fallaban pasadas las 8 p. m.: fijar la hora en los tests.
- Usé `drop table` en una base **local** de evidencias (rompe la regla fija): usar siempre `ALTER` o base nueva.
- Afirmé que había pedidos viejos con Yape que no existían (solo había 2 pedidos reales).

## 8. Mapa de documentos del repo

| Archivo | Para qué |
|---|---|
| `CLAUDE.md` | Registro detallado de todo (decisiones, bugs, verificaciones, SQL de apoyo). Buscar con Grep por tema. |
| `docs/CONTEXTO-Y-PENDIENTES.md` | Este archivo: visión completa + pendientes. |
| `docs/estado-del-proyecto-2026-11-26.md` | Resumen del último tramo y traspaso a otro dispositivo. |
| `docs/migracion-numero.md` | Plan paso a paso de la migración del número de WhatsApp (portafolio nuevo, caso del portafolio hackeado, plan B, vuelta atrás). |
| `docs/salida-produccion.md` | Variables y orden de la salida a producción. |
| `docs/perfiles-equipo.md` | Perfiles, cuentas del equipo y permisos. |
| `docs/cambio-a-haiku.md` | Cómo pasar el bot a Haiku y qué volver a probar. |
| `docs/plantillas-whatsapp.json` / `.md` | Plantillas a crear en Meta. |
| `docs/precios-mifact-vs-catalogo.md` | Comparación de precios con Mifact. |
| `apps/api/.env.example` | Variables de la API (sin valores). |

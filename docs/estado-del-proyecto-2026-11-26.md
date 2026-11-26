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

**Estado de producción hoy (verificado el 2026-11-26):** `main` = `766827d`; `https://api.bake-brothers.com/health` responde `{"ok":true,"commit":"766827d"}`; el panel en Vercel está READY en ese mismo commit. En el Supabase real están aplicadas las migraciones 0001→0051 y 0053→0059 (la 0052 pertenece a una rama de respuestas automáticas de Instagram que no se ha mergeado).

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
2. **Aprobado por el dueño, hecho en la rama `feature/alerta-boletas-y-avisos-pedidos` (sin mergear, espera su OK):** alerta en el Resumen para boletas con más de 2 días sin respuesta (nueva ruta `GET /api/dashboard/comprobantes/sin-respuesta`, solo Administración) y avisos de pedido nuevo del bot de **cualquier día** (antes solo los de hoy; los avisos de «orden nueva» y «pago reportado» ya existían y respetan `avisa_ordenes` / `avisa_pagos`), con arreglo de la etiqueta del push para que un pedido o un pago no reemplace la notificación del mensaje de su conversación. **Pendiente de confirmar con el dueño antes de tocar nada:** limpieza de dominios viejos en CORS.
3. **Plantillas de WhatsApp** automáticas por disparadores (hoy se mandan a mano desde Conversaciones); **ManyChat / Instagram y Facebook** y links de campaña (fase siguiente); formulario de contacto con Resend (decidido: no se construye por ahora).
4. **PRIORIDAD SIGUIENTE — migración del número de WhatsApp** al API de Meta, ahora con un **portafolio comercial nuevo** (el anterior fue hackeado): `docs/migracion-numero.md` se reescribió el 26-nov con qué crea el dueño en Meta y en qué orden, qué hace Claude Code y la checklist de la noche. **En espera** (hasta que haya saldo de Anthropic): las 32 conversaciones de prueba con Claude real y evaluar Haiku (`docs/cambio-a-haiku.md`); el bot arranca **apagado** y el equipo atiende a mano.
5. **Limpieza:** retirar de CORS los dominios viejos; cambiar el login `adminbake@bake-brothers.com` por un correo del dominio nuevo (cuidado: es un usuario real de Supabase Auth); quitar `http://localhost:5174/**` de Redirect URLs de Supabase; el catálogo público `GET /api/products` no mira el stock por sede; el repo pasará a privado después del lanzamiento (comprobar acceso de Coolify y Vercel); decidir plan de Supabase (el gratuito se pausa y no tiene copias automáticas).

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

# Salida a producción — pasos exactos (Etapa 8)

Documento para el día de la salida. **Ninguna línea de este archivo lleva valores secretos**: solo los nombres de las variables.
Rama de trabajo: `release/produccion`. Nada de esto se ejecuta sin que Mathias lo confirme paso a paso.

> **Prioridad:** la migración del número de WhatsApp (`docs/migracion-numero.md`). Este documento no la reemplaza: la
> salida del código va **antes** (el webhook debe estar listo cuando se apunte el número).

---

## 1. Variables, en tres momentos (solo nombres, sin valores)

**La API arranca y funciona en producción con solo `DATABASE_URL`.** Lo que falta en los momentos 2 y 3 apaga una función, no tumba nada, y
el log de arranque de Coolify dice qué falta y qué pasa mientras tanto (líneas «Sin …»). Comprobado arrancando `node dist/server.js` con
`NODE_ENV=production` y solo `DATABASE_URL`: `/health` 200, verificación del webhook responde, `POST /webhook` 503 (esperado), productos y
categorías 200, rutas del panel 401 sin sesión. Prueba automática: `apps/api/test/arranqueSinVariables.test.ts`.
*(Hasta el 2026-11-13 la falta de `WHATSAPP_TOKEN_ENCRYPTION_KEY` tumbaba el arranque en producción; se corrigió.)*

| Mientras falte… | Qué pasa |
|---|---|
| `META_APP_SECRET` (momento 2) | `POST /webhook` responde 503: ningún mensaje de WhatsApp entra (no hay nada apuntando todavía). El resto funciona. |
| `WHATSAPP_TOKEN_ENCRYPTION_KEY` (momento 2) | No se puede conectar ningún número (no hay dónde guardar su token). Responder desde el panel a una conversación sin número conectado devuelve un error claro; nada se cae. |
| `DATOS_PAGO` (momento 3) | El bot (cuando se encienda) **no inventa** datos de cobro: registra el pedido y pasa el pago a una persona. Probado en `reglasLanzamiento.test.ts`. |
| `ANTHROPIC_API_KEY` / bot apagado | Con el bot apagado (como arranca) no se llama al modelo: cada mensaje queda «Esperando persona». |
| `VAPID_*` | No llegan notificaciones al celular; la campana y el centro de avisos del panel sí funcionan. |

### Momento 1 — Hoy (con el deploy del código)

**Qué debería estar ya cargado** (de lo desplegado hasta ahora; Claude Code no puede ver Coolify ni Vercel: **confírmalo mirando el panel**):

| Dónde | Variable | Estado esperado |
|---|---|---|
| Coolify | `DATABASE_URL` | Ya cargada (rol `app_api` del Supabase real). No tocar. |
| Coolify | `ANTHROPIC_API_KEY` | Ya cargada (la clave de pruebas de octubre). Se puede dejar: con el bot apagado no se usa. Se reemplaza cuando haya saldo (momento «Encendido», abajo). |
| Coolify | `VOYAGE_API_KEY` | **No hace falta hoy**: `bot/rag.ts` (búsqueda semántica) todavía no está conectado al bot en ejecución; solo lo usan scripts/pruebas. Si algún día se conecta, habrá que cargarla. |
| Coolify | `ADMIN_KEY` | **Obsoleta**: la ruta que la usaba se retiró (2026-09-24). Si sigue cargada, se puede borrar; no hace nada. |
| Coolify | `META_VERIFY_TOKEN` | Probablemente **no** (se generó en septiembre y no se cargó). Sin ella vale el valor por defecto `cambiame`: se reemplaza en el momento 2. |
| Coolify | `DEFAULT_TENANT_SLUG`, `PORT`, `NODE_ENV` | Opcionales; `NODE_ENV=production` lo fija el Dockerfile. |
| Coolify | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | **Casi seguro NO están cargadas**: las notificaciones push solo existen en esta rama (nunca se desplegaron), así que hoy no pueden estar funcionando. Son **nuevas**. |
| Vercel (landing y panel) | variables | Ninguna obligatoria (los valores reales vienen por defecto en el código). |

**Qué cargar/cambiar hoy:**

| Dónde | Acción |
|---|---|
| Coolify | **Branch → `main`** (no es variable; antes del Deploy). |
| Coolify | **`VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`**: generarlas **una sola vez** con `pnpm --filter @bakebrothers/api vapid:generar` y pegarlas en Coolify (la privada no se guarda en el repo ni se manda por chat). No dependen de Meta: sirven para probar los avisos hoy. |
| Coolify | **`VAPID_SUBJECT` = `https://dashboard.bakebrothers.pe`** (nueva o actualizada). |
| Coolify | `BOT_MODELO`, `BOT_MODELO_CAPTURAS`: **dejar vacías** (Sonnet, lo probado). |
| Vercel `bake-brothers` | Dominios: `www.bakebrothers.pe` principal; `bakebrothers.pe`, `bake-brothers.com` y `www.bake-brothers.com` redirigen a `www.bakebrothers.pe`. |
| Vercel `bake-brothers-admin` | Dominio `dashboard.bakebrothers.pe` (puede seguir `dashboard.bake-brothers.com` durante la transición). **No definir** `VITE_MIFACT_ACTIVO`. |
| Supabase | Migraciones 0001→0045 **ya aplicadas**. Authentication → URL Configuration: `https://dashboard.bakebrothers.pe` en Site URL y Redirect URLs (hecho); **quitar `http://localhost:5174/**` después del deploy** (paso E.9). |
| Coolify | Si siguen cargadas, **borrar** `SEDE_DELIVERY` y `META_WHATSAPP_TOKEN` (ya no existen). |

### Momento 2 — Migración del número (mañana en la noche)

| Dónde | Variable / acción | Notas |
|---|---|---|
| Coolify | **`META_APP_SECRET`** (nueva) | Del app de Meta. Sin ella el webhook responde 503. **Cargarla ANTES de apuntar el webhook.** |
| Coolify | **`META_VERIFY_TOKEN`** (nueva, valor real) | El mismo texto que se pega en el webhook de Meta. |
| Coolify | **`WHATSAPP_TOKEN_ENCRYPTION_KEY`** (nueva, 32 bytes en hex) | Cifra el token de cada número. **Respaldarla fuera del repo**: si se pierde hay que reconectar cada número. *Es una clave aleatoria que no depende de Meta: se puede generar y cargar antes si quieres llegar a la noche con un paso menos.* |
| Coolify | **Redeploy** | Coolify no aplica variables nuevas hasta el Deploy. |
| Terminal (no Coolify) | **Token de WhatsApp** | No es una variable de Coolify: se registra cifrado en la base con `pnpm whatsapp:alta -- --bot --waba <id> --phone <id>` (token y PIN por terminal, nunca por argumento). |
| Meta | Webhook | URL `https://api.bake-brothers.com/webhook`, mismo `META_VERIFY_TOKEN`, campo **messages**; política de privacidad `https://www.bakebrothers.pe/privacidad`; las 9 plantillas esenciales (`docs/plantillas-whatsapp.md`); modo Live. Detalle: `docs/migracion-numero.md`. |

### Momento 3 — Cuando responda el cliente

| Dónde | Variable | Notas |
|---|---|---|
| Coolify | **`DATOS_PAGO`** (nueva) | Yape / cuentas / CCI en una sola línea de texto. Después, Redeploy. Hasta entonces el bot pasa los cobros a una persona. |
| Coolify | `DISTRITOS_DELIVERY` (opcional) | Solo si el cliente cambia la lista de distritos (el valor por defecto ya es el de la ficha). |

### Aparte — Encendido del bot (cuando haya saldo en Anthropic; no depende del cliente)
`ANTHROPIC_API_KEY` **nueva** (revocar la de pruebas) y Redeploy; luego `docs/encendido-bot.md`.

---

## 2. Orden exacto (cada paso espera el OK del anterior)

**A. Base de datos (antes de tocar el código en producción)**
1. Respaldo lógico del Supabase real (ya hay uno del 2026-11-12; repetirlo si pasaron días con datos nuevos).
2. SQL Editor → pegar y ejecutar `0045_clientes_telefono_unico.sql`. Verificar: `select count(*) from information_schema.columns where table_name='customers' and column_name in ('es_interno','nombre_confirmado');` → `2`.
3. SQL Editor → ejecutar `importar_mayoristas_real.sql`. La última consulta debe dar `83 | 2 | 59 | 24 | 0`.
4. Avisar a Claude Code: registra la 0045 en el historial de migraciones de Supabase (sin reejecutarla) y deja las tablas verificadas.

**B. Código (merge a `main`)** — `release/produccion` está 18 commits adelante de `main` y `main` no tiene nada que ella no tenga, así que el merge es un *fast-forward* (sin conflictos).
```bash
git checkout release/produccion && git status        # sin cambios sin guardar (los archivos sueltos de imagenes/ no se agregan)
git push origin release/produccion                   # copia de seguridad de la rama en GitHub
git checkout main && git pull --ff-only origin main
git merge --ff-only release/produccion
git push origin main                                 # Vercel construye la landing y el panel solo
```
Nunca `git add -A`. Si `--ff-only` falla, **no forzar**: significa que `main` avanzó; avisar.

**C. Vercel** — esperar los dos deploys en verde (`bake-brothers` y `bake-brothers-admin`). Confirmar los dominios nuevos (sección 1) **antes** de avisar al equipo.

**D. Coolify (API)** — repo privado: confirmar que la app usa una fuente con acceso (GitHub App / Deploy Key). Luego:
1. Branch → `main`.
2. Cargar/cambiar las variables de la sección 1 (Coolify no las aplica hasta el Deploy).
3. **Redeploy**. Esperar el healthcheck.

**E. Qué probar justo después (en producción, en este orden)**
1. `https://api.bake-brothers.com/health` responde `ok`; en el log de arranque aparece la línea **«Modelos de Claude del bot»** y las líneas **«Sin …»** de lo que falta (esperadas hoy: `META_APP_SECRET`, `WHATSAPP_TOKEN_ENCRYPTION_KEY`, `DATOS_PAGO`; y `VAPID_*` / `ANTHROPIC_API_KEY` si aún no las cargaste). **No** debe haber ningún error que impida arrancar.
2. `GET https://api.bake-brothers.com/webhook?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=123` devuelve `123`.
3. Landing: `https://www.bakebrothers.pe` carga; `bakebrothers.pe` y `bake-brothers.com` redirigen a `www`; `/menu` y `/locales` abren recargando; `/sitemap.xml` y `/robots.txt` responden; un botón de pedido abre WhatsApp con el mensaje escrito.
4. Panel (`https://dashboard.bakebrothers.pe`): entrar con las **3 cuentas** (admin y una de cada local). Admin ve todas las secciones; el empleado solo Pedidos, Órdenes, Conversaciones, Stock, Ajustes y Avisos. Sin errores rojos en la consola del navegador.
5. Admin → **Clientes**: 83 mayoristas, con «Mayorista · Grande/Mediana», «Sin teléfono» y la etiqueta **Interno** en TIENDA CEDROS y TIENDA S. MARINA; el contador de clientes no cuenta los internos.
6. Admin → **Métricas** y **Resumen**: cargan sin error (las funciones nuevas de la 0045) y muestran 0 ventas (no hay pedidos).
7. **Catálogo / Stock / Nuevo pedido**: las fotos cargan (URL de Supabase Storage).
8. **Nuevo pedido** de prueba (recojo, pago al recoger) → aparece en Pedidos y llega a Producción → **anularlo** después (contará como BB-2500, es normal). Confirma que CORS del panel nuevo funciona.
9. **(OBLIGATORIO) Pantalla «Define tu contraseña» con un enlace real al dominio de producción**, y limpiar la configuración temporal de Auth:
   1. Supabase → Authentication → URL Configuration → **quitar `http://localhost:5174/**` de Redirect URLs** (se agregó solo para la revisión del rol empleado antes del deploy). Debe quedar `https://dashboard.bakebrothers.pe` como Site URL y en Redirect URLs.
   2. Enviar una recuperación a la cuenta de prueba (la cuenta de prueba de Cedros) **con destino `https://dashboard.bakebrothers.pe/`** (Supabase → Authentication → Users → ⋯ → *Send password recovery*, o `POST /auth/v1/recover?redirect_to=https%3A%2F%2Fdashboard.bakebrothers.pe%2F` con la clave pública).
   3. Abrir el enlace del correo: la dirección del correo y la de destino deben ser `dashboard.bakebrothers.pe`, y debe aparecer **«Define tu contraseña»** (no entrar directo al panel). Probar: menos de 10 caracteres → error; contraseñas distintas → error; correcta → entra a Pedidos como empleado de Cedros. Cerrar sesión y volver a entrar con la contraseña nueva.
   4. Un enlace ya usado o vencido debe llevar al login normal (sin pantalla en blanco).
   Esta es la misma pantalla que usará el equipo real: si falla, **no se invita a nadie** hasta corregirla.
10. **Ajustes → Avisos en este celular → Enviar aviso de prueba** con el celular bloqueado.
11. Con el **bot apagado**, escribir al número desde tu celular: aparece en Conversaciones como «Esperando persona», llega el aviso, se crea el cliente enlazado y puedes responder desde el panel.
12. Recién entonces, plantillas aprobadas y, si hay saldo, el checklist de `docs/encendido-bot.md`.

**F. Si algo sale mal (volver atrás)**
- *Panel o landing:* Vercel → proyecto → Deployments → deploy anterior → **Promote / Rollback** (instantáneo).
- *API:* Coolify → app → Deployments → redeployar la versión anterior. El código nuevo es compatible con la base ya migrada.
- *Bot:* **Ajustes → Bot activo → apagar** (sin redeploy; todo queda como «Esperando persona»).
- *Base:* las migraciones 0039–0045 solo **agregan** (columnas, tablas, políticas, funciones): el código anterior sigue funcionando con ellas. No se revierten salvo orden expresa.

---

## 3. Aviso para el equipo (copiar y pegar)

> **Bake OS cambia de dirección.** Desde hoy el panel es **https://dashboard.bakebrothers.pe**.
> Para seguir recibiendo avisos de mensajes y pedidos cada persona debe hacer esto **una vez en su celular**:
> 1. Abrir el panel nuevo e **iniciar sesión** otra vez (la sesión de la dirección anterior no pasa sola).
> 2. **Reinstalar el panel**: si lo tenías como ícono en la pantalla de inicio, bórralo y vuelve a instalarlo desde la dirección nueva
>    (Android/Chrome: menú ⋮ → *Instalar app*. iPhone/Safari: Compartir → *Añadir a pantalla de inicio*).
> 3. Entrar a **Ajustes → Avisos en este celular → Activar** y tocar **«Enviar aviso de prueba»** con el celular bloqueado. Si no llega, avisa.
> Los avisos de la dirección anterior dejan de funcionar. Los pedidos y conversaciones no se pierden: están en la misma base.

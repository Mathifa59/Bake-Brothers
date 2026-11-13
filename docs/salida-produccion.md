# Salida a producción — pasos exactos (Etapa 8)

Documento para el día de la salida. **Ninguna línea de este archivo lleva valores secretos**: solo los nombres de las variables.
Rama de trabajo: `release/produccion`. Nada de esto se ejecuta sin que Mathias lo confirme paso a paso.

> **Prioridad:** la migración del número de WhatsApp (`docs/migracion-numero.md`). Este documento no la reemplaza: la
> salida del código va **antes** (el webhook debe estar listo cuando se apunte el número).

---

## 1. Variables a cambiar (solo nombres, sin valores)

### Coolify — app `apps/api` (`https://api.bake-brothers.com`)

| Variable | Acción | Para qué / notas |
|---|---|---|
| **Branch** (no es variable) | Cambiar a `main` | Hoy despliega una rama de trabajo. Hacerlo **antes** del Deploy. |
| `DATABASE_URL` | Ya existe — no tocar | Rol `app_api` del Supabase real. |
| `ANTHROPIC_API_KEY` | **Crear la clave nueva** y reemplazar | Cuando haya saldo (`docs/encendido-bot.md`). Revocar la anterior de pruebas. Sin saldo el bot sigue apagado y no la usa. |
| `VOYAGE_API_KEY` | Verificar que exista | Búsqueda semántica (RAG) del bot. |
| `META_APP_SECRET` | **Crear** | Obligatoria en producción: sin ella `POST /webhook` responde 503. Firma de Meta. |
| `META_VERIFY_TOKEN` | **Crear / reemplazar** | El valor real que se pega en el webhook de la app de Meta (por defecto es `cambiame`). |
| `WHATSAPP_TOKEN_ENCRYPTION_KEY` | **Crear** (32 bytes en hex) | **Obligatoria**: sin ella la API no arranca. Respaldarla fuera del repo: si se pierde, hay que reconectar cada número. |
| `DATOS_PAGO` | **Crear** | Yape / cuentas / CCI en una línea. Sin ella el bot no inventa los datos: registra el pedido y deriva a una persona. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | **Crear** (una sola vez) | `pnpm --filter @bakebrothers/api vapid:generar`. Sin ellas no llegan notificaciones al celular (la campana sí funciona). |
| `VAPID_SUBJECT` | **Crear / cambiar** a la URL del panel nuevo | Debe ser `https://dashboard.bakebrothers.pe`. |
| `BOT_MODELO`, `BOT_MODELO_CAPTURAS` | **Dejar vacías** | Vacío = Sonnet (lo probado). Haiku se evalúa después (`docs/cambio-a-haiku.md`). |
| `DISTRITOS_DELIVERY` | Opcional | Por defecto ya trae la lista de la ficha. |
| `META_GRAPH_VERSION`, `AUTO_RETORNO_BOT_HORAS`, `DEFAULT_TENANT_SLUG`, `PORT` | Opcionales | Los valores por defecto sirven. |
| `NODE_ENV` | Debe ser `production` | Lo fija el Dockerfile; confirmarlo en el log de arranque. |
| ~~`SEDE_DELIVERY`~~, ~~`META_WHATSAPP_TOKEN`~~ | **Ya no existen** | Si siguen cargadas, borrarlas (no hacen nada). |

### Vercel — proyecto `bake-brothers` (landing)

| Qué | Acción |
|---|---|
| **Dominios** | Agregar `www.bakebrothers.pe` como **principal**; `bakebrothers.pe` y `bake-brothers.com` (y `www.bake-brothers.com`) como **redirección** a `www.bakebrothers.pe`. |
| Variables | Ninguna es obligatoria (`VITE_WHATSAPP_NUMBER`, `VITE_INSTAGRAM_URL`, `VITE_FACEBOOK_URL` tienen los valores reales por defecto). `VITE_API_URL` y `VITE_TENANT_SLUG` ya no las usa el sitio publicado. |

### Vercel — proyecto `bake-brothers-admin` (panel)

| Qué | Acción |
|---|---|
| **Dominio** | Agregar `dashboard.bakebrothers.pe` (se puede dejar `dashboard.bake-brothers.com` mientras dure la transición). |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Opcionales: el panel trae los valores del proyecto real por defecto. |
| `VITE_API_URL` | Opcional: por defecto en producción usa `https://api.bake-brothers.com`. |
| `VITE_MIFACT_ACTIVO` | **No definirla** (o `false`): la sección Mifact queda oculta. |
| `VITE_SITIO_URL` | Opcional: por defecto `https://www.bakebrothers.pe` (para fotos antiguas con ruta relativa; ya no quedan). |

### Supabase (proyecto real)

| Qué | Acción |
|---|---|
| Migración **0045** | Aplicar en el SQL Editor (el conector la rechazó). Archivo: `apps/api/migrations/0045_clientes_telefono_unico.sql`. |
| Carga de **83 mayoristas** | Después de la 0045. SQL en la carpeta privada: `importar_mayoristas_real.sql` (termina con una consulta de verificación: `83 \| 2 \| 59 \| 24 \| 0`). |
| Authentication → URL Configuration | Agregar `https://dashboard.bakebrothers.pe` en **Site URL / Redirect URLs** (hoy el login es por contraseña, pero evita sorpresas al recuperar contraseña). |
| Plan | **Revisar el plan free**: se pausa tras 7 días sin actividad y no incluye copias automáticas. Con clientes reales conviene un plan con backups. |

### Meta (WhatsApp) — lo hace Mathias la noche de la migración

URL del webhook `https://api.bake-brothers.com/webhook` (campo **messages**), el mismo `META_VERIFY_TOKEN`, política de privacidad
`https://www.bakebrothers.pe/privacidad`, las 9 plantillas esenciales (`docs/plantillas-whatsapp.md`) y el registro del número del bot
(`pnpm whatsapp:alta -- --bot --waba <id> --phone <id>`). Detalle: `docs/migracion-numero.md`.

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
1. `https://api.bake-brothers.com/health` responde `ok`; en el log de arranque aparece la línea **«Modelos de Claude del bot»** y **no** hay error de `WHATSAPP_TOKEN_ENCRYPTION_KEY`.
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

# Respuestas automáticas de Instagram — cómo se activan

> **Qué hace:** alguien comenta una palabra clave en un reel (por ejemplo **ALFAJOR**) y Bake OS, sin que nadie haga nada,
> (1) responde el comentario en público y (2) le manda un DM con un link corto a WhatsApp. El link abre el chat del bot con
> el mensaje escrito y la campaña (`(ref: ig-alfajor)`); el pedido que salga de ahí queda con esa campaña. Todo se arma y se
> mide en **Bake OS → Respuestas automáticas** (solo dirección). Reemplaza a ManyChat: no hay otra herramienta ni otra
> mensualidad.
>
> Esta guía es para **conectar la cuenta una sola vez**. Después, el equipo solo crea o pausa respuestas desde el panel.
> Cosas de la interfaz de Meta cambian seguido: donde diga *(verificar en pantalla)* confirma el nombre exacto antes de tocar.

---

## Cómo funciona por dentro

```
Comentario «ALFAJOR» ─► Meta ─► POST https://api.bake-brothers.com/webhook (el mismo de WhatsApp)
                                   │  campo «comments» de Instagram
                                   ▼
                     ¿palabra clave de una respuesta ACTIVA? (packages/domain/src/respuestasAutomaticas.ts)
                                   │ sí
          ┌────────────────────────┴─────────────────────────┐
  respuesta pública                                  DM al comentario («private reply»)
  POST /{comment_id}/replies                         POST /{page_id}/messages  { recipient: { comment_id } }
                                                     texto + «👉 Pídelo por WhatsApp: https://www.bakebrothers.pe/w/ig-alfajor»
                                                                   │ la persona toca el link
                                                                   ▼
               www.bakebrothers.pe/w/ig-alfajor ─(rewrite de Vercel)─► API GET /w/ig-alfajor
                                     ─► suma un clic ─► 302 a wa.me con «… (ref: ig-alfajor)»
                                                                   ▼
                                          bot de WhatsApp ─► pedido con orders.campana = 'ig-alfajor'
```

- **Un comentario se atiende una sola vez** (si Meta reintenta, no se repite). **La misma persona no recibe dos veces el DM de
  la misma campaña en 24 h** (sí la respuesta pública). Los comentarios de la propia cuenta se ignoran.
- El DM es la **respuesta privada** de Instagram (*Private Replies*), no un mensaje directo normal: va dirigido al
  comentario (`recipient: { comment_id }`), por eso Meta lo acepta aunque la persona nunca le haya escrito a la cuenta
  (le llega a la bandeja si sigue a la cuenta, o a «solicitudes» si no). Límites de Meta: **una sola por comentario**,
  **dentro de los 7 días** del comentario (Bake OS ni la intenta pasado ese plazo) y **solo texto** (por eso el link va
  en el texto). Si la persona contesta, se abre la ventana normal de 24 h.
- El bot **no conversa por Instagram**: la venta sigue en WhatsApp. Los mensajes directos de Instagram se siguen guardando
  sin procesar (`eventos_meta_sin_procesar`), como antes.
- **Consentimiento:** comentar o recibir el DM **no** es permiso para mandar promociones por WhatsApp. Ese permiso lo sigue
  pidiendo el bot después del primer pedido (`puedeRecibirEnvioMasivo`).

## 1. Antes (cuenta de Instagram)

- [ ] La cuenta **@bakebrothers.pe** es **profesional** (empresa) y está **vinculada a la página de Facebook** de Bake Brothers
      (Instagram → Configuración → Cuenta → Compartir en otras apps / Centro de cuentas *(verificar en pantalla)*).
- [ ] Instagram → Configuración → Mensajes y respuestas a historias → Herramientas conectadas → **Permitir acceso a los
      mensajes** = activado. Sin esto Meta rechaza los DMs.

## 2. App de Meta (la del portafolio de Bake Brothers, la misma del número de WhatsApp)

### Qué permisos usa y cuáles necesitan revisión de Meta

Bake OS usa la variante **«Instagram con inicio de sesión de Facebook»** (token de página / usuario del sistema), que es la
que Meta documenta para las respuestas privadas.

| Para qué | Permisos que pide Meta |
|---|---|
| Recibir el webhook de comentarios (`comments`) | `instagram_basic`, `instagram_manage_comments`, `pages_manage_metadata`, `pages_read_engagement`, `pages_show_list` |
| Responder el comentario en público | `instagram_manage_comments` |
| Respuesta privada (el DM) | `instagram_manage_comments`, `pages_messaging`, la función **Human Agent** y **acceso avanzado** (así lo lista Meta en *Private Replies*) |

**La regla de Meta no es por portafolio, es por persona** (página *Access Levels*):

- **Acceso estándar, sin revisión.** Las apps de tipo *Business* lo tienen automáticamente para todos los permisos, pero
  **solo funciona con personas que tienen un rol en la app** (administradores, desarrolladores, *testers*). Que la app, la
  página y la cuenta de Instagram sean del mismo portafolio permite **configurar todo y probarlo de punta a punta con las
  cuentas del equipo** (dándoles un rol en la app), pero **no responder a clientes**: un cliente que comenta no tiene rol
  en la app.
- **Acceso avanzado, con revisión.** Para que funcione con **cualquier persona que comente**, hay que pedir *Advanced
  Access* en **App Review**, permiso por permiso, y Meta exige además la **verificación del negocio** (el portafolio de
  Bake Brothers ya debería estar verificado por WhatsApp; confirmarlo).

| Permiso / función | Sin revisión (estándar) | Para clientes reales |
|---|---|---|
| `instagram_manage_comments` | Solo comentarios de cuentas con rol en la app | **Revisión de Meta (avanzado)** |
| `pages_messaging` | Solo respuestas privadas a cuentas con rol | **Revisión de Meta (avanzado)** |
| Función **Human Agent** | — | **Revisión de Meta** (la lista Meta para las respuestas privadas) |
| `instagram_basic` | Con rol | Pedirlo en la misma revisión: los datos del comentario (autor) son de alguien sin rol |
| `pages_read_engagement` | Con rol | Pedirlo en la misma revisión (Meta no lo aclara para este caso; mejor no quedarse corto) |
| `pages_show_list`, `pages_manage_metadata` | Alcanza: actúan sobre la página propia, con un usuario que sí tiene rol | No hace falta revisión (Meta no lo dice por permiso; confirmar en el panel de App Review) |

**En la práctica:** primero se configura y se prueba con cuentas del equipo (sin revisión); en paralelo se envía la
revisión de `instagram_manage_comments`, `pages_messaging`, Human Agent (y `instagram_basic` / `pages_read_engagement`)
con un video que muestre el flujo (comentario → respuesta → DM → WhatsApp). **Los tiempos de la revisión los pone Meta.**
Hasta que se apruebe, las respuestas automáticas no llegan a los clientes.

### Pasos

- [ ] **Usuario del sistema** (Configuración del negocio → Usuarios del sistema): asignarle como activos la **página de
      Facebook** y la **cuenta de Instagram**, y generar un **token que no vence** con los permisos de arriba.
      Guardarlo en el gestor de contraseñas. **Nunca en el repo ni en el chat.**
- [ ] **Webhooks** → objeto **Instagram**: URL `https://api.bake-brothers.com/webhook`, el mismo `META_VERIFY_TOKEN` de
      WhatsApp, y **suscribir el campo `comments`** (opcional: `messages`, quedan guardados para más adelante).
- [ ] **Instalar la app en la página** para que lleguen los eventos (una vez, con el token):
      `POST https://graph.facebook.com/v21.0/{PAGE_ID}/subscribed_apps?subscribed_fields=feed` → `{ "success": true }`.
- [ ] **Roles para probar:** dar rol de *tester* (o desarrollador) en la app a 1 o 2 cuentas de Instagram del equipo, que
      son las que van a comentar en la prueba mientras no esté la revisión.
- [ ] **App Review:** pedir acceso avanzado según la tabla de arriba.
- [ ] La app en modo **Live** (ya lo está por WhatsApp).

**Los dos ids que hacen falta:**
- `PAGE_ID`: el de la página de Facebook (Configuración de la página → Información, o `GET /me/accounts` con el token).
- `IG_ID`: `GET https://graph.facebook.com/v21.0/{PAGE_ID}?fields=instagram_business_account` → `instagram_business_account.id`.

> La otra variante de Meta, «Instagram con inicio de sesión de Instagram» (`--tipo instagram_login`), está soportada en el
> código pero **Meta no documenta las respuestas privadas para ella**: no usarla sin probarla antes.

## 3. Bake OS

- [ ] **Migración `0052_respuestas_automaticas_instagram.sql` aplicada al Supabase real** (antes del Redeploy: la API y el
      panel leen sus tablas). Validada en una base local con la cadena 0001→0052 completa.
- [ ] **Redeploy de `apps/api`** en Coolify, **deploy de `apps/admin`** y **deploy de la web** (`apps/web`: el `vercel.json`
      de la raíz trae el rewrite `/w/:referencia` → `https://api.bake-brothers.com/w/:referencia`, que es lo que hace
      funcionar el link corto en `www.bakebrothers.pe`). Variables nuevas, opcionales (tienen el valor correcto por
      defecto): `URL_ENLACES_CORTOS` (API; por defecto `https://www.bakebrothers.pe`), `VITE_URL_ENLACES_CORTOS` (panel,
      solo para la vista previa) y `WHATSAPP_ATENCION` (por defecto el número de atención, `51912944096`).
- [ ] **Comprobar el link corto** después del deploy de la web: `https://www.bakebrothers.pe/w/no-existe` tiene que abrir
      WhatsApp (sin campaña). Si muestra la página de inicio de la web, el rewrite no quedó antes del de la SPA.
- [ ] **Conectar la cuenta** (desde `apps/api`, con `DATABASE_URL` de la base real y `WHATSAPP_TOKEN_ENCRYPTION_KEY` en `.env`):
      ```bash
      INSTAGRAM_TOKEN_A_REGISTRAR=<token> pnpm instagram:registrar -- --ig <IG_ID> --page <PAGE_ID> --usuario bakebrothers.pe
      ```
      El token se guarda cifrado. En el panel, **Respuestas automáticas** pasa a mostrar «Conectado · @bakebrothers.pe».

## 4. Primera prueba

1. Panel → Respuestas automáticas → **Nueva respuesta automática** con una palabra de prueba (ej. `PRUEBABB`).
2. Desde **otra** cuenta de Instagram **con rol de tester en la app** (sin la revisión de Meta, una cuenta sin rol no
   recibe nada), comentar `pruebabb` en cualquier reel de @bakebrothers.pe.
3. En segundos: la respuesta pública bajo el comentario, el DM en la otra cuenta y el comentario en «Actividad» como
   **DM enviado**. Tocar el link: abre WhatsApp con «… (ref: ig-pruebabb)» y la tarjeta suma un clic.
4. Pausar o borrar la respuesta de prueba.

**Si algo falla**, el panel muestra el error de Meta en la tarjeta de la conexión y en «Actividad»:
- `10` / `200` / «permission» → falta un permiso del token, «Permitir acceso a los mensajes» en Instagram, o quien
  comentó no tiene rol en la app y todavía no hay acceso avanzado (revisión de Meta).
- `190` → token inválido o revocado: generar otro y volver a correr `instagram:registrar`.
- No aparece nada en «Actividad» → el comentario no llegó: revisar la suscripción del campo `comments`, el
  `subscribed_apps` de la página y los logs de Coolify (`webhook de Meta recibido`).
- La respuesta pública sale pero el DM no → falta `pages_messaging` / Human Agent / acceso avanzado, o la persona tiene
  los mensajes restringidos. Pasados 7 días del comentario Bake OS no la intenta («Actividad» lo dice).

## 5. Uso diario (equipo de marketing)

- Una palabra = una campaña. Se crea en el panel antes de publicar el reel y se pide al final del video:
  «comenta **ALFAJOR** y te mandamos la promo».
- Los textos siguen las mismas reglas del bot: sin precios fijos, sin prometer stock ni horas exactas, delivery «se cotiza».
- Resultados en la misma pantalla: comentarios, DMs, clics al link, pedidos y ventas de cada campaña (también en Origen de
  clientes → Por campaña).
- Una campaña se **pausa** (deja de responder) sin perder sus números; los links ya enviados siguen funcionando.

## Fase siguiente

- Lo mismo para **comentarios de Facebook** (mismo patrón, webhook `feed` de la página).
- Elegir **un reel específico** para una respuesta (hoy aplica a todas las publicaciones: la palabra clave es la campaña).
- Botón en el DM: la documentación de respuestas privadas de Meta solo muestra texto, por eso el link va en el texto.

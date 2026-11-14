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
                                                     texto + «👉 Pídelo por WhatsApp: https://api.bake-brothers.com/w/ig-alfajor»
                                                                   │ la persona toca el link
                                                                   ▼
                                     GET /w/ig-alfajor ─► suma un clic ─► 302 a wa.me con «… (ref: ig-alfajor)»
                                                                   ▼
                                          bot de WhatsApp ─► pedido con orders.campana = 'ig-alfajor'
```

- **Un comentario se atiende una sola vez** (si Meta reintenta, no se repite). **La misma persona no recibe dos veces el DM de
  la misma campaña en 24 h** (sí la respuesta pública). Los comentarios de la propia cuenta se ignoran.
- Meta permite **un DM por comentario** y solo **dentro de los 7 días** siguientes. Para reels de campaña no es un problema.
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

- [ ] **Permisos** que tiene que tener el token *(los nombres exactos, verificar en pantalla)*:
      `instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages`, `pages_show_list`,
      `pages_read_engagement`, `pages_manage_metadata`, `business_management`.
      Como la app, la página y la cuenta de Instagram son del mismo portafolio, debería alcanzar el **acceso estándar** (sin
      revisión de Meta). Si alguno pide «Acceso avanzado» / revisión, avisar antes de seguir.
- [ ] **Usuario del sistema** (Configuración del negocio → Usuarios del sistema): asignarle como activos la **página de
      Facebook** y la **cuenta de Instagram**, y generar un **token que no vence** con los permisos de arriba.
      Guardarlo en el gestor de contraseñas. **Nunca en el repo ni en el chat.**
- [ ] **Webhooks** → objeto **Instagram**: URL `https://api.bake-brothers.com/webhook`, el mismo `META_VERIFY_TOKEN` de
      WhatsApp, y **suscribir el campo `comments`** (opcional: `messages`, quedan guardados para más adelante).
- [ ] **Instalar la app en la página** para que lleguen los eventos (una vez, con el token):
      `POST https://graph.facebook.com/v21.0/{PAGE_ID}/subscribed_apps?subscribed_fields=feed` → `{ "success": true }`.
- [ ] La app en modo **Live** (ya lo está por WhatsApp).

**Los dos ids que hacen falta:**
- `PAGE_ID`: el de la página de Facebook (Configuración de la página → Información, o `GET /me/accounts` con el token).
- `IG_ID`: `GET https://graph.facebook.com/v21.0/{PAGE_ID}?fields=instagram_business_account` → `instagram_business_account.id`.

## 3. Bake OS

- [ ] **Migración `0052_respuestas_automaticas_instagram.sql` aplicada al Supabase real** (antes del Redeploy: la API y el
      panel leen sus tablas). Validada en una base local con la cadena 0001→0052 completa.
- [ ] **Redeploy de `apps/api`** en Coolify y **deploy de `apps/admin`** (Vercel). Variables nuevas, opcionales (tienen el
      valor correcto por defecto): `URL_PUBLICA_API` (por defecto `https://api.bake-brothers.com`, con ella se arma el link
      corto) y `WHATSAPP_ATENCION` (por defecto el número de atención, `51912944096`).
- [ ] **Conectar la cuenta** (desde `apps/api`, con `DATABASE_URL` de la base real y `WHATSAPP_TOKEN_ENCRYPTION_KEY` en `.env`):
      ```bash
      INSTAGRAM_TOKEN_A_REGISTRAR=<token> pnpm instagram:registrar -- --ig <IG_ID> --page <PAGE_ID> --usuario bakebrothers.pe
      ```
      El token se guarda cifrado. En el panel, **Respuestas automáticas** pasa a mostrar «Conectado · @bakebrothers.pe».

## 4. Primera prueba

1. Panel → Respuestas automáticas → **Nueva respuesta automática** con una palabra de prueba (ej. `PRUEBABB`).
2. Desde **otra** cuenta de Instagram, comentar `pruebabb` en cualquier reel de @bakebrothers.pe.
3. En segundos: la respuesta pública bajo el comentario, el DM en la otra cuenta y el comentario en «Actividad» como
   **DM enviado**. Tocar el link: abre WhatsApp con «… (ref: ig-pruebabb)» y la tarjeta suma un clic.
4. Pausar o borrar la respuesta de prueba.

**Si algo falla**, el panel muestra el error de Meta en la tarjeta de la conexión y en «Actividad»:
- `10` / `200` / «permission» → falta un permiso del token o «Permitir acceso a los mensajes» en Instagram.
- `190` → token inválido o revocado: generar otro y volver a correr `instagram:registrar`.
- No aparece nada en «Actividad» → el comentario no llegó: revisar la suscripción del campo `comments`, el
  `subscribed_apps` de la página y los logs de Coolify (`webhook de Meta recibido`).
- La respuesta pública sale pero el DM no → la ventana de 7 días, o la persona tiene los mensajes restringidos.

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
- Botón en el DM en vez del link en el texto, si Meta lo admite para private replies en esta cuenta.

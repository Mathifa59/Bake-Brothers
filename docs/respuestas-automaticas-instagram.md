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
- [ ] **App Review:** pedir acceso avanzado según la tabla de arriba (paso a paso en la sección 6).
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

## 6. Pasos para la App Review

> Para que las respuestas automáticas lleguen a **cualquier persona que comente** (no solo a las cuentas con rol en la app),
> Meta tiene que aprobar el **acceso avanzado** de `instagram_manage_comments`, `pages_messaging` y la función **Human
> Agent**. Esta sección dice qué preparar, qué mostrar en los videos y qué escribir en cada permiso. Lo marcado
> *(verificar en pantalla)* depende de cómo se vea el formulario de Meta ese día; lo marcado **(no confirmado)** no figura
> en la documentación oficial que se pudo leer. Meta dice que suele decidir **en una semana**, pero los tiempos los pone Meta.

### 6.1 Antes de enviar (si falta algo, Meta rechaza todo el envío)

**Verificación del negocio** (la hace un **administrador del portafolio** en Configuración del negocio → Centro de
seguridad / Verificación del negocio *(verificar en pantalla)*). Meta la exige para cualquier acceso avanzado. El
checklist de `docs/migracion-numero.md` ya la pedía para WhatsApp: si el portafolio **ya está verificado**, este paso está
hecho; confirmarlo en pantalla.

Si todavía no lo está, Meta pide (lista general; la lista oficial de documentos aceptados es **por país** y está en el
artículo de ayuda de Meta *About Business Verification*: revisarla para Perú antes de subir nada):

| Dato | Qué poner |
|---|---|
| Razón social | La **exacta** de la empresa dueña del portafolio (la que figura en el documento que se sube). Bake Brothers tiene dos razones sociales (Corporación Hermanos Loarte S.A.C. y Baker Brothers E.I.R.L.): usar la que sea dueña del portafolio de Meta. |
| Dirección y teléfono | **Idénticos** a como aparecen en el documento (Meta rechaza diferencias parciales). |
| Sitio web | `https://www.bakebrothers.pe`. Conviene **verificar el dominio** en el portafolio (Configuración del negocio → Seguridad de la marca → Dominios, con etiqueta meta o registro DNS TXT) *(verificar en pantalla)*. |
| Correo | Mejor uno con el dominio de la marca (`@bakebrothers.pe`) que uno de Gmail **(no confirmado: lo recomiendan guías de terceros)**. |
| Documento oficial | Uno vigente, no editado, que muestre la razón social **y** la dirección o el teléfono cargados. Para Perú lo esperable es la **Ficha RUC de SUNAT** o la **licencia municipal de funcionamiento**; también se suele aceptar un **extracto bancario de la empresa** **(no confirmado: comprobar en la lista de Meta para Perú)**. **No sirven:** facturas, boletas, capturas de pantalla, impresiones de la web ni documentos vencidos. |

**Configuración de la app** (App Dashboard → Configuración → Básica):
- [ ] Ícono de 1024 × 1024.
- [ ] URL de la política de privacidad: `https://www.bakebrothers.pe/privacidad` (ya existe; conviene que mencione que se
      procesan comentarios y mensajes de Instagram para responderlos).
- [ ] Propósito de la app: **«Tú mismo o tu propia empresa»** (no «Clientes»).
- [ ] Categoría (por ejemplo *Business and Pages* / *Mensajería*) y correo de contacto: los avisos de la revisión llegan ahí.

**Llamadas de prueba:** Meta pide **al menos una llamada exitosa a la API por cada permiso** en los **30 días** previos al
envío. Se cumplen haciendo la prueba de la sección 4 con una cuenta *tester*: el comentario dispara la respuesta pública
(`instagram_manage_comments`) y la respuesta privada (`pages_messaging`). Si hace falta, también desde el Graph API Explorer.

**Pedir solo lo que se usa** (pedir de más es un motivo común de rechazo):

| Pedir acceso avanzado | Por qué |
|---|---|
| `instagram_manage_comments` | Leer el comentario y responderlo en público. |
| `pages_messaging` | Mandar la respuesta privada al comentario. |
| Función **Human Agent** | Meta la lista como requisito de las respuestas privadas (*Private Replies*). Su uso permitido es que **una persona** responda dentro de 7 días cuando algo no se resuelve en la ventana normal. Si el formulario no la exige una vez aprobado `pages_messaging`, **no pedirla** **(no confirmado: depende de lo que muestre el formulario)**. |
| `instagram_basic`, `pages_read_engagement`, `pages_show_list` | Son dependencias de `instagram_manage_comments` según Meta; el formulario las suele agregar solo. |
| `pages_manage_metadata` | Dependencia de `pages_messaging` (y la usa la suscripción de la página al webhook). |

> Ojo: en la tabla de permisos de Meta, las columnas «qué incluir en la revisión» de `instagram_manage_comments` y
> `pages_messaging` tienen textos copiados de otros permisos (hablan de publicar fotos y de anuncios). No seguir esos
> textos: describir el uso real, como abajo.

### 6.2 Cómo van a probar los revisores

Meta prueba la app con **sus propias cuentas** (nunca se les da la contraseña de nadie del equipo) y **rechaza todo el envío
si no puede probarla**. Bake OS no tiene una pantalla pública: lo que el revisor puede probar es Instagram. En
«Verificación de la app» / instrucciones de prueba poner (en inglés):

```
How to test:
1. During the review, the keyword "BAKETEST" is active on our account @bakebrothers.pe.
2. Open any Reel of https://www.instagram.com/bakebrothers.pe/ and comment "BAKETEST".
3. Within a few seconds you will see a public reply under your comment, and a private reply (Private Replies API)
   in your Instagram inbox or Message Requests folder, with a link to order via WhatsApp.
4. Tapping the link opens a WhatsApp chat with our business number, with the message pre-filled.
The management screen (Bake OS, our internal back office) is shown in the screen recordings; it contains customer
data, so no login is shared.
```

Antes de enviar: crear en el panel la respuesta automática **BAKETEST** (activa durante toda la revisión) y probarla desde una
cuenta *tester*.

### 6.3 Qué mostrar en los videos

Reglas de Meta para los videos: **uno por permiso o función** (sin video, ese permiso no se aprueba); en **1080 p** o más,
con el ancho de pantalla en **1440 o menos**; solo la ventana de la app o la pantalla completa; **sin audio** (no lo
escuchan); usar el mouse; si la interfaz no está en inglés, **subtítulos o rótulos en inglés** explicando cada paso;
empezar **sin sesión iniciada** y mostrar el inicio de sesión y la **pantalla donde se conceden los permisos**.

Guion base (el mismo flujo, con el foco en el permiso de cada video):

1. **Conceder permisos:** inicio de sesión con Facebook y la pantalla donde la página y la cuenta de Instagram le dan los
   permisos a la app *(con token de usuario del sistema no hay esta pantalla para el cliente: mostrar la asignación de
   activos y permisos en Configuración del negocio → Usuarios del sistema, verificar en pantalla)*.
2. **Bake OS → Respuestas automáticas:** crear la respuesta con la palabra **BAKETEST** (formulario y vista previa) y mostrarla
   activa.
3. **Instagram (app o web), con otra cuenta:** comentar «TEST» en un reel de @bakebrothers.pe.
4. Se ve la **respuesta pública** bajo el comentario.
5. Se ve la **respuesta privada** en la bandeja (o «Solicitudes») de esa cuenta, con el link.
6. Se toca el link y se abre **WhatsApp** con el mensaje escrito.
7. De vuelta en **Bake OS:** «Actividad» muestra el comentario como **DM enviado** y la tarjeta de la campaña suma
   comentario, DM y clic.

| Video | En qué hacer foco |
|---|---|
| `instagram_manage_comments` | Pasos 2 a 4 y 7: el comentario llega a Bake OS y la app lo **responde en público**; mostrar que la respuesta aparece en la app nativa de Instagram. |
| `pages_messaging` | Pasos 3, 5 y 7: la app **envía** la respuesta privada y la persona la **recibe**. Meta pide ver que el mensaje **sale desde la app** (no capturas del mensaje recibido) y una **petición cURL** del envío: mostrar el `curl` a `POST /{PAGE_ID}/messages` con `recipient.comment_id` (o el *API Integration Helper* del panel de Messenger). |
| Human Agent | El caso de uso: la persona responde a la respuesta privada con una pregunta que el mensaje automático no resuelve y **alguien del equipo** le contesta dentro de los 7 días. **Bake OS hoy no tiene bandeja de Instagram**: si Meta exige demostrarlo con la app, este video no se puede grabar todavía (ver «Fase siguiente»). |

### 6.4 Qué escribir en cada permiso (en inglés, uno distinto para cada uno; Meta pide no copiar y pegar)

**instagram_manage_comments**
```
Bake Brothers is a bakery in Lima, Peru (@bakebrothers.pe). In our Reels we invite followers to comment a keyword
(for example "ALFAJOR") to receive the details of a product. Our internal back office (Bake OS), used only by our own
staff, receives the "comments" webhook for our own Instagram professional account, checks whether the comment
contains an active campaign keyword, and replies publicly to that comment (POST /{comment-id}/replies) with a short
confirmation such as "We sent you the details by DM". We only read comments on our own account's media and only reply
to comments that contain a keyword our team configured. We store the comment ID, text, author username and the result
of the reply to avoid answering twice and to measure each campaign. Without this permission customers who ask for a
product in a comment would not get an answer, and our staff would have to reply to hundreds of comments manually.
```

**pages_messaging**
```
When someone comments one of our campaign keywords on a Reel of our own Instagram account, our back office sends one
private reply to that comment using the Private Replies API (POST /{page-id}/messages with recipient.comment_id). The
message is plain text with the product information and a link to our WhatsApp business number, where our staff and our
ordering assistant take the order. We send at most one private reply per comment, only within 7 days of the comment,
and never more than one per person and campaign every 24 hours. We do not send promotional or unsolicited messages:
every message is a direct answer to the person's own comment. Without this permission the customer would have to find
our contact details by themselves, and we could not answer the request they made in the comment.
```

**Human Agent**
```
Our private replies tell customers that a person from our team will help them with their order. When a customer
answers our private reply with a question that needs our staff (custom cakes, large orders, delivery coordination),
and the question arrives near closing time or on Sunday, our staff may need to answer after the standard 24-hour
window. The Human Agent tag lets a member of our staff (never an automated message) reply within 7 days, only to
resolve the customer's request.
```

**Dependencias** (si el formulario pide texto para cada una):
- `instagram_basic`: *Read basic information of our own Instagram professional account (ID and username) to link it to
  our back office and identify which account received each comment.*
- `pages_read_engagement` / `pages_show_list`: *List and read our own Facebook Page linked to the Instagram account, to
  obtain the Page ID used to send private replies.*
- `pages_manage_metadata`: *Subscribe our own Page and Instagram account to our app's webhooks so that new comments are
  delivered to our back office.*

**Preguntas de manejo de datos** (las hace el formulario): los datos de Instagram que se guardan son el id y el texto del
comentario, el usuario que comentó y el resultado del envío (tabla `respuestas_automaticas_envios`, en Supabase, región
São Paulo); el token, cifrado. Los usa solo el equipo de Bake Brothers, no se venden ni se comparten, y se borran a
pedido de la persona (política de privacidad). Proveedores que procesan datos: Supabase (base de datos), el servidor de
la API (Coolify) y Vercel (web).

### 6.5 Después de la aprobación

- [ ] Comentar la palabra de prueba desde una cuenta **sin rol** en la app: tiene que llegar la respuesta pública y la
      privada.
- [ ] Borrar o pausar la respuesta **BAKETEST**.
- [ ] Si un permiso queda sin usarse 90 días, Meta puede pedir concederlo de nuevo; y puede pedir una revisión anual del
      uso de datos (*Data Use Checkup*).

Fuentes (Meta): [App Review — Submission Guide](https://developers.facebook.com/docs/app-review/submission-guide),
[Screen recordings](https://developers.facebook.com/docs/app-review/submission-guide/screen-recordings),
[Permissions reference](https://developers.facebook.com/docs/permissions/reference),
[Human Agent](https://developers.facebook.com/docs/features-reference/human-agent),
[Private Replies](https://developers.facebook.com/docs/messenger-platform/instagram/features/private-replies/),
[Access Levels](https://developers.facebook.com/docs/graph-api/overview/access-levels),
[Business Verification](https://developers.facebook.com/docs/development/release/business-verification).
Sobre documentos aceptados para la verificación (fuentes de terceros, confirmar con la lista oficial de Meta):
[Wati — documentos por país](https://support.wati.io/es/articles/11463208-verificacion-de-negocios-de-meta-documentos-requeridos-por-pais),
[360dialog](https://docs.360dialog.com/docs/resources/meta-business-verification).

## Fase siguiente

- Lo mismo para **comentarios de Facebook** (mismo patrón, webhook `feed` de la página).
- Elegir **un reel específico** para una respuesta (hoy aplica a todas las publicaciones: la palabra clave es la campaña).
- **Bandeja de Instagram en Bake OS** (responder a mano las respuestas a la respuesta privada): es lo que permitiría demostrar Human Agent en la App Review.
- Botón en el DM: la documentación de respuestas privadas de Meta solo muestra texto, por eso el link va en el texto.

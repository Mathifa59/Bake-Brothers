# Migración del número de WhatsApp — portafolio comercial NUEVO

**Objetivo:** que los dos locales (Cedros y Santa Marina) atiendan por **un solo número**, conectado a la API de Meta y atendido
**solo desde Bake OS**. El bot contesta (cuando esté encendido), pregunta en qué local recoge el cliente, y el equipo toma las
conversaciones desde el panel.

**Qué cambió en esta versión (2026-11-26):** el portafolio comercial anterior fue **hackeado**, así que no se reutiliza nada de él
(ni app, ni usuario del sistema, ni token, ni WABA). Todo se crea de cero en un portafolio nuevo, con la seguridad armada **antes**
de conectar el número. Este documento dice qué creas tú en Meta y en qué orden (parte 1), qué hago yo y cuándo (parte 2), y deja
la checklist de la noche de la migración (partes 3 en adelante).

> **Regla de oro:** lo último que se hace es **eliminar la cuenta de WhatsApp del celular**. Todo lo demás se deja listo y probado
> antes. Si algo falla antes de ese paso, no se pierde nada. Después de ese paso, volver atrás es posible pero cuesta el historial
> de chats del celular (ver «Cómo volver atrás»).

> **Secretos:** ningún token, secreto de app, PIN ni contraseña se pega en el chat ni se escribe en el repo. Van al **gestor de
> contraseñas**, a **Coolify** (variables) o a la **terminal** (el script los pide sin mostrarlos). A mí solo me pasas identificadores
> que no son secretos (WABA ID, Phone number ID, App ID).

Cosas de la interfaz de Meta cambian seguido: donde diga *(verificar en pantalla)* confirma el nombre exacto del menú antes de tocar.

**Estado del lado de Bake OS (verificado el 2026-11-26, solo lectura):** no hay ninguna conexión de WhatsApp registrada, ningún mensaje ni
evento de Meta recibido (`whatsapp_conexiones`, `mensajes_webhook_procesados` y `eventos_meta_sin_procesar` están en 0), el bot está
**apagado** y el webhook de producción responde `503` a cualquier POST sin firma y `403` a una verificación con un token que no es el
nuestro. Es decir: **nada del portafolio anterior dejó rastro ni entró por nuestro webhook.**

---

## 1. Lo que creas tú en Meta, en orden

Cada paso termina con una **comprobación**. No pases al siguiente sin cumplirla.

### Paso 1 — Asegurar la cuenta personal que será dueña del portafolio (antes de crear nada)
Un portafolio nuevo hereda la seguridad de quien lo crea: si esa cuenta sigue comprometida, el hackeo se repite.
- [ ] Cambiar la contraseña de Facebook por una nueva y única (gestor de contraseñas), y la del **correo** asociado a esa cuenta.
- [ ] Activar la **verificación en dos pasos con app autenticadora** (no solo SMS) y guardar los códigos de recuperación.
- [ ] Facebook → Configuración → Seguridad → **dónde has iniciado sesión**: cerrar todas las sesiones que no sean tuyas, y revisar **Apps y sitios web** y quitar lo que no reconozcas.
- [ ] Revisar el correo de recuperación y el teléfono de la cuenta (que sean tuyos, no los puso el atacante).
- **Comprobación:** puedes iniciar sesión desde cero con la contraseña nueva + la app autenticadora.

### Paso 2 — Crear el portafolio comercial nuevo
- [ ] business.facebook.com → **Crear un portafolio comercial** *(verificar en pantalla)*. Nombre: «Bake Brothers».
- [ ] Usar un **correo de empresa del dominio** (`…@bakebrothers.pe`, el de Zoho), no un Gmail personal.
- [ ] **Decisión a tomar (la tomas tú):** ¿a nombre de qué razón social se verifica el portafolio? Hay dos (Corporación Hermanos Loarte S.A.C. —
      Cedros— y BAKER BROTHERS E.I.R.L. —Santa Marina—). Meta pide los documentos de **una** entidad legal y el nombre debe coincidir. Mi
      recomendación: la que figure como titular del negocio ante el contador. El **nombre visible** del número sigue siendo «Bake Brothers».
- **Comprobación:** el portafolio aparece en Configuración del negocio con tu cuenta como administradora.

### Paso 3 — Blindar el portafolio
- [ ] Configuración del negocio → **Centro de seguridad**: exigir **autenticación en dos pasos a todas las personas** del portafolio *(verificar en pantalla)*.
- [ ] **Un solo administrador de día a día** más **un segundo administrador de confianza** como respaldo (para no quedar fuera si pierdes el acceso). Nadie más con acceso total.
- [ ] No agregar a nadie del equipo del local al portafolio: el equipo trabaja en Bake OS, no en Meta.
- **Comprobación:** en «Personas» solo ves a esas dos personas, ambas con dos pasos activo.

### Paso 4 — Verificar el dominio y empezar la verificación del negocio
La verificación del negocio puede tardar varios días: **empieza ya**, corre en paralelo con lo demás.
- [ ] Configuración del negocio → Seguridad de marca → **Dominios** → agregar `bakebrothers.pe` y verificarlo con el registro **TXT** en el DNS (lo haces tú, que tienes el DNS).
- [ ] Centro de seguridad → **Iniciar verificación del negocio**: nombre legal, RUC, dirección y un documento (ficha RUC de SUNAT u otro que pidan) de la razón social elegida en el paso 2.
- **Comprobación:** el dominio figura como verificado y la verificación del negocio como «en revisión» (o «verificada»).
- *Sin esta verificación el sistema puede funcionar, pero con límites bajos para mensajes iniciados por el negocio y sin algunas funciones; las respuestas a clientes que escriben primero no dependen de ella.*

### Paso 5 — Crear la app de Meta (la que habla con nuestro servidor)
- [ ] developers.facebook.com → **Mis apps → Crear app** → tipo **Negocio** → **vincularla al portafolio NUEVO** (no a ninguno anterior). Nombre: «Bake OS».
- [ ] **Agregar el producto WhatsApp** a la app. Esto crea la **cuenta de WhatsApp Business (WABA)** en el portafolio nuevo y un número de prueba de Meta.
- [ ] Configuración → Básica: **URL de la política de privacidad** = `https://www.bakebrothers.pe/privacidad`, categoría del negocio y ícono; poner la app en modo **Live** (Meta lo exige).
- [ ] Copiar el **Secreto de la app** (Configuración → Básica → Mostrar) → va a **Coolify** como `META_APP_SECRET` (paso 8 de esta parte), no al chat.
- **Comprobación:** la app aparece vinculada al portafolio nuevo, en modo Live, con el producto WhatsApp y una WABA creada.

### Paso 6 — Método de pago en la WABA
- [ ] WhatsApp Manager → la WABA nueva → **Método de pago** (tarjeta de la empresa). Sin él, Meta bloquea los mensajes iniciados por el negocio (plantillas).
- **Comprobación:** la WABA muestra el método de pago activo.

### Paso 7 — Usuario del sistema y token que no vence
- [ ] Configuración del negocio → Usuarios → **Usuarios del sistema → Agregar**: nombre «bake-os-api», rol **Administrador** del sistema.
- [ ] **Asignar activos** a ese usuario: la **app** «Bake OS» (control total) y la **WABA** (control total).
- [ ] **Generar token**: elegir la app, vencimiento **Nunca**, permisos **`whatsapp_business_messaging`** y **`whatsapp_business_management`**. Copiarlo **una sola vez** al gestor de contraseñas (Meta no lo vuelve a mostrar).
- **Comprobación:** el token está guardado en el gestor de contraseñas. **No** lo pegues en ningún chat: lo pedirá el script de la noche, por terminal.

### Paso 8 — Variables en Coolify (las cargas tú; yo no veo Coolify)
Tabla de lo que va en la app de la API (nombres exactos; los valores NUNCA en el chat):

| Variable | Valor | Nota |
|---|---|---|
| `META_APP_SECRET` | secreto de la app **nueva** (paso 5) | Sin ella el webhook responde 503 por seguridad. **No** uses el de la app anterior. |
| `META_VERIFY_TOKEN` | un texto aleatorio **nuevo** (≥ 32 caracteres) | **Cámbialo**: el anterior pudo haberse filtrado con el portafolio hackeado. Es el mismo texto que escribirás en el paso 9. |
| `WHATSAPP_TOKEN_ENCRYPTION_KEY` | ya cargada | No se cambia (cifra los tokens guardados; hoy no hay ninguno). |
| `DATOS_PAGO` | texto con Yape/cuentas de Baker Brothers E.I.R.L. | Ya cargada. |
| `ANTHROPIC_API_KEY` | ya cargada | Solo se usa si se enciende el bot (ver «El bot arranca apagado»). |

- [ ] **Redeploy** de la API en Coolify (las variables se leen al arrancar).
- **Comprobación (la hago yo desde fuera):** `POST /webhook` sin firma pasa de `503 FIRMA_NO_CONFIGURADA` a `401` (la firma ya se exige) y `/health` muestra el commit correcto.

### Paso 9 — Conectar el webhook de la app a Bake OS
- [ ] En la app → WhatsApp → **Configuración** → Webhook → **URL de devolución de llamada** = `https://api.bake-brothers.com/webhook` y **Token de verificación** = el `META_VERIFY_TOKEN` del paso 8 → **Verificar y guardar**.
- [ ] **Suscribirse al campo `messages`** *(verificar en pantalla)*.
- **Comprobación:** Meta acepta la verificación (si dice que falló: revisa que el Redeploy terminó y que el token es idéntico, sin espacios).

### Paso 10 — Plantillas (la WABA nueva empieza sin ninguna)
- [ ] WhatsApp Manager → **Plantillas de mensajes** → crear las 9 esenciales de `docs/plantillas-whatsapp.md` (categoría **Utilidad**, idioma español; el JSON `docs/plantillas-whatsapp.json` tiene el texto exacto y las variables).
- [ ] Esperar la aprobación (de minutos a un día). **No bloquean la salida:** sin ellas solo se puede escribir con texto libre dentro de las 24 h.
- **Comprobación:** las plantillas figuran «Aprobadas». El panel las lee solas desde Meta (Conversaciones → «Elegir una plantilla»).

### Paso 11 — Nombre visible del número y preparación de la SIM
- [ ] Define el **nombre visible** «Bake Brothers» (se aprueba al agregar el número; la verificación del negocio ayuda).
- [ ] Ten a mano el **celular con la SIM del número** (recibe el SMS/llamada de verificación) y averigua **si el número tiene PIN de verificación en dos pasos**: si lo tiene y no lo recuerdan, Meta pide esperar 7 días. Averígualo **antes** de la noche.
- [ ] **Respaldo de los chats del celular** (WhatsApp Business → Ajustes → Chats → Copia de seguridad). La API de WhatsApp **no trae** el historial anterior.
- **Comprobación:** sabes si hay PIN, lo tienes (o está recuperado), y el respaldo está hecho.

### ⚠️ Antes de la noche: el número no puede estar en otra cuenta de Meta
Un número no puede estar a la vez en la app del celular, en una WABA anterior y en la nueva. Si el número **alguna vez estuvo agregado a una WABA del portafolio hackeado**, hay que **quitarlo de ahí primero** (si aún tienes acceso) o pedir a Meta que lo libere (soporte de Meta Business). Es la causa más probable de que el paso 3 de la noche falle con «número ya registrado». **Dime si el número estuvo en alguna WABA antes**, así sabemos si esto aplica.

---

## 2. Lo que hago yo, y cuándo

Yo no entro a Meta ni a Coolify (no tengo esos accesos y no deben dármelos). Lo mío es el código, la base de datos y verificar **desde fuera** que lo que cargaste funciona.

| Cuándo | Qué hago |
|---|---|
| **Ahora** | Dejar este documento y el código listos (hecho). Revisado: nada del portafolio anterior en la base (ver arriba). |
| **Cuando termines el paso 8 (Redeploy)** | Comprobar `/health` (commit) y que `POST /webhook` sin firma ya responde `401` y no `503` (prueba de que `META_APP_SECRET` quedó cargada). |
| **Cuando termines el paso 9 (webhook)** | Confirmar que la verificación pasó y que el webhook sigue cerrado a firmas inválidas. |
| **Antes de la noche** | Correr el ensayo de las pruebas (suite completa) y verificar que **Ajustes** y las cuentas del equipo están como deben (perfiles, avisos, quién recibe qué). Revisar contigo qué cuentas existen en Equipo. |
| **La noche (después de que corras `pnpm whatsapp:alta`)** | Verificar en la base, **solo lectura**, que quedó **una** conexión `uso = 'bot'`, activa, con el token **cifrado** (nunca lo leo), con su `phone_number_id`. Después, mientras pruebas con otro celular, ver en la base que cada mensaje llegó (`mensajes_webhook_procesados`), que la conversación nació sin local, que aparecieron los avisos y, si el bot estaba encendido, el pedido con su local. |
| **Si algo falla** | Con las líneas del log de Coolify que me pegues (**sin tokens**) diagnostico y corrijo; o dejo el bot apagado y el equipo responde a mano. |
| **Primeras 24 h** | Revisar Conversaciones con datos reales: cuántas derivó el bot, errores (`ultimoError`), tiempos de primera respuesta. |
| **Al cierre** | Actualizar `CLAUDE.md` con la fecha de la migración y el estado final. |

**Lo que SÍ haces tú siempre:** escribir el token y el PIN en la terminal cuando el script los pida, cargar variables en Coolify y hacer el Redeploy, y todo lo que se toca en Meta o en el celular.

---

## 3. Preparación de Bake OS (días antes; no toca el número)

**El bot arranca apagado.** La base viene con el bot **apagado** (`Ajustes → Bot`): con el número ya conectado, **cada mensaje lo responde una persona** desde
el panel y cada uno genera aviso (campana + push). Si el saldo de Anthropic aún no está cargado, **sale así y está bien**; el bot se enciende después
desde Ajustes (el administrador, con confirmación), sin Redeploy. Opcional: activar la **bienvenida automática** (texto fijo, sin IA) en Ajustes.

**Bake OS**
- [ ] `https://api.bake-brothers.com/health` responde `ok` con el commit más reciente.
- [x] Migraciones **0030 y 0034 → 0059** ya aplicadas al Supabase real (la 0052 es de otra rama y no va). No hay que volver a correrlas.
- [ ] Datos `[PRUEBA]` borrados (cuando el cliente avise).

**Equipo** (cuentas y perfiles en Bake OS → Equipo; panel en `https://dashboard.bakebrothers.pe`)
- [ ] Las cuentas del equipo existen y entran. **Venta digital** y **Administración** son quienes atienden las conversaciones y reciben los avisos de mensajes; **Caja** y
      **Producción** ven lo de su local; **Sara** (Administración) confirma pagos y debe tener el aviso de pagos.
- [ ] Cada persona abre el panel **en su celular** (`dashboard.bakebrothers.pe`), lo **instala** en la pantalla de inicio, activa los **avisos** en Ajustes y manda el aviso de prueba
      con el celular bloqueado (con el dominio nuevo hay que repetirlo aunque ya lo hubieran hecho en el anterior).
- [ ] Todos saben que **desde esa noche no se responde por el celular**: se responde desde Bake OS.
- [ ] Horario de personas que atienden WhatsApp: lunes a sábado 8:00 a. m.–8:30 p. m., domingo 10:00 a. m.–8:30 p. m.; fuera de ese horario el cliente recibe «te escribimos a primera hora».

---

## 4. La noche de la migración

Hacerla fuera del horario de pedidos (después del cierre de Santa Marina, 10 p. m.). Duración estimada: 1 hora. **Requisito:** los pasos 1–11 de la parte 1 terminados y verificados.

### 4.1 Antes de tocar el número (10 min)
- [ ] `https://api.bake-brothers.com/health` ok y el panel carga con las cuentas reales.
- [ ] El webhook de la app apunta a `https://api.bake-brothers.com/webhook`, está verificado y suscrito a **messages** (paso 9).
- [ ] Ensayo del script sin llamar a nadie (desde `apps/api`):

```bash
pnpm whatsapp:alta -- --bot --waba <WABA_ID> --phone <PHONE_NUMBER_ID> --simular
```

*(El `PHONE_NUMBER_ID` aparece cuando el número ya está agregado a la WABA; si todavía no, se hace el paso 4.3 y se vuelve aquí.)*

### 4.2 Eliminar la cuenta de WhatsApp del celular — **ÚLTIMO PASO PREVIO, sin vuelta fácil**
- [ ] Confirmar que el respaldo de chats está hecho y que no hay otra WABA con ese número (ver el aviso de la parte 1).
- [ ] En el celular: WhatsApp Business → Ajustes → Cuenta → **Eliminar cuenta**. Un número no puede estar a la vez en la app y en la API.

### 4.3 Agregar el número a la WABA nueva (15 min)
- [ ] WhatsApp Manager → la WABA **nueva** → Números de teléfono → **Agregar número** *(verificar en pantalla)*. Nombre visible «Bake Brothers».
- [ ] Verificar con el código que llega por **SMS o llamada** a la SIM.
- [ ] Anotar el **Phone number ID** y el **WABA ID** que muestra Meta (estos dos sí me los puedes pasar).

### 4.4 Alta del número en la API y en Bake OS (5 min)
Desde `apps/api`. El token y el PIN **se escriben en la terminal y no se ven**; no los pongas en comandos ni archivos:

```bash
pnpm whatsapp:alta -- --bot --waba <WABA_ID> --phone <PHONE_NUMBER_ID>
```

El script hace, en orden: comprueba que el token ve el número → **registra el número** (`POST /{phone-number-id}/register` con el PIN de
6 dígitos; si el número no tenía PIN, este queda como el PIN nuevo: **guárdalo**) → **suscribe la app** a la cuenta
(`POST /{waba-id}/subscribed_apps`) → verifica la suscripción → lo registra en Bake OS con el token cifrado. Si un paso falla, se
detiene y dice cuál; no deja nada registrado en Bake OS.

- [ ] Todos los pasos salen con ✔.
- [ ] Avísame: verifico en la base que quedó la conexión del bot (solo lectura).

### 4.5 Pruebas de punta a punta con un celular que no sea el del negocio (20 min)
Escribe al número desde otro teléfono y marca cada caso. **Con el bot apagado** (lo normal al inicio): cada mensaje aparece en Conversaciones como «Esperando persona», suena el aviso en los celulares del
equipo y se puede **Tomar** y responder. **Con el bot encendido**, además:
- [ ] «Hola, ¿cuánto cuesta el carrot cake individual?» → responde con el precio real.
- [ ] Pedido de **recojo**: el bot pregunta **en qué local** (con las dos direcciones), el pedido aparece en Pedidos **del local elegido**, y la
      conversación queda en ese local. Un segundo pedido en la misma conversación → **vuelve a preguntar el local**.
- [ ] Pedido de **delivery**: aparece en Pedidos de **ambos** locales como «Sin local»; un empleado toca **Me lo quedo** y pasa a su local.
- [ ] Mandar la **captura de un pago**: el pedido queda con «Pago por confirmar»; **Sara** recibe el aviso y lo **confirma con un toque**.
- [ ] Un reclamo o «quiero hablar con una persona»: la conversación aparece **Esperando persona**, suena el aviso, y se puede **Tomar**, responder
      (llega al celular de prueba) y **Devolver al bot** / **Cerrar**.
- [ ] Un mensaje con **alergia** → deriva a una persona.
- [ ] Un pedido nuevo del bot genera su **aviso de pedido nuevo** (campana + push) para quien tiene el aviso de órdenes.
- [ ] Cada persona entra desde su **celular** y puede hacer lo suyo.
- [ ] En Coolify → Logs de la API: sin errores `500` ni `FIRMA` durante las pruebas.

### 4.6 Avisar y vigilar (primeras 24 h)
- [ ] Avisar al equipo que el número ya está en Bake OS.
- [ ] Una persona revisa Conversaciones cada hora el primer día.
- [ ] Si el bot derivó mucho o contestó algo raro, anotarlo para ajustar.

---

## 5. Cómo volver atrás

| Dónde falló | Qué hacer |
|---|---|
| Antes del paso 4.2 (no se eliminó la cuenta del celular) | No pasó nada. Se corrige y se reintenta otra noche. |
| Paso 4.3 (la verificación no llega) | Esperar unos minutos, pedir la llamada de voz en vez del SMS. Si el número quedó en un estado raro o dice «ya registrado»: revisar si estuvo en una WABA anterior; Manager → eliminar el número de la WABA y repetir. |
| Paso 4.4 (el alta falla) | El script dice qué paso falló y **no registra nada en Bake OS**. Corregir (token, PIN, permisos) y repetirlo: es seguro correrlo de nuevo. |
| Paso 4.5 (el bot falla) | Con el número ya en la API **nadie atiende** si el bot falla: el equipo responde desde el panel (Conversaciones) mientras se corrige. Los fallos internos derivan solos a una persona. Apagar el bot: Ajustes → Bot. |
| Hay que abandonar la API del todo | Manager → **eliminar el número de la WABA** → reinstalar WhatsApp Business en el celular y registrar el número de nuevo (llega un SMS). Se recupera el respaldo de chats del celular solo si se hizo antes del paso 4.2. |

**Qué NO tiene vuelta:** el historial de chats del celular si no hubo respaldo, y las llamadas de WhatsApp a ese número (la API no las soporta).

### Si se sospecha otro compromiso del portafolio o del token
1. Meta → Usuarios del sistema → **revocar el token** de «bake-os-api» y generar uno nuevo (Nunca vence → solo cuando haga falta).
2. App → Configuración → Básica → **restablecer el secreto de la app**; cargar el nuevo en Coolify (`META_APP_SECRET`) y hacer Redeploy. Mientras el secreto no coincida el webhook rechaza todo (es lo seguro).
3. Cambiar `META_VERIFY_TOKEN` (y volver a verificar el webhook en la app).
4. Volver a registrar el número con el token nuevo: `pnpm whatsapp:alta` (o `whatsapp:registrar`) actualiza la conexión existente (se identifica por el `phone_number_id`).
5. Apagar el bot en Ajustes mientras se revisa, y mirar `conversaciones` / `eventos_meta_sin_procesar` por actividad rara.

---

## 6. Después de la migración

- [ ] Guardar el PIN, el WABA ID, el Phone number ID y el token en el gestor de contraseñas.
- [ ] Revisar que las plantillas aprobadas estén disponibles (para escribir a un cliente pasadas las 24 h: en Conversaciones, «Elegir una plantilla»).
- [ ] Definir si sigue habiendo un celular con la app de WhatsApp Business para otro número de los locales (esos números no se tocan).
- [ ] Cuando haya saldo de Anthropic: cargar una clave nueva, **revocar la anterior**, correr las conversaciones de prueba con Claude real y recién entonces **encender el bot** desde Ajustes.
- [ ] Anotar en `CLAUDE.md` la fecha de la migración y el estado final.

# Migración del número de WhatsApp — checklist de la noche

**Objetivo:** que los dos locales (Cedros y Santa Marina) atiendan por **un solo número**, conectado a la API de Meta y atendido
**solo desde Bake OS**. El bot contesta, pregunta en qué local recoge el cliente, y el equipo toma las conversaciones desde el panel.

> **Regla de oro:** lo último que se hace es **eliminar la cuenta de WhatsApp del celular**. Todo lo demás se deja listo y probado
> antes. Si algo falla antes de ese paso, no se pierde nada. Después de ese paso, volver atrás es posible pero cuesta el historial
> de chats del celular (ver «Cómo volver atrás»).

Cosas de la interfaz de Meta cambian seguido: donde diga *(verificar en pantalla)* confirma el nombre exacto del menú antes de tocar.

---

## A. Días antes (nada de esto toca el número)

**Meta**
- [ ] Portafolio comercial de Bake Brothers **verificado** en Meta Business (razón social y RUC).
- [ ] App de Meta de tipo *Business* con el producto **WhatsApp** agregado y una **cuenta de WhatsApp Business (WABA)** creada.
- [ ] **Método de pago** cargado en la WABA (sin él, Meta no deja enviar mensajes iniciados por el negocio).
- [ ] **Usuario del sistema** con permisos `whatsapp_business_messaging` y `whatsapp_business_management`, y su **token que no vence**
      generado y guardado en el gestor de contraseñas (nunca en el repo ni en el chat).
- [ ] En la configuración de la app: **URL de la política de privacidad** = `https://www.bake-brothers.com/privacidad` y la app en
      modo **Live** (Meta lo exige).
- [ ] Plantillas enviadas a aprobar (`docs/plantillas-whatsapp.md`). No bloquean la salida, pero conviene que ya estén aprobadas.

**Bake OS (Coolify, solo en ejecución)**
- [ ] `ANTHROPIC_API_KEY`, `WHATSAPP_TOKEN_ENCRYPTION_KEY` (obligatoria: sin ella la API no arranca), `META_VERIFY_TOKEN` — ya cargadas.
- [ ] `META_APP_SECRET` (Meta → app → Configuración → Básica). **Sin esta variable el webhook responde 503 por seguridad.**
- [ ] `DATOS_PAGO` (texto con los datos de Yape / cuentas para el cliente que paga antes). Sin ella, el bot avisa que una persona
      le pasa los datos y deriva la conversación.
- [x] Migraciones 0030 y 0034 → 0038 **ya aplicadas** al Supabase real (2026-11-05). No hay que volver a correrlas.
- [ ] **Deploy** de la API hecho con la rama `main` (el Branch de la app en Coolify en `main`, no `feature/bake-os`).
- [ ] `https://api.bake-brothers.com/health` responde `ok`.
- [ ] Datos `[PRUEBA]` borrados (cuando el cliente avise).

**Equipo**
- [ ] Las 3 cuentas del panel entran (dos empleados y una de dirección). Los empleados ven solo Pedidos, Producción, Conversaciones y Stock.
- [ ] Todos saben que **desde esa noche no se responde por el celular**: se responde desde Bake OS.
- [ ] **Respaldo de los chats del celular** (WhatsApp Business → Ajustes → Chats → Copia de seguridad, y/o exportar los chats importantes).
      La API de WhatsApp **no trae** el historial anterior.
- [ ] Quién tiene a mano el celular con la SIM del número (recibe el SMS / la llamada de verificación) y **el PIN de verificación en dos pasos**
      si el número lo tiene activado (si no lo recuerdan, Meta pide esperar 7 días: averiguarlo ANTES).

---

## B. La noche de la migración

Hacerla fuera del horario de pedidos (después del cierre de Santa Marina, 10 p. m.). Duración estimada: 1 hora.

### 1. Antes de tocar el número (10 min)
- [ ] `https://api.bake-brothers.com/health` ok y el panel carga con las cuentas reales.
- [ ] En Meta, el **webhook** de la app apunta a `https://api.bake-brothers.com/webhook`, con el `META_VERIFY_TOKEN`, y está suscrito al campo **messages**.
- [ ] Ensayo del script sin llamar a nadie (desde `apps/api`):

```bash
pnpm whatsapp:alta -- --bot --waba <WABA_ID> --phone <PHONE_NUMBER_ID> --simular
```

*(El `PHONE_NUMBER_ID` aparece cuando el número ya está agregado a la WABA; si todavía no, se hace el paso 3 y se vuelve aquí.)*

### 2. Eliminar la cuenta de WhatsApp del celular — **ÚLTIMO PASO PREVIO, sin vuelta fácil**
- [ ] Confirmar que el respaldo de chats está hecho.
- [ ] En el celular: WhatsApp Business → Ajustes → Cuenta → **Eliminar cuenta**. Un número no puede estar a la vez en la app y en la API.

### 3. Agregar el número a la WABA (15 min)
- [ ] Meta → WhatsApp Manager → Números de teléfono → **Agregar número** *(verificar en pantalla)*. Usar el nombre visible «Bake Brothers».
- [ ] Verificar con el código que llega por **SMS o llamada** a la SIM.
- [ ] Anotar el **Phone number ID** y el **WABA ID** que muestra Meta.

### 4. Alta del número en la API y en Bake OS (5 min)
Desde `apps/api`. El token y el PIN **se escriben en la terminal y no se ven**; no los pongas en comandos ni archivos:

```bash
pnpm whatsapp:alta -- --bot --waba <WABA_ID> --phone <PHONE_NUMBER_ID>
```

El script hace, en orden: comprueba que el token ve el número → **registra el número** (`POST /{phone-number-id}/register` con el PIN de
6 dígitos; si el número no tenía PIN, este queda como el PIN nuevo: **guárdalo**) → **suscribe la app** a la cuenta
(`POST /{waba-id}/subscribed_apps`) → verifica la suscripción → lo registra en Bake OS con el token cifrado. Si un paso falla, se
detiene y dice cuál; no deja nada registrado en Bake OS.

- [ ] Todos los pasos salen con ✔.

### 5. Pruebas de punta a punta con un celular que no sea el del negocio (20 min)
Escribe al número desde otro teléfono y marca cada caso:
- [ ] «Hola, ¿cuánto cuesta el carrot cake individual?» → responde con el precio real.
- [ ] Pedido de **recojo**: el bot pregunta **en qué local** (con las dos direcciones), el pedido aparece en Pedidos **del local elegido**, y la
      conversación queda en ese local.
- [ ] Un segundo pedido en la misma conversación → **vuelve a preguntar el local**.
- [ ] Pedido de **delivery**: aparece en Pedidos de **ambos** locales como «Sin local»; un empleado toca **Me lo quedo** y pasa a su local.
- [ ] Mandar la **captura de un pago**: el pedido queda con «Pago por confirmar»; un empleado lo **confirma con un toque**.
- [ ] Un reclamo o «quiero hablar con una persona»: la conversación aparece **Esperando persona**, suena el aviso, y se puede **Tomar**, responder
      (llega al celular de prueba) y **Devolver al bot** / **Cerrar**.
- [ ] Un mensaje con **alergia** → deriva a una persona.
- [ ] Cada empleado entra desde su **celular** y puede hacer todo lo anterior.
- [ ] En Coolify → Logs de la API: sin errores `500` ni `FIRMA` durante las pruebas.

### 6. Avisar y vigilar (primeras 24 h)
- [ ] Avisar al equipo que el número ya está en Bake OS.
- [ ] Una persona revisa Conversaciones cada hora el primer día.
- [ ] Si el bot derivó mucho o contestó algo raro, anotarlo para ajustar.

---

## C. Cómo volver atrás

| Dónde falló | Qué hacer |
|---|---|
| Antes del paso 2 (no se eliminó la cuenta del celular) | No pasó nada. Se corrige y se reintenta otra noche. |
| Paso 3 (la verificación no llega) | Esperar unos minutos, pedir la llamada de voz en vez del SMS. Si el número quedó en un estado raro: Manager → eliminar el número de la WABA y repetir. |
| Paso 4 (el alta falla) | El script dice qué paso falló y **no registra nada en Bake OS**. Corregir (token, PIN, permisos) y repetirlo: es seguro correrlo de nuevo. |
| Paso 5 (el bot falla) | Con el número ya en la API **nadie atiende** si el bot falla: el equipo responde desde el panel (Conversaciones) mientras se corrige. Los fallos internos derivan solos a una persona. |
| Hay que abandonar la API del todo | Manager → **eliminar el número de la WABA** → reinstalar WhatsApp Business en el celular y registrar el número de nuevo (llega un SMS). Se recupera el respaldo de chats del celular solo si se hizo antes del paso 2. |

**Qué NO tiene vuelta:** el historial de chats del celular si no hubo respaldo, y las llamadas de WhatsApp a ese número (la API no las soporta).

---

## D. Después de la migración

- [ ] Guardar el PIN, el WABA ID y el Phone number ID en el gestor de contraseñas.
- [ ] Revisar que las plantillas aprobadas estén disponibles (para escribir a un cliente pasadas las 24 h; el panel hoy solo permite texto libre dentro de la ventana).
- [ ] Definir si sigue habiendo un celular con la app de WhatsApp Business para otro número de los locales (esos números no se tocan).
- [ ] Anotar en `CLAUDE.md` la fecha de la migración y el estado final.

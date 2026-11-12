# Checklist del día del encendido del bot

El bot ya está construido y probado sin Claude real. Se **enciende con un interruptor** (Ajustes → *Bot activo*), sin redeploy.
Hoy no hay saldo en Anthropic: este documento es el paso a paso para cuando lo haya. Mientras tanto, el número se atiende
solo con personas desde Conversaciones.

## 0. Antes de empezar: qué tiene que estar listo

| Requisito | Dónde se ve | Si falta |
|---|---|---|
| Número migrado, webhook activo y modo **Live** en Meta | `docs/migracion-numero.md` | No se enciende nada |
| `META_APP_SECRET`, `WHATSAPP_TOKEN_ENCRYPTION_KEY`, `META_VERIFY_TOKEN`, `VAPID_*` en Coolify | Coolify → variables | El webhook responde 503 o no llegan avisos |
| **`DATOS_PAGO`** en Coolify (Yape y cuentas) | Coolify → variables | **El bot no los inventa**: registra el pedido y deriva a una persona. Se puede encender igual, pero cada pago adelantado lo atiende una persona |
| Plantillas aprobadas en Meta (las 9 esenciales) | `docs/plantillas-whatsapp.md` | El equipo no puede escribir a clientes con la ventana cerrada |
| Catálogo al día (precios y qué se vende) en **Catálogo** del panel | Panel → Catálogo | El bot dice lo que diga el panel: precio mal = bot mal |
| Horario del sábado de Cedros | Pendiente del cliente | El bot no promete hora ese día (dice «por confirmar») |
| Alguien del equipo mirando Conversaciones durante las primeras horas | — | — |

## 1. Cargar saldo y crear la clave nueva (Anthropic)

1. console.anthropic.com → **Billing** → cargar saldo. Activa un **límite de gasto mensual** y una **alerta por correo** al 50 % y al 80 %.
2. **API keys** → **Create key** con un nombre claro (`bake-bot-prod`). **Revoca la anterior** (la que se usó en pruebas) en cuanto la nueva funcione.
3. Guarda la clave nueva **solo** en el gestor de contraseñas y en Coolify. Nunca en un chat, captura ni archivo del repo.

## 2. Coolify

1. App de la API → variables → `ANTHROPIC_API_KEY` = la clave nueva. (No cargues `BOT_MODELO`: sin ella usa Sonnet, lo probado. Haiku se evalúa después: `docs/cambio-a-haiku.md`.)
2. Branch en `main`. **Redeploy**.
3. Confirma: `https://api.bake-brothers.com/health` responde bien y el log de arranque muestra la línea **«Modelos de Claude del bot»** con Sonnet.

## 3. Correr las pruebas con Claude real (antes de encender)

Contra una **base de pruebas** (copia local con el esquema; nunca la real) y la clave nueva:

```bash
cd apps/api
RUN_FIXTURES=1 VER_RESPUESTAS=1 DATABASE_URL=<base de pruebas> ANTHROPIC_API_KEY=<clave nueva> \
  pnpm exec vitest run test/cerebroFixtures.test.ts
```

Después, las otras pruebas que usan el modelo real (mismo entorno):

```bash
pnpm exec vitest run test/cerebro.test.ts test/cerebroTamano.test.ts test/cerebroAgotadoLocal.test.ts test/capturaPagoReal.test.ts
```

**Criterio para seguir:**
- Las 20 conversaciones de `test/fixtures/conversaciones/` pasan. Un caso que falla una vez se repite; si falla 2 de 3, es real.
- Lee las respuestas impresas (`VER_RESPUESTAS=1`): una expectativa puede pasar y la respuesta sonar mal (tono, voseo, inventar datos).
- Suma las conversaciones reales que tenga el cliente (ver `test/fixtures/conversaciones/LEEME.md`) y repítelas.
- Si algo falla: **no se enciende**; se corrige y se repite.

## 4. Prueba corta en producción, con tu propio número (bot aún apagado)

1. Escribe al número del negocio desde tu celular: debe aparecer en **Conversaciones** como «Esperando persona», sin respuesta del bot, y llegar el aviso (campana y push).
2. Responde desde el panel y confirma que te llega. Prueba también **Elegir una plantilla** con la ventana cerrada (otra conversación de más de 24 h).

## 5. Encender y vigilar

1. **Ajustes → Bot activo** (te pide confirmar). Con el celular de prueba, escribe: un saludo, un precio, un producto agotado o inexistente y un pedido de recojo (debe **preguntar el local**). Completa el pedido: debe aparecer en **Pedidos** con el canal WhatsApp; anúlalo después (cuenta como pedido real).
2. **Primeras 2 horas**: tener abierta Conversaciones en «Todas» y leer **cada** conversación que atienda el bot.
3. Revisar cada pedido que cree el bot contra su conversación (producto, tamaño, precio, fecha, local, pago).
4. Revisar el **log de Coolify** (errores de `procesarMensajeWhatsApp`; una conversación escalada por error deja `contexto.ultimoError`).
5. A la hora: mirar el **consumo** en console.anthropic.com → Usage y compararlo con lo esperado (ver costo abajo).

## 6. Cuándo APAGARLO de inmediato (Ajustes → Bot activo)

Apagar no requiere redeploy y deja todo lo que llegue como «Esperando persona». Apágalo si ocurre cualquiera de estas:

- Dice un **precio, un dato de pago o una dirección que no existe** o que no es la del panel.
- Crea un pedido **duplicado**, con fecha/local equivocado, o un pedido para hoy **después de las 8:00 p. m.**
- **Confirma un catering**, una torta personalizada, un reclamo o una alergia (siempre deben pasar a una persona).
- Responde con **voseo** o de forma que molesta al cliente, o **ignora** a un cliente enojado.
- Errores repetidos en el log, o un gasto mucho mayor al esperado.

Después de apagar: revisa qué pasó (conversación + log), agrega la conversación a `test/fixtures/conversaciones/` con lo que debió pasar y corrige antes de volver a encender.

## 7. Qué hace el bot (resumen de reglas que el servidor hace cumplir)

- Atiende 24 horas. **Corte del día: 8:00 p. m.** (clientes) / 11:00 p. m. (mayoristas): pasado el corte no se toma nada para hoy, se ofrece mañana.
- Lo que pasa a una persona **fuera de horario** (de 10:00 p. m. a 7:30 a. m., hora de Lima) lleva «te escribimos a primera hora».
- Catering, tortas personalizadas, alergias y reclamos: **siempre una persona**. Delivery: lo cotiza una persona; el pago es adelantado.
- Recojo: pregunta el local. Pago: adelantado o al recoger; el bot **nunca** marca un pago como pagado (lo confirma una persona con la captura).
- Lee **siempre** el catálogo activo: producto o tamaño oculto = no existe para el bot; un precio cambiado en el panel lo sabe al instante.

## 8. Costo y modelo

- Sonnet por defecto (probado). Una conversación típica de venta usa varias llamadas al modelo (una por vuelta de herramientas): con el límite de gasto y las alertas activadas no hay sorpresas.
- Cuando todo esté estable, evalúa **Haiku** (más barato): se cambia con `BOT_MODELO` y se valida repitiendo las 20 conversaciones (`docs/cambio-a-haiku.md`). La lectura de capturas de pago se queda en Sonnet.

## 9. Lo que NO hace todavía (para no esperarlo)

- Las plantillas se envían **a mano** desde el panel; no hay disparadores automáticos.
- Sin avisos push de pedidos nuevos ni de pagos reportados (solo de mensajes y conversaciones esperando persona; los pagos reportados salen en el Control Tower).
- Instagram y Facebook (ManyChat): después del lanzamiento.

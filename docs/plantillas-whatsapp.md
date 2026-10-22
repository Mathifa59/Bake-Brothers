# Plantillas de WhatsApp — Bake Brothers

Siete plantillas de categoría **UTILITY** (mensajes transaccionales sobre un pedido que el cliente ya hizo),
idioma **Español (`es`)**, para registrar en el WhatsApp Business Manager del número del bot (WABA de Bake
Brothers → *Plantillas de mensajes* → *Crear plantilla*). Tono: cálido y cercano, tuteo, sin promociones.

> **Por qué hacen falta.** WhatsApp solo deja escribir libremente dentro de las 24 h siguientes al último
> mensaje del cliente. Fuera de esa ventana (por ejemplo "tu pedido está listo" horas después, o el
> recordatorio del día anterior) solo se puede enviar una plantilla aprobada.

## Reglas de Meta que ya cumplen estos textos

- Ninguna plantilla **empieza ni termina** con una variable.
- Ninguna variable va **pegada a otra**; todas tienen texto alrededor.
- Sin ofertas, descuentos ni "te esperamos con novedades": cualquier giro promocional hace que Meta la
  reclasifique como **MARKETING** (más cara y con otras reglas). Si eso pasa, no se puede cambiar el texto
  sin volver a enviarla.
- Nombres en minúsculas y con guion bajo; no se pueden editar una vez creados (si hace falta cambiar uno, se
  crea otro).
- Sin encabezado, sin pie y sin botones (los tres son opcionales; así la aprobación suele ser más rápida).
- Los **ejemplos** son obligatorios: Meta no aprueba una variable sin un valor de muestra.

---

## 1. `pedido_confirmado` — confirmación de pedido

- **Categoría:** UTILITY · **Idioma:** Español (`es`)
- **Cuándo se usa:** apenas el pedido queda registrado (estado *Confirmado*).

**Texto**

```
Hola {{1}}, ¡gracias por tu pedido en Bake Brothers! 🧁

Tu pedido {{2}} quedó confirmado para el {{3}}. Lo {{4}}.
Total: S/ {{5}}.

Si necesitas cambiar algo, respóndenos por este chat.
```

| Variable | Qué lleva | Ejemplo |
|---|---|---|
| `{{1}}` | Nombre del cliente | Lucía |
| `{{2}}` | Número de pedido | BB-000123 |
| `{{3}}` | Fecha y hora de entrega | sábado 25 de octubre a las 4:00 p. m. |
| `{{4}}` | Cómo se entrega | recoges en nuestro local de Cedros |
| `{{5}}` | Total | 85.90 |

---

## 2. `pago_confirmado` — confirmación de pago

- **Categoría:** UTILITY · **Idioma:** Español (`es`)
- **Cuándo se usa:** cuando el equipo marca el pedido como pagado (Yape, Izipay, transferencia…).

**Texto**

```
Hola {{1}}, ya recibimos tu pago de S/ {{2}} por el pedido {{3}}. ¡Gracias! 🙌

Tu pedido ya está en nuestra lista para prepararlo con cariño.
```

| Variable | Qué lleva | Ejemplo |
|---|---|---|
| `{{1}}` | Nombre del cliente | Lucía |
| `{{2}}` | Monto pagado | 85.90 |
| `{{3}}` | Número de pedido | BB-000123 |

---

## 3. `recordatorio_entrega` — recordatorio de entrega

- **Categoría:** UTILITY · **Idioma:** Español (`es`)
- **Cuándo se usa:** el día anterior o la mañana de la entrega.

**Texto**

```
Hola {{1}}, te recordamos que tu pedido {{2}} está programado para el {{3}}. 🗓️

Detalle: {{4}}.

Si algo cambió, avísanos por este chat y lo vemos juntos.
```

| Variable | Qué lleva | Ejemplo |
|---|---|---|
| `{{1}}` | Nombre del cliente | Lucía |
| `{{2}}` | Número de pedido | BB-000123 |
| `{{3}}` | Fecha y hora de entrega | sábado 25 de octubre a las 4:00 p. m. |
| `{{4}}` | Lugar de recojo o dirección de delivery | recojo en el local de Cedros |

---

## 4. `pedido_en_preparacion` — pedido en preparación

- **Categoría:** UTILITY · **Idioma:** Español (`es`)
- **Cuándo se usa:** cuando el pedido pasa a *En preparación*.

**Texto**

```
Hola {{1}}, ya estamos preparando tu pedido {{2}}. 👩‍🍳

Lo hacemos con mucho cariño y te avisaremos por aquí apenas esté listo.
```

| Variable | Qué lleva | Ejemplo |
|---|---|---|
| `{{1}}` | Nombre del cliente | Lucía |
| `{{2}}` | Número de pedido | BB-000123 |

---

## 5. `pedido_listo_o_en_camino` — pedido listo o en camino

- **Categoría:** UTILITY · **Idioma:** Español (`es`)
- **Cuándo se usa:** cuando el pedido pasa a *Listo* (recojo en tienda) o a *Despachado* (delivery). Una sola
  plantilla cubre los dos casos: la variable `{{3}}` lleva la frase que corresponde.

**Texto**

```
Hola {{1}}, tenemos novedades de tu pedido {{2}}: {{3}} 🎉

Si tienes alguna duda, escríbenos por este chat.
```

| Variable | Qué lleva | Ejemplo |
|---|---|---|
| `{{1}}` | Nombre del cliente | Lucía |
| `{{2}}` | Número de pedido | BB-000123 |
| `{{3}}` | Estado + dónde | ya está listo para que lo recojas en nuestro local de Cedros |
| | (segundo caso) | ya va en camino a tu dirección y llegará en unos minutos |

> Si Meta rechaza la plantilla por tener una variable "demasiado abierta" en `{{3}}`, se separa en dos
> (`pedido_listo` y `pedido_en_camino`) con el mismo texto y sin esa variable; el código solo tendría que
> elegir una u otra según la modalidad.

---

## 6. `pedido_entregado` — pedido entregado

- **Categoría:** UTILITY · **Idioma:** Español (`es`)
- **Cuándo se usa:** al cerrar el pedido como entregado.

**Texto**

```
Hola {{1}}, tu pedido {{2}} ya fue entregado. ✅

¡Gracias por elegir Bake Brothers! Esperamos que lo disfrutes mucho. 🧁
```

| Variable | Qué lleva | Ejemplo |
|---|---|---|
| `{{1}}` | Nombre del cliente | Lucía |
| `{{2}}` | Número de pedido | BB-000123 |

---

## 7. `solicitud_resena` — solicitud de reseña

- **Categoría:** UTILITY · **Idioma:** Español (`es`)
- **Cuándo se usa:** unas horas después de la entrega (nunca antes), una sola vez por pedido.

**Texto**

```
Hola {{1}}, ¿cómo estuvo tu pedido {{2}}? 💛

Tu opinión nos ayuda a seguir mejorando. Cuéntanos tu experiencia aquí: {{3}}

¡Gracias por ayudarnos a crecer!
```

| Variable | Qué lleva | Ejemplo |
|---|---|---|
| `{{1}}` | Nombre del cliente | Lucía |
| `{{2}}` | Número de pedido | BB-000123 |
| `{{3}}` | Enlace para dejar la reseña (Google Maps de la sede u otro) | https://g.page/r/ejemplo/review |

> Es la plantilla con más riesgo de que Meta la reclasifique como MARKETING (pedir reseñas se parece a
> promoción). El texto está escrito lo más neutro posible: un solo enlace, sin incentivos ni descuentos. Si la
> reclasifican, se puede aceptar la categoría (cuesta más por mensaje) o no enviarla por WhatsApp.

---

## Resumen para registrar

| # | Nombre | Variables | Cuándo |
|---|---|---|---|
| 1 | `pedido_confirmado` | 5 | Pedido *Confirmado* |
| 2 | `pago_confirmado` | 3 | Pago recibido |
| 3 | `recordatorio_entrega` | 4 | Antes de la entrega |
| 4 | `pedido_en_preparacion` | 2 | *En preparación* |
| 5 | `pedido_listo_o_en_camino` | 3 | *Listo* / *Despachado* |
| 6 | `pedido_entregado` | 2 | Entregado |
| 7 | `solicitud_resena` | 3 | Horas después de entregar |

## Qué falta del lado del código

Estas plantillas **todavía no se envían desde Bake OS**: `bot/meta.ts` hoy solo manda mensajes de texto libre
(dentro de la ventana de 24 h). Cuando Meta las apruebe hay que agregar el envío de plantillas
(`type: "template"` con el nombre, el idioma `es` y los parámetros en el mismo orden de `{{1}}…`) y decidir
qué cambio de estado dispara cada una. Se hace en cuanto estén aprobadas y se confirme qué disparadores quiere
el cliente.

# Plantillas de WhatsApp — Bake Brothers

> Generado desde `docs/plantillas-whatsapp.json` (la única fuente: se valida con `packages/domain/test/plantillasBake.test.ts`).
> No edites este archivo a mano: cambia el JSON y vuelve a generarlo.

**9 esenciales** (créalas la noche de la migración) y **3 opcionales** (pueden esperar). Todas son de categoría **UTILITY**, idioma **Español (`es`)**, formato de variables **numérico** ({{1}}, {{2}}…), solo texto: sin encabezado, sin pie y sin botones.

## Por qué hacen falta

WhatsApp solo deja escribir libremente dentro de las 24 h siguientes al último mensaje del cliente. Fuera de esa ventana el equipo, desde Conversaciones → *Elegir una plantilla*, solo puede enviar una plantilla **aprobada**. El panel las lee de Meta (no se escriben a mano) y pide cada variable con su ejemplo como guía. **Hoy se envían a mano desde el panel; ninguna se manda sola** (no hay disparadores automáticos todavía).

## Cómo crear cada una en Meta

1. business.facebook.com → **WhatsApp Manager** → la cuenta de WhatsApp del negocio → **Plantillas de mensajes** → **Crear plantilla**.
2. **Categoría:** Utilidad (*Utility*). **Nombre:** el de abajo, tal cual (minúsculas y guion bajo; **no se puede cambiar después**). **Idioma:** Español.
3. **Tipo:** solo texto (sin encabezado ni pie ni botones). **Cuerpo:** pega el texto exacto. Donde dice `{{1}}` Meta lo reconoce como variable.
4. **Tipo de variable:** *Número* (no «Nombre»). En **Ejemplos**, pega el valor de muestra de cada variable (la columna *Ejemplo*).
5. **Enviar**. La aprobación suele tardar minutos u horas. Si queda como *Marketing* en vez de *Utilidad*, se puede aceptar (cuesta más por mensaje) y seguir.

## Reglas de Meta que ya cumplen todos los textos (verificado por test)

- Ninguna empieza ni termina con una variable; ninguna tiene dos variables pegadas.
- Variables numeradas {{1}}…{{n}} sin saltos, cada una con ejemplo, sin saltos de línea dentro del ejemplo.
- Suficiente texto alrededor de las variables (al menos 3 palabras por variable) y menos de 1024 caracteres.
- Sin ofertas, descuentos ni promociones (cualquier giro promocional las reclasifica como Marketing). Tuteo peruano, sin voseo.

---

## Esenciales — crear la noche de la migración

### 1. `pedido_confirmado`

- **Categoría:** UTILITY · **Idioma:** Español (`es`) · **Variables:** 5
- **Cuándo se usa:** Apenas el pedido queda registrado (estado Confirmado) y han pasado más de 24 h desde el último mensaje del cliente, o para dejarle el resumen por escrito.

**Texto exacto (cópialo tal cual):**

```
Hola {{1}}, ¡gracias por tu pedido en Bake Brothers! 🧁

Tu pedido {{2}} quedó confirmado para el {{3}}. Lo {{4}}.
Total: S/ {{5}}.

Si necesitas cambiar algo, respóndenos por este chat.
```

| Variable | Qué lleva | Ejemplo (pégalo en Meta) |
|---|---|---|
| `{{1}}` | Nombre del cliente | Lucía |
| `{{2}}` | Número de pedido | BB-2500 |
| `{{3}}` | Día y hora de entrega | sábado 15 de noviembre a las 4:00 p. m. |
| `{{4}}` | Cómo se entrega (completa «Lo …») | recoges en nuestro local de Cedros |
| `{{5}}` | Total | 85.90 |

### 2. `pago_confirmado`

- **Categoría:** UTILITY · **Idioma:** Español (`es`) · **Variables:** 3
- **Cuándo se usa:** Cuando una persona confirma el pago del pedido (Yape, link de pago o transferencia).

**Texto exacto (cópialo tal cual):**

```
Hola {{1}}, ya recibimos tu pago de S/ {{2}} por el pedido {{3}}. ¡Gracias! 🙌

Tu pedido ya está en nuestra lista para prepararlo con cariño.
```

| Variable | Qué lleva | Ejemplo (pégalo en Meta) |
|---|---|---|
| `{{1}}` | Nombre del cliente | Lucía |
| `{{2}}` | Monto pagado | 85.90 |
| `{{3}}` | Número de pedido | BB-2500 |

### 3. `pago_pendiente`

- **Categoría:** UTILITY · **Idioma:** Español (`es`) · **Variables:** 3
- **Cuándo se usa:** Un pedido por pagar (delivery, o recojo con pago adelantado) sigue sin pago y la ventana de 24 h ya cerró.

**Texto exacto (cópialo tal cual):**

```
Hola {{1}}, tu pedido {{2}} sigue pendiente de pago por S/ {{3}}.

Cuando hayas pagado, envíanos la captura por este chat para confirmarlo y empezar a prepararlo.
```

| Variable | Qué lleva | Ejemplo (pégalo en Meta) |
|---|---|---|
| `{{1}}` | Nombre del cliente | Lucía |
| `{{2}}` | Número de pedido | BB-2500 |
| `{{3}}` | Total a pagar | 85.90 |

### 4. `envio_cotizado`

- **Categoría:** UTILITY · **Idioma:** Español (`es`) · **Variables:** 5
- **Cuándo se usa:** Una persona cotizó el delivery de un pedido y el cliente ya no está en la ventana de 24 h.

**Texto exacto (cópialo tal cual):**

```
Hola {{1}}, ya cotizamos el envío de tu pedido {{2}} a {{3}}: S/ {{4}}.

El total a pagar es S/ {{5}}. Respóndenos por este chat y te enviamos los datos de pago.
```

| Variable | Qué lleva | Ejemplo (pégalo en Meta) |
|---|---|---|
| `{{1}}` | Nombre del cliente | Lucía |
| `{{2}}` | Número de pedido | BB-2500 |
| `{{3}}` | Distrito de entrega | Surco |
| `{{4}}` | Costo del envío | 12.00 |
| `{{5}}` | Total con envío | 97.90 |

### 5. `pedido_listo_para_recoger`

- **Categoría:** UTILITY · **Idioma:** Español (`es`) · **Variables:** 4
- **Cuándo se usa:** El pedido pasa a Listo y el cliente lo recoge en el local.

**Texto exacto (cópialo tal cual):**

```
Hola {{1}}, tu pedido {{2}} ya está listo para recoger en nuestro local de {{3}}. 🎉

Dirección: {{4}}.

Te esperamos.
```

| Variable | Qué lleva | Ejemplo (pégalo en Meta) |
|---|---|---|
| `{{1}}` | Nombre del cliente | Lucía |
| `{{2}}` | Número de pedido | BB-2500 |
| `{{3}}` | Nombre del local | Cedros |
| `{{4}}` | Dirección del local | Av. Alameda Los Horizontes 820, Chorrillos |

### 6. `pedido_en_camino`

- **Categoría:** UTILITY · **Idioma:** Español (`es`) · **Variables:** 2
- **Cuándo se usa:** El pedido de delivery sale del local (estado Despachado).

**Texto exacto (cópialo tal cual):**

```
Hola {{1}}, tu pedido {{2}} ya va en camino a tu dirección y llegará en unos minutos. 🛵

Si necesitas algo, escríbenos por este chat.
```

| Variable | Qué lleva | Ejemplo (pégalo en Meta) |
|---|---|---|
| `{{1}}` | Nombre del cliente | Lucía |
| `{{2}}` | Número de pedido | BB-2500 |

### 7. `recordatorio_entrega`

- **Categoría:** UTILITY · **Idioma:** Español (`es`) · **Variables:** 4
- **Cuándo se usa:** El día anterior o la mañana de la entrega.

**Texto exacto (cópialo tal cual):**

```
Hola {{1}}, te recordamos que tu pedido {{2}} está programado para el {{3}}. 🗓️

Detalle: {{4}}.

Si algo cambió, avísanos por este chat y lo vemos juntos.
```

| Variable | Qué lleva | Ejemplo (pégalo en Meta) |
|---|---|---|
| `{{1}}` | Nombre del cliente | Lucía |
| `{{2}}` | Número de pedido | BB-2500 |
| `{{3}}` | Día y hora de entrega | sábado 15 de noviembre a las 4:00 p. m. |
| `{{4}}` | Recojo (local) o dirección de delivery | recojo en el local de Cedros |

### 8. `seguimiento_consulta`

- **Categoría:** UTILITY · **Idioma:** Español (`es`) · **Variables:** 2
- **Cuándo se usa:** Una persona quiere retomar una conversación cuya ventana de 24 h ya cerró (por ejemplo, el cliente pidió una cotización y nunca recibió respuesta). Al contestar el cliente, la ventana se vuelve a abrir.

**Texto exacto (cópialo tal cual):**

```
Hola {{1}}, te escribimos de Bake Brothers por tu consulta sobre {{2}}.

Cuando quieras, respóndenos por este chat y seguimos con tu pedido.
```

| Variable | Qué lleva | Ejemplo (pégalo en Meta) |
|---|---|---|
| `{{1}}` | Nombre del cliente | Lucía |
| `{{2}}` | Tema de la consulta (corto) | una torta de chocolate para el sábado |

> ⚠ Es la que más riesgo tiene de que Meta la reclasifique como MARKETING por no ligarse a un pedido ya hecho. Si ocurre, se acepta la categoría (cuesta más por mensaje) o se retoma el contacto por llamada.

### 9. `pedido_entregado`

- **Categoría:** UTILITY · **Idioma:** Español (`es`) · **Variables:** 2
- **Cuándo se usa:** Al cerrar el pedido como entregado.

**Texto exacto (cópialo tal cual):**

```
Hola {{1}}, tu pedido {{2}} ya fue entregado. ✅

¡Gracias por elegir Bake Brothers! Esperamos que lo disfrutes mucho. 🧁
```

| Variable | Qué lleva | Ejemplo (pégalo en Meta) |
|---|---|---|
| `{{1}}` | Nombre del cliente | Lucía |
| `{{2}}` | Número de pedido | BB-2500 |

---

## Opcionales — después del lanzamiento

### 10. `pedido_en_preparacion`

- **Categoría:** UTILITY · **Idioma:** Español (`es`) · **Variables:** 2
- **Cuándo se usa:** Cuando el pedido pasa a En preparación. Útil pero no urgente: se puede crear después del lanzamiento.

**Texto exacto (cópialo tal cual):**

```
Hola {{1}}, ya estamos preparando tu pedido {{2}}. 👩‍🍳

Lo hacemos con mucho cariño y te avisaremos por aquí apenas esté listo.
```

| Variable | Qué lleva | Ejemplo (pégalo en Meta) |
|---|---|---|
| `{{1}}` | Nombre del cliente | Lucía |
| `{{2}}` | Número de pedido | BB-2500 |

### 11. `confirmar_detalle_pedido`

- **Categoría:** UTILITY · **Idioma:** Español (`es`) · **Variables:** 3
- **Cuándo se usa:** Hace falta confirmar algo antes de preparar un pedido (un producto agotado, una hora, una dirección) y la ventana ya cerró.

**Texto exacto (cópialo tal cual):**

```
Hola {{1}}, necesitamos confirmar un detalle de tu pedido {{2}} antes de prepararlo: {{3}}

¿Nos ayudas respondiendo por este chat?
```

| Variable | Qué lleva | Ejemplo (pégalo en Meta) |
|---|---|---|
| `{{1}}` | Nombre del cliente | Lucía |
| `{{2}}` | Número de pedido | BB-2500 |
| `{{3}}` | La pregunta concreta | el sabor de la torta que prefieres si no hay carrot cake. |

> ⚠ La variable {{3}} es una frase abierta: Meta a veces la rechaza por eso. Si la rechazan, no insistas con esta: se escribe en la ventana libre o se llama.

### 12. `solicitud_resena`

- **Categoría:** UTILITY · **Idioma:** Español (`es`) · **Variables:** 3
- **Cuándo se usa:** Unas horas después de la entrega, una sola vez por pedido. Dejarla para después del lanzamiento.

**Texto exacto (cópialo tal cual):**

```
Hola {{1}}, ¿cómo estuvo tu pedido {{2}}? 💛

Tu opinión nos ayuda a seguir mejorando. Cuéntanos tu experiencia aquí: {{3}}

¡Gracias por ayudarnos a crecer!
```

| Variable | Qué lleva | Ejemplo (pégalo en Meta) |
|---|---|---|
| `{{1}}` | Nombre del cliente | Lucía |
| `{{2}}` | Número de pedido | BB-2500 |
| `{{3}}` | Enlace para dejar la reseña | https://g.page/r/ejemplo/review |

> ⚠ Pedir reseñas se parece a promoción: es la que más probablemente reclasifiquen como MARKETING. Por eso no es esencial para el lanzamiento.

---

## Resumen

| # | Nombre | Variables | Grupo |
|---|---|---|---|
| 1 | `pedido_confirmado` | 5 | esencial |
| 2 | `pago_confirmado` | 3 | esencial |
| 3 | `pago_pendiente` | 3 | esencial |
| 4 | `envio_cotizado` | 5 | esencial |
| 5 | `pedido_listo_para_recoger` | 4 | esencial |
| 6 | `pedido_en_camino` | 2 | esencial |
| 7 | `recordatorio_entrega` | 4 | esencial |
| 8 | `seguimiento_consulta` | 2 | esencial |
| 9 | `pedido_entregado` | 2 | esencial |
| 10 | `pedido_en_preparacion` | 2 | opcional |
| 11 | `confirmar_detalle_pedido` | 3 | opcional |
| 12 | `solicitud_resena` | 3 | opcional |

## Después de la aprobación

En Conversaciones, abre un chat con la ventana cerrada → **Elegir una plantilla**: deben aparecer todas las aprobadas. Prueba una enviándola a tu propio número y confirma que llega con el texto completo.

# ManyChat: campañas de comentarios en Instagram y Facebook

> **Plan B, no vigente (2026-11-14).** Se decidió hacer las respuestas automáticas **dentro de Bake OS** (sin otra
> herramienta ni mensualidad): ver `docs/respuestas-automaticas-instagram.md`. Esta guía queda solo por si algún día se
> prefiere ManyChat.

> Objetivo: que alguien comente una palabra clave en un reel (por ejemplo **ALFAJOR**), reciba un DM automático con la
> promo y un botón que lo lleva al **WhatsApp de Bake Brothers**, donde pide como siempre. El pedido queda marcado con la
> campaña y se ve en Bake OS → **Origen de clientes → Por campaña**.

## 1. Cómo encaja con lo que ya existe

```
Reel en Instagram ── comenta «ALFAJOR» ──► ManyChat responde el comentario y manda un DM
                                                     │
                                       botón «Pedir por WhatsApp» (link de Bake OS)
                                                     ▼
                         WhatsApp de atención: «Hola Bake Brothers 👋 … (ref: ig-alfajor)»
                                                     │
                     el bot (o una persona) toma el pedido ──► orders.campana = 'ig-alfajor'
                                                     ▼
                         Bake OS → Origen de clientes → Por campaña: «Instagram · alfajor»
```

- **ManyChat solo en Instagram y Messenger.** WhatsApp lo sigue atendiendo el bot propio en Bake OS: los dos no pueden
  responder el mismo número. **No se conecta WhatsApp en ManyChat.**
- **El link lo arma Bake OS** (Origen de clientes → «Crea el link de WhatsApp de una campaña»). No se escribe a mano: así el
  formato de la referencia es siempre el que lee el bot (`packages/domain/src/campana.ts`).
- **Consentimiento:** que alguien escriba por Instagram **no** es permiso para mandarle promociones por WhatsApp. Ese permiso
  lo pide el bot después del primer pedido (`puedeRecibirEnvioMasivo`). Los contactos de ManyChat no se importan como
  clientes de WhatsApp.
- Bake OS también recibe los mensajes de Instagram y Messenger por su webhook de Meta, pero solo los guarda (tabla
  `eventos_meta_sin_procesar`); no contesta nada. No choca con ManyChat.

## 2. Antes de empezar (lo hace el cliente o Mathias)

- [ ] Cuenta de Instagram **profesional** (empresa o creador) vinculada a la página de Facebook de Bake Brothers.
- [ ] En Instagram → Configuración → Mensajes → **Permitir acceso a los mensajes** (herramientas conectadas). Sin esto,
      ManyChat no puede mandar DMs.
- [ ] Cuenta de ManyChat conectada a **Instagram** y a la **página de Facebook**, con un usuario del equipo como dueño
      (no la cuenta personal de alguien que se puede ir).
- [ ] **Plan:** el gratuito alcanza para probar, pero tiene un límite bajo de contactos y un reel viral lo agota el
      primer día. Para campañas reales hace falta el plan **Pro**. Revisar el precio y el límite de contactos vigentes
      en manychat.com/pricing antes de contratar (cambiaron en 2026).

## 3. Flujo base: «comenta la palabra y te mando el link»

En ManyChat: **Automation → New Automation → Instagram → «User comments on your Post or Reel»**.

| Paso | Qué se configura |
|---|---|
| Disparador | Publicación: el reel de la campaña (o «cualquier publicación» si la palabra se usa en varias). Palabra clave: **ALFAJOR** (agregar variantes: `alfajor`, `alfajores`, `ALFAJORES`). |
| Respuesta pública al comentario | Activar y poner 3 o 4 variantes para que no se vea robótico (ver textos abajo). |
| DM (mensaje 1) | Texto + foto del producto + botón URL **«Pedir por WhatsApp»** con el link generado en Bake OS. |
| Botón extra (opcional) | **«Ver el menú»** → `https://www.bakebrothers.pe/menu?utm_source=instagram&utm_campaign=alfajor` (la web agrega la misma referencia si después escribe por WhatsApp desde ahí). |

**Respuestas públicas (variantes):**
- «¡Listo! Te escribimos por DM 🍪»
- «Revisa tus mensajes, ahí te dejamos todo 💛»
- «¡Te mandamos la info por interno! 📩»
- «Ya te llegó un DM con los detalles 😉»

**DM (ejemplo para ALFAJOR):**
> ¡Hola! 🍪 Gracias por escribirnos.
> Nuestros alfajores salen en caja y también por unidad, en los dos locales (Cedros y Santa Marina).
> Toca el botón y pídelos por WhatsApp: te confirmamos disponibilidad y te ayudamos con tu pedido.
>
> [Pedir por WhatsApp] [Ver el menú]

Reglas para los textos (las mismas que sigue el bot):
- **No poner precios** en el DM salvo que sea una promo aprobada con fecha de fin; los precios cambian y el DM se queda.
- **No prometer stock ni horas exactas.** «Te confirmamos disponibilidad» en vez de «hay stock».
- **Delivery sin monto:** «el envío se cotiza al momento».
- Tono cercano, con 1 o 2 emojis, igual que los reels.

## 4. Otros disparadores útiles (mismo link, misma campaña)

1. **Respuesta a una historia** con la palabra clave (Automation → «User replies to your Story»): para historias con
   «responde ALFAJOR».
2. **DM directo con la palabra** (Automation → «User sends a message» → keyword): por si la persona escribe la palabra al
   DM en vez de comentarla.
3. **Facebook:** los mismos flujos sobre la página de Facebook (comentarios en reels y publicaciones). Generar el link con la
   red **Facebook** en Bake OS para que la campaña se vea como «Facebook · alfajor» y se pueda comparar con Instagram.

## 5. Campañas sugeridas para empezar

Salen del análisis de los reels (agosto–noviembre de 2026): el humor de mostrador es lo que más alcance trae y la promo
suelta casi no circula. La idea es **poner la palabra clave al final de los reels de humor**, no hacer reels de promo.

| Palabra | Red | Cuándo |
|---|---|---|
| ALFAJOR | Instagram | Sketch de mostrador + «comenta ALFAJOR y te mando la promo». |
| EMPANADA | Instagram | Mismo formato, para la línea de empanadas. |
| TORTA | Instagram y Facebook | Fechas especiales (cumpleaños, Navidad): lleva a WhatsApp para encargos. |
| NAVIDAD | Instagram | Campaña de temporada (diciembre). |

Una palabra = una campaña. Si una campaña se repite en otro mes, usar otro nombre (`navidad-2026`) para no mezclar
resultados.

## 6. Cómo se mide

- **Bake OS → Origen de clientes → Por campaña:** pedidos e ingresos de cada referencia (`Instagram · alfajor`). Se filtra
  por fechas.
- **ManyChat:** cuántos comentaron y cuántos tocaron el botón. Comparar con los pedidos de Bake OS da la conversión real.
- Un pedido queda con campaña **solo si la persona envía el mensaje con la referencia**. Si la borra o escribe aparte, el
  pedido llega igual pero sin campaña: los números de Bake OS son un piso, no el total.

## 7. Pendiente / fase siguiente

- **Leer los mensajes de Instagram y Messenger en Bake OS** (hoy solo se guardan crudos): no hace falta para estas campañas.
- **Anuncios «clic a WhatsApp»** de Meta (`orders.ctwa_clid`): otra fuente de campañas, todavía sin capturar.

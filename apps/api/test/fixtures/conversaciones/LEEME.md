# Conversaciones de prueba del bot

Cada archivo `NN-nombre.json` es una conversación: **qué escribe el cliente** y **qué se espera que haga el bot**.
Sirven para comprobar el bot con Claude real el día del encendido (y después de cualquier cambio del prompt o del catálogo).
Hay 20 casos sintéticos (saludo, precios, agotados, combos, recojo y delivery, catering, alergias, reclamos, fuera de
horario, corte de las 8:00 p. m., datos de cobro ausentes) y una plantilla para sumar conversaciones reales.

## Cómo sumar una conversación real

1. Copia `_plantilla.json` a un archivo nuevo: `real-001-lo-que-pasa.json` (el nombre del archivo debe ser igual al `id`).
2. Pega en `turnos` **solo los mensajes del cliente**, en orden y tal cual (con sus faltas). El bot responde solo.
3. Cambia `contexto.ahora` a la hora de Lima en que ocurrió (con `-05:00`) y `contexto.sede` si fue en un local
   (`"Cedros"` / `"Santa Marina"`) o déjalo en `null` (número del bot, que pregunta el local).
4. En `esperado` pon **lo que SÍ debía pasar**, solo lo que importa (puedes dejar el resto fuera):
   - `estadoFinal`: `"activa"` (sigue el bot) o `"escalada"` (debió pasar a una persona).
   - `pedidoCreado`: `true` / `false`.
   - `herramientas.incluye` / `noIncluye`: `consultarPrecio`, `consultarDisponibilidad`, `consultarCombo`, `consultarReglasCatering`,
     `evaluarSemaforoCateringPedido`, `listarCatalogo`, `crearPedido`, `escalarAHumano`.
   - `textoContiene` / `textoNoContiene`: palabras que debe / no debe decir el bot.
   - `textoContieneRegex` / `textoNoContieneRegex`: expresiones regulares (sin distinguir mayúsculas), p. ej. `"9[.,]90"` para un precio.
5. `preparacion` (opcional) deja la base como estaba ese día, **dentro de una transacción que se revierte**:
   `stock_agotado {slug, tamano?, sede}`, `ocultar_producto {slug}`, `ocultar_tamano {slug, tamano}`, `precio_tamano {slug, tamano, precio}`.
6. Pon `"origen": "real"`. **Quita nombres y teléfonos reales** antes de guardarla (usa datos inventados: Ana Torres, 999000111).

Revisa el formato sin gastar nada: `pnpm --filter @bakebrothers/api exec vitest run test/cerebroFixtures.test.ts`.

## Cómo correrlas con Claude real (cuando haya saldo)

Necesita una base con el esquema (copia local o de pruebas, **no la real**) y la clave de Anthropic en el entorno:

```bash
cd apps/api
RUN_FIXTURES=1 VER_RESPUESTAS=1 DATABASE_URL=... ANTHROPIC_API_KEY=... pnpm exec vitest run test/cerebroFixtures.test.ts
```

- `VER_RESPUESTAS=1` imprime la conversación completa de cada caso (léelas: una expectativa puede pasar y la respuesta sonar mal).
- `FILTRO=18` corre solo los archivos que empiezan con ese texto.
- Cada caso corre dentro de una transacción que se revierte: no queda ningún pedido ni cambio.
- El caso 19 requiere `DATOS_PAGO` **sin configurar** en ese entorno.
- Costo aproximado: 20 casos, entre 1 y 3 turnos cada uno, con herramientas: unas 100 llamadas al modelo.
- Un modelo no es determinista: si un caso falla una vez, córrelo otra vez antes de tocar nada; si falla dos de tres, es real.

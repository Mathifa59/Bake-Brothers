# Cambiar el bot de Sonnet a Haiku

Preparado el 2026-11-09 (rama `feature/modelo-bot-configurable`). **Nada se probó con Claude real** (no había saldo):
el cambio es solo de configuración y está cubierto por tests con el SDK mockeado. Antes de dejar Haiku en producción
hay que volver a correr los casos del bot (abajo).

## Cómo se cambia

Variables de entorno de la API (Coolify), sin tocar código; vacías = Sonnet, que es lo probado hoy:

| Variable | Qué controla | Por defecto |
|---|---|---|
| `BOT_MODELO` | la conversación del bot (`bot/cerebro.ts`) | `claude-sonnet-5` |
| `BOT_MODELO_CAPTURAS` | la lectura de capturas de pago (`bot/capturaPago.ts`) | `claude-sonnet-5` |

Para pasar la conversación a Haiku: `BOT_MODELO=claude-haiku-5-5` y reiniciar la API. **Las capturas de pago quedan en
Sonnet a propósito** (es dinero; que la conversación sea más barata no debería hacer menos fiable la lectura de un
comprobante). Si se quiere Haiku también ahí, se pone `BOT_MODELO_CAPTURAS` y se prueba aparte con
`capturaPagoReal.test.ts`.

El modelo en uso queda en el log de arranque de la API («Modelos de Claude del bot»). El valor no se valida contra una
lista (los nombres cambian): si tiene un error de tipeo, la llamada falla y la conversación pasa a una persona, como con
cualquier otra falla del modelo. **Comprobar el nombre exacto del modelo contra la documentación de Anthropic antes de
cargarlo.**

Ojo: el **Simulador** del panel usa el mismo `evaluarTurno`, así que cambiar la variable también cambia el modelo que ve
el admin ahí.

## Qué volver a probar con Claude real (cuando haya saldo)

Contra una base de pruebas, con la clave en el entorno y el modelo a probar:

```bash
cd apps/api
BOT_MODELO=claude-haiku-5-5 DATABASE_URL=... ANTHROPIC_API_KEY=... npx vitest run \
  test/cerebro.test.ts test/cerebroTamano.test.ts test/cerebroAgotadoLocal.test.ts test/cerebroContexto.test.ts
```

Lo que no depende del modelo ya está fijado por código y no cambia con Haiku: las alergias se interceptan por regex
antes del modelo, el semáforo de catering fuerza la escalada, el límite de 6 vueltas, el catering siempre a una
persona, el gate de pago y de stock. Lo que SÍ puede cambiar con un modelo más chico y hay que mirar con ojos:
1. Que siga las reglas del prompt (agotados por local con dirección, tamaños, genéricos → `listarCatalogo`, tuteo).
2. Que no invente precios ni productos (siempre debe llamar a las herramientas).
3. Que confirme pedidos con todos los datos (nombre, teléfono, fecha, hora, local) y no pida de más.
4. Que derive bien (reclamos, tortas personalizadas, alergias) sin escalar de más.
5. Latencia y costo por conversación frente a Sonnet (`VER_RESPUESTAS=1` en `cerebroAgotadoLocal` imprime las respuestas).

Si algo falla, volver es borrar `BOT_MODELO` y reiniciar.

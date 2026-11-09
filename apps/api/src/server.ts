import { buildApp } from './app.js'
import { env } from './env.js'
import { resolverModelo } from './bot/modelos.js'

const app = await buildApp()

try {
  await app.listen({ port: env.PORT, host: '0.0.0.0' })
  // Qué modelo atiende a los clientes (se cambia con BOT_MODELO, sin tocar código): queda en el log de arranque.
  app.log.info(
    { modeloBot: resolverModelo(env.BOT_MODELO), modeloCapturas: resolverModelo(env.BOT_MODELO_CAPTURAS) },
    'Modelos de Claude del bot'
  )
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

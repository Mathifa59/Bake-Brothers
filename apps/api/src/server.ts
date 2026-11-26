import { buildApp } from './app.js'
import { env } from './env.js'
import { resolverModelo } from './bot/modelos.js'
import { avisosDeArranque } from './avisosDeArranque.js'
import { actualizacionAutomaticaActiva, iniciarActualizacionAutomatica } from './mifact/actualizacionAutomatica.js'

const app = await buildApp()

try {
  await app.listen({ port: env.PORT, host: '0.0.0.0' })
  // Qué modelo atiende a los clientes (se cambia con BOT_MODELO, sin tocar código): queda en el log de arranque.
  app.log.info(
    { modeloBot: resolverModelo(env.BOT_MODELO), modeloCapturas: resolverModelo(env.BOT_MODELO_CAPTURAS) },
    'Modelos de Claude del bot'
  )
  // Lo que falta y no impide arrancar: queda en el log para que en Coolify se vea de un vistazo qué función está apagada.
  if (env.NODE_ENV === 'production') {
    for (const a of avisosDeArranque(process.env)) app.log.warn({ variable: a.variable }, `Sin ${a.variable}: ${a.consecuencia}`)
  }
  // Boletas «En proceso» de días anteriores: se consultan solas a Mifact (se apaga con MIFACT_ACTUALIZACION_AUTOMATICA=false).
  if (actualizacionAutomaticaActiva(process.env)) iniciarActualizacionAutomatica(env.DEFAULT_TENANT_SLUG, app.log)
  else app.log.info('Actualización automática de comprobantes apagada (MIFACT_ACTUALIZACION_AUTOMATICA=false)')
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

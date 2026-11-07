// La base real arranca con el bot APAGADO (migración 0040: así se lanza). Los tests que prueban al bot de verdad
// (cerebro, webhook, campañas, capturas…) lo necesitan encendido, así que antes de cada archivo de test se enciende
// el interruptor en la base de pruebas. Los tests de «bot apagado» NO tocan la base: mockean
// repositories/configuracionBotRepo para controlar la configuración sin pelearse con los demás archivos que
// corren en paralelo sobre la misma base.
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const url = process.env.DATABASE_URL
if (url && url !== DATABASE_URL_PLACEHOLDER) {
  const pool = new pg.Pool({ connectionString: url, max: 1 })
  try {
    await pool.query(`update configuracion_bot set bot_activo = true where id and bot_activo = false`)
  } catch {
    // Sin la tabla (base de pruebas anterior a la 0040) no hay interruptor que encender.
  } finally {
    await pool.end()
  }
}

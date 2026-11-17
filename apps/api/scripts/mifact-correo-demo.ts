/**
 * Manda por correo (SendMailInvoice de Mifact) un comprobante que ya emitiste en el DEMO, a la dirección que indiques.
 *
 *   pnpm mifact:correo -- --comprobante FHL2-00000001 --correo alguien@ejemplo.pe
 *
 * Mifact envía un correo REAL con el PDF a esa dirección: por eso la dirección es siempre un argumento explícito, nunca un
 * valor por defecto. Se niega a correr si la base no es local o si el emisor del comprobante apunta a producción.
 */
import { parseArgs } from 'node:util'
import { pool } from '../src/db.js'
import { leerConfigEmisor } from '../src/mifact/config.js'
import { enviarCorreoComprobante } from '../src/services/comprobantes.js'

const { values } = parseArgs({ options: { comprobante: { type: 'string' }, correo: { type: 'string' } } })
const fallar = (m: string): never => {
  console.error(`NO SE ENVIÓ: ${m}`)
  process.exit(1)
}

const coincide = /^([BF][A-Z0-9]{3})-(\d{1,8})$/.exec(values.comprobante ?? '')
if (!coincide || !values.correo) fallar('uso: --comprobante SERIE-CORRELATIVO (p. ej. FHL2-00000001) --correo direccion@ejemplo.pe')
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? '')) fallar('DATABASE_URL no es una base local.')

try {
  const { rows } = await pool.query(
    `select c.id, c.tenant_id, c.emisor, c.entorno from comprobantes c where c.serie = $1 and c.correlativo = $2`,
    [coincide![1], Number(coincide![2])]
  )
  if (rows.length !== 1) fallar(`no encontré exactamente un comprobante ${values.comprobante} en esta base (encontrados: ${rows.length}).`)
  const fila = rows[0]
  const cfg = leerConfigEmisor(fila.emisor)
  if (!cfg.ok) fallar(`falta configurar ${fila.emisor}: ${cfg.faltan.join(', ')}`)
  else if (cfg.config.entorno !== 'demo' || fila.entorno !== 'demo') fallar('este script solo envía comprobantes del DEMO.')

  const c = await enviarCorreoComprobante(pool, fila.tenant_id, fila.id, values.correo!)
  console.log(`OK — ${c.numero} (${c.tipo}, ${c.estadoLegible}): Mifact envió el correo a ${c.correoEnviadoA}`)
} catch (err) {
  console.error('ERROR:', err instanceof Error ? `${err.name}: ${err.message}` : err)
  process.exitCode = 1
} finally {
  await pool.end()
}

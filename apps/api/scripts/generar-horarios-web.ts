/**
 * Regenera `apps/web/src/config/horarios.generated.json` (renglones de la web y JSON-LD) desde la tabla `sedes_horarios`.
 * Se corre después de cambiar un horario en la tabla (con DATABASE_URL apuntando a la base real), y el resultado se
 * commitea y se publica con el siguiente deploy de la web. Desde apps/api:
 *
 *   pnpm horarios:web
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { pool } from '../src/db.js'
import { generarHorariosWeb, serializarHorariosWeb } from '../src/horariosWeb.js'

const destino = fileURLToPath(new URL('../../web/src/config/horarios.generated.json', import.meta.url))
const client = await pool.connect()
try {
  const horarios = await generarHorariosWeb(client)
  const nombres = Object.keys(horarios.locales)
  if (nombres.length === 0 || nombres.some((n) => horarios.locales[n].renglones.length === 0)) {
    throw new Error(`Algún local no tiene horario cargado en sedes_horarios (${nombres.join(', ') || 'ningún local'}): no se escribe nada.`)
  }
  writeFileSync(destino, serializarHorariosWeb(horarios), 'utf8')
  console.log(`Escrito ${destino}`)
  for (const n of nombres) console.log(`  ${n}: ${horarios.locales[n].renglones.map((r) => `${r.dias} ${r.horas}`).join(' · ')}`)
} finally {
  client.release()
  await pool.end()
}

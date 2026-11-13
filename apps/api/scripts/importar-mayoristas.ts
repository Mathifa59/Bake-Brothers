/**
 * Importa los mayoristas de la hoja DATOS de la plantilla de pedidos (columnas «CLIENTE MAYORISTA» y «TAMAÑO HABITUAL»,
 * GR / MED) como clientes con es_mayorista = true y su tamaño habitual, SIN teléfono (la hoja no lo trae).
 *
 * El archivo es un CSV de dos columnas (nombre, tamano) que se saca de la hoja; tiene nombres de clientes reales, así que
 * NUNCA va al repo (vive en la carpeta de datos privados). Por defecto es un ENSAYO: muestra qué haría y no escribe nada.
 * Con --aplicar escribe. Es idempotente (compara por nombre) y nunca pisa un tamaño habitual ya cargado. Desde apps/api,
 * con DATABASE_URL en el entorno:
 *
 *   pnpm mayoristas:importar -- --archivo "C:\ruta\privada\mayoristas_hoja_DATOS.csv"            (ensayo)
 *   pnpm mayoristas:importar -- --archivo "C:\ruta\privada\mayoristas_hoja_DATOS.csv" --aplicar  (escribe)
 */
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { pool, tenantPorSlug } from '../src/db.js'
import { importarMayoristas, leerCsvMayoristas } from '../src/services/importarMayoristas.js'

const { values } = parseArgs({ options: { archivo: { type: 'string' }, aplicar: { type: 'boolean', default: false } } })
if (!values.archivo) {
  console.error('Uso: --archivo <ruta del CSV con columnas nombre,tamano> [--aplicar]')
  process.exit(1)
}

const client = await pool.connect()
try {
  const tenant = await tenantPorSlug('bake-brothers')
  if (!tenant) throw new Error('No encontré el negocio «bake-brothers»')
  const filas = leerCsvMayoristas(readFileSync(values.archivo, 'utf8'))
  await client.query('begin')
  const r = await importarMayoristas(client, tenant.id, filas, { aplicar: values.aplicar })
  await client.query(values.aplicar ? 'commit' : 'rollback')

  console.log(`${values.aplicar ? 'APLICADO' : 'ENSAYO (no se escribió nada)'} — ${filas.length} filas en el archivo`)
  console.log(`  a crear: ${r.creados.length}`)
  console.log(`  ya existían: ${r.yaExistian.length}`)
  console.log(`  tamaño completado: ${r.tamanoCompletado.length}`)
  const aviso = (titulo: string, lista: unknown[]) => lista.length && console.log(`  ⚠ ${titulo}:`, JSON.stringify(lista))
  aviso('conflictos de tamaño (no se tocaron)', r.conflictosDeTamano)
  aviso('repetidas en la hoja (se usó la primera)', r.repetidasEnLaHoja)
  aviso('filas inválidas (no se importaron)', r.invalidas)
  aviso('coinciden con clientes NO mayoristas', r.coincidenConClientesNoMayoristas)
} catch (err) {
  await client.query('rollback').catch(() => undefined)
  console.error('No se pudo importar:', err instanceof Error ? err.message : err)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}

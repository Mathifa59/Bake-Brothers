// Chequeo estático de la regla fija del proyecto (CLAUDE.md, al inicio): nunca se borra una base, una tabla ni un esquema,
// ni siquiera en bases locales. Falla (código 1) si encuentra ese tipo de borrado en el código del repo: migraciones,
// scripts, pruebas, package.json, SQL, PowerShell y shell. Se corre con `node scripts/chequeo-sin-drop.mjs` y forma parte
// de `pnpm test`. El guardia que actúa EN EJECUCIÓN durante las pruebas está en apps/api/test/sinDrop.ts.
//
// Excepciones (todas explicadas; agregar una nueva exige justificarla aquí y en la revisión):
//  · migraciones 0004, 0005 y 0007: son HISTÓRICAS, ya están aplicadas en el Supabase real (retiraron tablas que dejaron de
//    usarse cuando el proyecto dejó de ser multi-tenant). No se pueden reescribir; ninguna migración nueva puede borrar.
//  · apps/api/test/busquedaTexto.test.ts: es un texto de inyección SQL que se manda como DATO a la búsqueda, nunca como SQL.
//  · apps/api/test/sinDrop.test.ts: la prueba del propio guardia; contiene esos textos para comprobar que se RECHAZAN.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const PATRON = new RegExp(['dr', 'op\\s+(data', 'base|ta', 'ble|sche', 'ma)\\b'].join(''), 'i') // armado en partes: este archivo no se marca a sí mismo
const EXTENSIONES = new Set(['.sql', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.ps1', '.sh', '.bat', '.cmd', '.yml', '.yaml'])
const IGNORAR_DIRS = new Set(['node_modules', 'dist', '.git', '.vercel', 'coverage', 'imagenes', 'disenos'])
const EXCEPCIONES = new Set([
  'apps/api/migrations/0004_rediseno_alcance.sql',
  'apps/api/migrations/0005_retira_delivery_zones.sql',
  'apps/api/migrations/0007_catering_items.sql',
  'apps/api/test/busquedaTexto.test.ts',
  'apps/api/test/sinDrop.test.ts',
])

function* archivos(dir) {
  for (const nombre of readdirSync(dir)) {
    if (IGNORAR_DIRS.has(nombre)) continue
    const ruta = join(dir, nombre)
    const st = statSync(ruta)
    if (st.isDirectory()) yield* archivos(ruta)
    else if (EXTENSIONES.has(nombre.slice(nombre.lastIndexOf('.')).toLowerCase())) yield ruta
  }
}

const hallazgos = []
for (const ruta of archivos(RAIZ)) {
  const rel = relative(RAIZ, ruta).split(sep).join('/')
  if (EXCEPCIONES.has(rel)) continue
  if (rel.endsWith('package-lock.json') || rel.endsWith('pnpm-lock.yaml')) continue
  const lineas = readFileSync(ruta, 'utf8').split(/\r?\n/)
  lineas.forEach((linea, i) => {
    if (PATRON.test(linea)) hallazgos.push(`${rel}:${i + 1}: ${linea.trim().slice(0, 120)}`)
  })
}

if (hallazgos.length > 0) {
  console.error('Regla del proyecto violada: nunca se borra una base, una tabla ni un esquema (ni en bases locales).')
  console.error('Usa una base nueva o ALTER. Encontrado en:')
  for (const h of hallazgos) console.error('  ' + h)
  process.exit(1)
}
console.log('chequeo-sin-drop: OK (ninguna base, tabla ni esquema se borra en el código del repo).')

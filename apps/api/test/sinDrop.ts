// Regla fija del proyecto (CLAUDE.md, al inicio): NUNCA se borra una base, una tabla ni un esquema, ni siquiera en bases
// locales de prueba. Para empezar de cero se crea una base NUEVA; para cambiar una tabla se usa ALTER.
//
// Este archivo se carga antes de cada archivo de test (setupFiles) y hace cumplir la regla EN EJECUCIÓN: cualquier
// consulta que pase por `pg` (Pool o Client) y contenga uno de esos tres borrados se rechaza con un error, sin llegar
// a la base. (Borrar un trigger, una política o una función sí se permite: no destruye datos.)
//
// El chequeo estático del código (migraciones, scripts, pruebas) vive en scripts/chequeo-sin-drop.mjs.
import pg from 'pg'

const PROHIBIDO = /\bdrop\s+(database|table|schema)\b/i

/** true si el SQL borra una base, una tabla o un esquema. */
export function esBorradoProhibido(sql: unknown): boolean {
  return typeof sql === 'string' && PROHIBIDO.test(sql)
}

export const MENSAJE_BORRADO_PROHIBIDO =
  'Regla del proyecto: nunca se borra una base, una tabla ni un esquema, ni en bases locales. Usa una base nueva o ALTER.'

const MARCA = Symbol.for('bakebrothers.sinDrop')

type Cliente = { query: (...args: unknown[]) => unknown; [MARCA]?: boolean }
const proto = pg.Client.prototype as unknown as Cliente

if (!proto[MARCA]) {
  const original = proto.query
  proto.query = function (this: unknown, ...args: unknown[]) {
    const primero = args[0] as string | { text?: string } | undefined
    const texto = typeof primero === 'string' ? primero : primero?.text
    if (esBorradoProhibido(texto)) {
      const error = new Error(MENSAJE_BORRADO_PROHIBIDO)
      // pg-pool llama a client.query con callback; el uso con promesa devuelve una promesa rechazada.
      const ultimo = args[args.length - 1]
      if (typeof ultimo === 'function') {
        process.nextTick(() => (ultimo as (e: Error) => void)(error))
        return undefined
      }
      return Promise.reject(error)
    }
    return original.apply(this, args)
  }
  proto[MARCA] = true
}

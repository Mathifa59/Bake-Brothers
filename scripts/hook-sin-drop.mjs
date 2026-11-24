// Hook PreToolUse de Claude Code: bloquea el borrado de bases, tablas y esquemas (regla fija del proyecto, ver CLAUDE.md).
// Recibe por la entrada estándar el JSON de la llamada a la herramienta; si en cualquier texto de sus parámetros aparece
// uno de esos tres borrados, responde con código 2 y el motivo, y la herramienta NO se ejecuta.
// Borrar un trigger, una política, una función o un índice sigue permitido.
import { readFileSync } from 'node:fs'

const PATRON = new RegExp(['dr', 'op\\s+(data', 'base|ta', 'ble|sche', 'ma)\\b'].join(''), 'i') // armado en partes: este archivo no se bloquea a sí mismo

let evento
try {
  evento = JSON.parse(readFileSync(0, 'utf8'))
} catch {
  process.exit(0) // entrada ilegible: no se bloquea nada por error del propio hook
}

const textos = []
;(function recoger(v) {
  if (typeof v === 'string') textos.push(v)
  else if (Array.isArray(v)) v.forEach(recoger)
  else if (v && typeof v === 'object') Object.values(v).forEach(recoger)
})(evento.tool_input)

if (textos.some((t) => PATRON.test(t))) {
  console.error(
    'Bloqueado por la regla fija del proyecto (CLAUDE.md): nunca se borra una base, una tabla ni un esquema, ni en bases ' +
      'locales. Usa una base NUEVA con otro nombre, o ALTER. (Borrar un trigger, una política o una función sí se permite.)',
  )
  process.exit(2)
}
process.exit(0)

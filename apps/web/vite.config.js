import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// El horario del JSON-LD (index.html) sale de src/config/horarios.generated.json, que se genera desde la tabla
// sedes_horarios (única fuente). Los marcadores "__HORARIOS_JSONLD_CEDROS__" y "__HORARIOS_JSONLD_SANTA_MARINA__" se
// reemplazan por el arreglo openingHoursSpecification de cada local.
const RUTA_HORARIOS = fileURLToPath(new URL('./src/config/horarios.generated.json', import.meta.url))
const clave = (nombre) => nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, '_')

function horariosEnJsonLd() {
  return {
    name: 'horarios-en-json-ld',
    transformIndexHtml(html) {
      const { locales } = JSON.parse(readFileSync(RUTA_HORARIOS, 'utf8'))
      let salida = html
      for (const [nombre, datos] of Object.entries(locales)) {
        salida = salida.replace(`"__HORARIOS_JSONLD_${clave(nombre)}__"`, JSON.stringify(datos.jsonld))
      }
      if (/"__HORARIOS_JSONLD_/.test(salida)) throw new Error('Quedó un marcador __HORARIOS_JSONLD_*__ sin reemplazar: falta un local en horarios.generated.json')
      return salida
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), horariosEnJsonLd()],
  server: { port: 5173 },
})

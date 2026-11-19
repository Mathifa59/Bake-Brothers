import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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

const escaparAtributo = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/**
 * Cada ruta del sitio (/menu, /locales, /privacidad) sale con SU HTML —dist/<ruta>/index.html— con su propio título,
 * descripción, canonical y og:url (la fuente es src/config/seo.js). Antes todas servían el index.html de la portada: mismo
 * título y canonical a «/», con lo que Google las trataba como copias de la portada. Vercel sirve estos archivos antes que
 * cualquier rewrite; lo que no existe da 404 (public/404.html). Si una etiqueta de index.html cambia de forma y no se
 * puede reemplazar, el build FALLA en vez de publicar una cabecera equivocada.
 */
function seoPorRuta() {
  let salida = 'dist'
  return {
    name: 'seo-por-ruta',
    apply: 'build',
    configResolved(config) {
      salida = config.build.outDir
    },
    async writeBundle() {
      const { SEO, RUTAS_DEL_SITIO, urlCanonica } = await import('./src/config/seo.js')
      const base = readFileSync(`${salida}/index.html`, 'utf8')
      for (const ruta of RUTAS_DEL_SITIO.filter((r) => r !== '/')) {
        const { titulo, descripcion } = SEO[ruta]
        const t = escaparAtributo(titulo)
        const d = escaparAtributo(descripcion)
        const url = urlCanonica(ruta)
        let html = base
        const cambiar = (patron, nuevo) => {
          if (!patron.test(html)) throw new Error(`seo-por-ruta: no encontré ${patron} en index.html (ruta ${ruta})`)
          html = html.replace(patron, () => nuevo)
        }
        cambiar(/<title>[^<]*<\/title>/, `<title>${titulo.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</title>`)
        cambiar(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${d}" />`)
        cambiar(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${url}" />`)
        cambiar(/<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${url}" />`)
        cambiar(/<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${t}" />`)
        cambiar(/<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${d}" />`)
        cambiar(/<meta name="twitter:title" content="[^"]*"\s*\/?>/, `<meta name="twitter:title" content="${t}" />`)
        cambiar(/<meta name="twitter:description" content="[^"]*"\s*\/?>/, `<meta name="twitter:description" content="${d}" />`)
        const carpeta = `${salida}/${ruta.slice(1)}`
        mkdirSync(carpeta, { recursive: true })
        writeFileSync(`${carpeta}/index.html`, html)
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), horariosEnJsonLd(), seoPorRuta()],
  server: { port: 5173 },
})

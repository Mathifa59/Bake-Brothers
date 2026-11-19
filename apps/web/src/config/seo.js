/**
 * SEO por ruta. UNA sola fuente para dos usos:
 *   · el build (vite.config.js, plugin «seo-por-ruta») genera un HTML propio por ruta con su título, descripción,
 *     canonical y og:url — así Google (y WhatsApp/Facebook, que no ejecutan JavaScript) ven la cabecera correcta;
 *   · el cliente (hooks/useSeo.js) los vuelve a poner al navegar dentro del sitio.
 * Archivo JS puro, sin JSX ni alias: lo importa también vite.config.js (Node).
 */
export const SITIO = 'https://www.bakebrothers.pe'

export const SEO = {
  '/': {
    titulo: 'Bake Brothers · Pastelería Artesanal en Chorrillos',
    descripcion: 'Pastelería artesanal en Chorrillos, Lima — todo hecho a mano. Pide por WhatsApp y recíbelo en Cedros o Santa Marina.',
  },
  '/menu': {
    titulo: 'Menú: alfajores, cuchareables, empanadas y tortas · Bake Brothers',
    descripcion: 'Alfajores, cuchareables, empanadas, tortas y postres hechos a mano en Chorrillos. Mira el menú con precios y pide por WhatsApp.',
  },
  '/locales': {
    titulo: 'Nuestros locales en Chorrillos: Cedros y Santa Marina · Bake Brothers',
    descripcion: 'Encuentra Bake Brothers en Chorrillos, Lima: locales Cedros y Santa Marina, horarios de atención y cómo llegar.',
  },
  '/privacidad': {
    titulo: 'Política de privacidad · Bake Brothers',
    descripcion: 'Qué datos guardamos cuando nos escribes o haces un pedido en Bake Brothers, para qué los usamos y cómo pedir que los borremos.',
  },
}

/** Rutas reales del sitio (las del sitemap). Cualquier otra es un 404. */
export const RUTAS_DEL_SITIO = Object.keys(SEO)

/** Quita la barra final (salvo en la raíz): «/menu/» y «/menu» son la misma página. */
export const rutaNormalizada = (pathname) => (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname) || '/'

export const urlCanonica = (ruta) => (ruta === '/' ? `${SITIO}/` : `${SITIO}${ruta}`)

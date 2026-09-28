// Configuración editable de la landing de una sola página — el cliente
// cambia precios/copy seguido, esto se edita acá sin tocar componentes.
// El número/link de WhatsApp sigue centralizado en utils/whatsapp.js (no se
// duplica acá) — mensajeWhatsapp de cada producto es solo el texto, no la URL.

export const videosHero = [
  {
    id: 'mix',
    nombre: 'Caja de Alfajores Mix',
    subtitulo: 'Un poco de cada capricho, en una sola caja',
    precio: 22.9,
    unidades: 18,
    video: {
      mp4: '/video/alfajores-mix.mp4',
      webm: '/video/alfajores-mix.webm',
      poster: '/video/alfajores-mix-poster.webp',
    },
    mensajeWhatsapp: 'Hola Bake Brothers 👋 Quiero pedir la Caja de Alfajores Mix (18 und.)',
  },
  {
    id: 'manjar',
    nombre: 'Caja de Alfajores con Manjar Blanco',
    subtitulo: 'El clásico de siempre, manjar hasta el borde',
    precio: 11.9,
    unidades: 18,
    video: {
      mp4: '/video/alfajores-manjar.mp4',
      webm: '/video/alfajores-manjar.webm',
      poster: '/video/alfajores-manjar-poster.webp',
    },
    mensajeWhatsapp: 'Hola Bake Brothers 👋 Quiero pedir la Caja de Alfajores con Manjar Blanco (18 und.)',
  },
]

export const empanadas = [
  { id: 'carne', nombre: 'Carne tradicional', precio: 7.9, imagen: '/img/empanadas/carne.webp' },
  { id: 'pollo', nombre: 'Pollo en trozos', precio: 7.9, imagen: '/img/empanadas/pollo.webp' },
  { id: 'hawaiana', nombre: 'Hawaiana', precio: 8.9, imagen: '/img/empanadas/hawaiana.webp' },
  { id: 'aji-gallina', nombre: 'Ají de gallina', precio: 8.9, imagen: '/img/empanadas/aji-gallina.webp' },
  { id: 'jamon-queso', nombre: 'Jamón y queso', precio: 8.9, imagen: '/img/empanadas/jamon-queso.webp' },
  { id: 'lomo', nombre: 'Lomo saltado', precio: 8.9, imagen: '/img/empanadas/lomo.webp' },
  { id: 'carnivora', nombre: 'Carnívora', precio: 8.9, imagen: '/img/empanadas/carnivora.webp' },
  { id: 'tres-quesos', nombre: 'Tres quesos', precio: 8.9, imagen: '/img/empanadas/tres-quesos.webp' },
  { id: 'pollo-champinon', nombre: 'Pollo con champiñón', precio: 8.9, imagen: '/img/empanadas/pollo-champinon.webp' },
  { id: 'jamon-queso-cabanossi', nombre: 'Jamón, queso y cabanossi', precio: 8.9, imagen: '/img/empanadas/jamon-queso-cabanossi.webp' },
].map((e) => ({ ...e, mensajeWhatsapp: `Hola Bake Brothers 👋 Quiero pedir empanadas de ${e.nombre.toLowerCase()}` }))

// mapsUrl: link real a Google Maps (formato documentado "Maps URLs",
// https://developers.google.com/maps/documentation/urls/get-started, sin API
// key) — abre la ubicación real en una pestaña nueva (o la app de Maps en el
// celular). Antes se probó embeber el mapa con un <iframe> (tanto el hack
// `?q=&output=embed` como el oficial `embed?pb=...`) pero AMBOS formatos
// muestran, a la altura de tarjeta que usa esta sección, un botón "Abrir en
// Maps" propio de Google encima del mapa — verificado real que no depende de
// cuál de los dos formatos se use, ni es controlable desde nuestro código
// (es contenido de google.com, cross-origin). Se reemplazó el embed por una
// tarjeta estática con este link.
export const locales = [
  {
    nombre: 'Cedros',
    direccion: 'Av. Alameda Los Horizontes 820, Chorrillos',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=BakeBrothers%2C+Av.+Alameda+Los+Horizontes+820%2C+Chorrillos%2C+Lima%2C+Per%C3%BA',
  },
  {
    nombre: 'Santa Marina',
    direccion: 'Av. Defensores del Morro 2270',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Av.+Defensores+del+Morro+2270%2C+Chorrillos%2C+Lima%2C+Per%C3%BA',
  },
]

export const redes = {
  instagram: 'https://instagram.com/bakebrothers.pe',
  facebook: 'https://facebook.com/bakebrothers.pe',
  handle: '@bakebrothers.pe',
}

export const mensajeWhatsappGenerico = 'Hola Bake Brothers 👋 Quiero hacer un pedido'

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

// mapaSrc: embed oficial de Google ("Compartir > Incorporar un mapa" sobre la
// ubicación real de cada local en Google Maps, sin API key). Con suficiente
// alto/ancho, Google muestra la tarjeta completa del negocio (nombre,
// dirección, botón "cómo llegar" propio) en vez del botón comprimido "Abrir
// en Maps" — pedido explícito del cliente con un ejemplo real. La sección
// usa una altura generosa (ver Ubicaciones.jsx) para que esa tarjeta
// completa entre incluso en la columna angosta de la grilla de 2 columnas.
export const locales = [
  {
    nombre: 'Cedros',
    direccion: 'Av. Alameda Los Horizontes 820, Chorrillos',
    mapaSrc:
      'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3899.642744198229!2d-77.00921439999999!3d-12.2046946!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x9105b90b0f511c61%3A0x28ddbd9a3c4fcc00!2sBakeBrothers!5e0!3m2!1ses-419!2spe!4v1790624971087!5m2!1ses-419!2spe',
  },
  {
    nombre: 'Santa Marina',
    direccion: 'Av. Defensores del Morro 2270',
    mapaSrc:
      'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3899.978303909021!2d-77.0125961!3d-12.181879400000001!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x9105b77db00554d9%3A0x62bc17c099226c51!2sMercado%20Santa%20Marina%2C%20Av.%20Defensores%20del%20Morro%202270%2C%20Chorrillos%2015067!5e0!3m2!1ses-419!2spe!4v1790625055996!5m2!1ses-419!2spe',
  },
]

export const redes = {
  instagram: 'https://instagram.com/bakebrothers.pe',
  facebook: 'https://facebook.com/bakebrothers.pe',
  handle: '@bakebrothers.pe',
}

export const mensajeWhatsappGenerico = 'Hola Bake Brothers 👋 Quiero hacer un pedido'

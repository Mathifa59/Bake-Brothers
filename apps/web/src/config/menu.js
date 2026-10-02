// Catálogo real para la página de Menú (replanteo del sitio a varias
// páginas con navegación, 2026-10-01) — precios y nombres tomados de
// `apps/api/migrations/0006_catalogo_real.sql` (la misma fuente real que
// usa la base de datos), no inventados. Fotos reales ya optimizadas en
// public/img/menu/ (ver también public/img/empanadas/ para empanadas).
//
// Cada categoría sin foto real disponible (Bebidas) se marca `sinFoto:
// true` y se muestra como lista simple en vez de inventar una imagen.
import { empanadas } from './landing'

const alfajores = [
  { id: 'alfajor-manjar', nombre: 'Alfajor con Manjar', precio: 6.9, detalle: 'Caja x10', imagen: '/img/menu/alfajor-manjar.webp' },
  { id: 'alfajor-mix', nombre: 'Alfajor Mix', precio: 12.9, detalle: 'Caja x10', imagen: '/img/menu/alfajor-mix.webp' },
  { id: 'alfajor-lucuma', nombre: 'Alfajor con Lúcuma', precio: 11.9, detalle: 'Caja x10', imagen: '/img/menu/alfajor-lucuma.webp' },
  { id: 'alfajor-nutella', nombre: 'Alfajor con Nutella', precio: 12.9, detalle: 'Caja x10', imagen: '/img/menu/alfajor-nutella.webp' },
  { id: 'alfajor-pistacho', nombre: 'Alfajor con Pistacho', precio: 12.9, detalle: 'Caja x10', imagen: '/img/menu/alfajor-pistacho.webp' },
].map((p) => ({ ...p, mensajeWhatsapp: `Hola Bake Brothers 👋 Quiero pedir ${p.nombre} (${p.detalle})` }))

const cuchareables = [
  { id: 'cuchareable-fresa', nombre: 'Cuchareable de Fresa', precio: 15.9, imagen: '/img/menu/cuchareable-fresa.webp' },
  { id: 'cuchareable-lucuma', nombre: 'Cuchareable de Lúcuma', precio: 15.9, imagen: '/img/menu/cuchareable-lucuma.webp' },
  { id: 'cuchareable-nutella', nombre: 'Cuchareable de Nutella', precio: 15.9, imagen: '/img/menu/cuchareable-nutella.webp' },
  { id: 'cuchareable-alfajor', nombre: 'Cuchareable de Alfajor', precio: 15.9, imagen: '/img/menu/cuchareable-alfajor.webp' },
].map((p) => ({ ...p, mensajeWhatsapp: `Hola Bake Brothers 👋 Quiero pedir un ${p.nombre}` }))

const postres = [
  { id: 'torta-carrot-cake', nombre: 'Carrot Cake', precio: 9.9, detalle: 'Individual', imagen: '/img/menu/torta-carrot-cake.webp' },
  { id: 'torta-chocolate-manjar', nombre: 'Torta de Chocolate con Manjar', precio: 8.9, detalle: 'Individual', imagen: '/img/menu/torta-chocolate-manjar.webp' },
  { id: 'torta-red-velvet', nombre: 'Red Velvet', precio: 9.9, detalle: 'Individual', imagen: '/img/menu/torta-red-velvet.webp' },
  { id: 'cheesecake-oreo', nombre: 'Cheesecake de Oreo', precio: 10.9, detalle: 'Individual', imagen: '/img/menu/cheesecake-oreo.webp' },
  { id: 'cheesecake-fresa', nombre: 'Cheesecake de Fresa', precio: 9.9, detalle: 'Individual', imagen: '/img/menu/cheesecake-fresa.webp' },
  { id: 'cheesecake-maracuya', nombre: 'Cheesecake de Maracuyá', precio: 9.9, detalle: 'Individual', imagen: '/img/menu/cheesecake-maracuya.webp' },
  { id: 'tres-leches-vainilla', nombre: 'Tres Leches de Vainilla', precio: 8.9, detalle: 'Individual', imagen: '/img/menu/tres-leches-vainilla.webp' },
  { id: 'pie-limon', nombre: 'Pie de Limón', precio: 8.9, detalle: 'Individual', imagen: '/img/menu/pie-limon.webp' },
  { id: 'pie-manzana', nombre: 'Pie de Manzana', precio: 6.9, detalle: 'Individual', imagen: '/img/menu/pie-manzana.webp' },
  { id: 'mil-hojas', nombre: 'Mil Hojas', precio: 10.9, detalle: '200g', imagen: '/img/menu/mil-hojas.webp' },
  { id: 'pionono-caja', nombre: 'Pionono', precio: 11.9, detalle: 'Caja x16', imagen: '/img/menu/pionono-caja.webp' },
  { id: 'brownie-caja', nombre: 'Brownie', precio: 11.9, detalle: 'Caja x16', imagen: '/img/menu/brownie-caja.webp' },
  { id: 'chocoalfajor', nombre: 'Chocoalfajor', precio: 9.9, detalle: '8 unidades', imagen: '/img/menu/chocoalfajor.webp' },
  { id: 'trufas', nombre: 'Trufas', precio: 7.9, detalle: '4 unidades', imagen: '/img/menu/trufas.webp' },
  { id: 'mix-lite', nombre: 'Mix Lite', precio: 7.9, detalle: '9 unidades', imagen: '/img/menu/mix-lite.webp' },
  { id: 'tartaleta-frutas', nombre: 'Tartaleta de Frutas', precio: 7.9, imagen: '/img/menu/tartaleta-frutas.webp' },
].map((p) => ({ ...p, mensajeWhatsapp: `Hola Bake Brothers 👋 Quiero pedir ${p.nombre}` }))

const bebidas = [
  { id: 'agua-mineral', nombre: 'Agua mineral', precio: 4.0 },
  { id: 'inka-kola', nombre: 'Inka Kola', precio: 5.0, nota: 'Normal o zero' },
  { id: 'coca-cola', nombre: 'Coca-Cola', precio: 5.0, nota: 'Normal o zero' },
  { id: 'cafe-americano', nombre: 'Café americano', precio: 6.0 },
  { id: 'refresher', nombre: 'Refresher', precio: 9.9, nota: 'Fresa, arándanos, aguaymanto, mango o maracuyá' },
  { id: 'frappe', nombre: 'Frappé', precio: 13.9 },
  { id: 'frappe-oreo', nombre: 'Frappé de Oreo', precio: 15.9 },
  { id: 'infusiones', nombre: 'Infusiones', precio: 4.0 },
  { id: 'kero-300ml', nombre: 'Kero 300ml', precio: 5.0 },
  { id: 'jugo', nombre: 'Jugo', precio: 9.0, nota: 'Fresa, piña, mango, papaya o lúcuma' },
  { id: 'jugo-surtido', nombre: 'Jugo surtido', precio: 11.0 },
  { id: 'helado-1-bola', nombre: 'Helado 1 bola', precio: 7.0, nota: 'Fresa, chocolate o vainilla' },
  { id: 'helado-2-bolas', nombre: 'Helado 2 bolas', precio: 12.0 },
].map((p) => ({ ...p, mensajeWhatsapp: `Hola Bake Brothers 👋 Quiero pedir ${p.nombre}` }))

export const categorias = [
  {
    id: 'alfajores',
    nombre: 'Alfajores',
    descripcion: 'Masa de maicena bien suave con relleno hasta el borde — nuestro producto estrella.',
    productos: alfajores,
  },
  {
    id: 'cuchareables',
    nombre: 'Cuchareables',
    descripcion: 'Postre en vaso de 16oz para comer a cucharadas — elige tu sabor.',
    productos: cuchareables,
  },
  {
    id: 'empanadas',
    nombre: 'Empanadas BigBro',
    descripcion: 'Masa dorada y relleno generoso — elige tu sabor y te las dejamos listas.',
    productos: empanadas,
  },
  {
    id: 'postres',
    nombre: 'Postres y Tortas',
    descripcion: 'Tortas, cheesecakes y postres en porción individual, mini o familiar.',
    productos: postres,
  },
  {
    id: 'bebidas',
    nombre: 'Bebidas',
    descripcion: 'Para acompañar — jugos, frappés, helados y más.',
    sinFoto: true,
    productos: bebidas,
  },
]

// Genera el SQL de seed de Bake Brothers (tenant #1) a partir del mock del
// front, para no duplicar los 24 productos a mano.
//
//   node scripts/seed-from-mock.mjs > migrations/0002_seed_bake_brothers.sql
//
// El SQL generado es idempotente (ON CONFLICT ... DO UPDATE) y usa subselects
// por slug en lugar de UUIDs hardcodeados.

import {
  productos,
  categorias,
  distritos,
  extrasDisponibles,
} from '../../web/src/data/mock.js'

const TENANT = 'bake-brothers'

// Mapa texto → horas de anticipación. Falla explícito ante un texto nuevo:
// mejor romper el seed que migrar datos mal en silencio.
const HORAS_POR_TEXTO = {
  'Mismo día (pedidos antes de las 12 pm)': 0,
  '24 horas de anticipación': 24,
  '48 horas de anticipación': 48,
  '72 horas de anticipación': 72,
  '5 días de anticipación': 120,
  '7 días de anticipación': 168,
}

const horasDe = (texto) => {
  const horas = HORAS_POR_TEXTO[texto]
  if (horas === undefined) {
    throw new Error(`Texto de preparación no mapeado: "${texto}". Agrégalo a HORAS_POR_TEXTO.`)
  }
  return horas
}

const q = (v) => {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return `'${String(v).replace(/'/g, "''")}'`
}

const tenantId = `(select id from tenants where slug = ${q(TENANT)})`
const lineas = []

lineas.push(`-- ============================================================================`)
lineas.push(`-- 0002_seed_bake_brothers — GENERADO por scripts/seed-from-mock.mjs.`)
lineas.push(`-- No editar a mano: regenerar con`)
lineas.push(`--   node scripts/seed-from-mock.mjs > migrations/0002_seed_bake_brothers.sql`)
lineas.push(`-- ============================================================================`)
lineas.push(``)

// ——— tenant ———
lineas.push(`insert into tenants (slug, nombre, codigo_prefijo, telefono_whatsapp, direccion_tienda)`)
lineas.push(`values (${q(TENANT)}, 'Bake Brothers', 'BB', '51987654321', 'Av. Los Pasteles 456, Miraflores')`)
lineas.push(`on conflict (slug) do update set nombre = excluded.nombre, codigo_prefijo = excluded.codigo_prefijo;`)
lineas.push(``)

// ——— numeración de pedidos (los simulados llegaban a BB-2449) ———
lineas.push(`insert into order_sequences (tenant_id, ultimo_numero)`)
lineas.push(`values (${tenantId}, 2449)`)
lineas.push(`on conflict (tenant_id) do nothing;`)
lineas.push(``)

// ——— categorías ———
lineas.push(`-- Categorías (${categorias.length})`)
categorias.forEach((c, i) => {
  lineas.push(
    `insert into categories (tenant_id, slug, nombre, tipo_producto, emoji, foto_url, gradiente_desde, gradiente_hasta, descripcion, orden)`,
    `values (${tenantId}, ${q(c.id)}, ${q(c.nombre)}, ${q(c.tipo)}, ${q(c.emoji)}, ${q(c.foto ?? null)}, ${q(c.g[0])}, ${q(c.g[1])}, ${q(c.texto)}, ${i})`,
    `on conflict (tenant_id, slug) do update set nombre = excluded.nombre, tipo_producto = excluded.tipo_producto, emoji = excluded.emoji, foto_url = excluded.foto_url, gradiente_desde = excluded.gradiente_desde, gradiente_hasta = excluded.gradiente_hasta, descripcion = excluded.descripcion, orden = excluded.orden;`,
    ``
  )
})

// ——— productos ———
lineas.push(`-- Productos (${productos.length})`)
for (const [ordenProducto, p] of productos.entries()) {
  // La categoría del producto se resuelve por su `tipo` (Tortas, Postres, …),
  // que es como el catálogo agrupa realmente.
  const categoryId = `(select id from categories where tenant_id = ${tenantId} and tipo_producto = ${q(p.tipo)} limit 1)`
  const horas = horasDe(p.preparacion)
  const corte = horas === 0 ? `'12:00'` : 'null'
  lineas.push(
    `insert into products (tenant_id, slug, category_id, nombre, categoria_negocio, tipo, precio_base, precio_anterior, emoji, foto_url, gradiente_desde, gradiente_hasta, descripcion, porciones, anticipacion_horas, anticipacion_texto, corte_mismo_dia, conservacion, popular, mas_vendido, disponible, orden)`,
    `values (${tenantId}, ${q(p.id)}, ${categoryId}, ${q(p.nombre)}, ${q(p.categoria)}, ${q(p.tipo)}, ${q(p.precio)}, ${q(p.precioAnterior ?? null)}, ${q(p.emoji)}, ${q(p.foto ?? null)}, ${q(p.g[0])}, ${q(p.g[1])}, ${q(p.descripcion)}, ${q(p.porciones)}, ${horas}, ${q(p.preparacion)}, ${corte}, ${q(p.conservacion)}, ${q(p.popular)}, ${q(p.masVendido)}, ${q(p.disponible)}, ${ordenProducto})`,
    `on conflict (tenant_id, slug) do update set category_id = excluded.category_id, nombre = excluded.nombre, categoria_negocio = excluded.categoria_negocio, tipo = excluded.tipo, precio_base = excluded.precio_base, precio_anterior = excluded.precio_anterior, emoji = excluded.emoji, foto_url = excluded.foto_url, gradiente_desde = excluded.gradiente_desde, gradiente_hasta = excluded.gradiente_hasta, descripcion = excluded.descripcion, porciones = excluded.porciones, anticipacion_horas = excluded.anticipacion_horas, anticipacion_texto = excluded.anticipacion_texto, corte_mismo_dia = excluded.corte_mismo_dia, conservacion = excluded.conservacion, popular = excluded.popular, mas_vendido = excluded.mas_vendido, disponible = excluded.disponible, orden = excluded.orden, actualizado_en = now();`,
    ``
  )
}

// ——— tamaños (solo productos con tamanos: true) ———
const FACTORES = { Personal: 1.0, Mediano: 1.35, Grande: 1.7 }
const conTamanos = productos.filter((p) => p.tamanos)
lineas.push(`-- Tamaños (${conTamanos.length} productos × 3)`)
for (const p of conTamanos) {
  const productId = `(select id from products where tenant_id = ${tenantId} and slug = ${q(p.id)})`
  for (const [tamano, factor] of Object.entries(FACTORES)) {
    lineas.push(
      `insert into product_sizes (tenant_id, product_id, tamano, factor)`,
      `values (${tenantId}, ${productId}, ${q(tamano)}, ${factor})`,
      `on conflict (product_id, tamano) do update set factor = excluded.factor;`
    )
  }
  lineas.push(``)
}

// ——— extras ———
lineas.push(`-- Extras (${extrasDisponibles.length})`)
for (const e of extrasDisponibles) {
  lineas.push(
    `insert into extras (tenant_id, slug, nombre, precio, activo)`,
    `values (${tenantId}, ${q(e.slug)}, ${q(e.texto)}, ${q(e.precio)}, true)`,
    `on conflict (tenant_id, slug) do update set nombre = excluded.nombre, precio = excluded.precio;`,
    ``
  )
}

// ——— zonas de delivery ———
lineas.push(`-- Zonas de delivery (${distritos.length})`)
distritos.forEach((d, i) => {
  lineas.push(
    `insert into delivery_zones (tenant_id, nombre, activo, tarifa_delivery, orden)`,
    `values (${tenantId}, ${q(d)}, true, null, ${i})`,
    `on conflict (tenant_id, nombre) do update set activo = true, orden = excluded.orden;`,
    ``
  )
})

// ——— cupón BAKE10 (antes hardcodeado en CartContext) ———
lineas.push(`-- Cupones`)
lineas.push(`insert into coupons (tenant_id, codigo, tipo, valor, activo)`)
lineas.push(`values (${tenantId}, 'BAKE10', 'porcentaje', 10, true)`)
lineas.push(`on conflict (tenant_id, codigo) do update set tipo = excluded.tipo, valor = excluded.valor, activo = excluded.activo;`)
lineas.push(``)

process.stdout.write(lineas.join('\n'))

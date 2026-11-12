import { supabase } from './supabase'
import { traerTodo } from './datos'
import { comprimirImagen, extensionDeTipo } from '../utils/imagenes'

/**
 * Acceso a datos de la pantalla Catálogo (solo Administración). Habla directo con Supabase: la barrera real son las
 * políticas RLS de la migración 0042 (solo el administrador escribe el catálogo) y las del bucket `catalogo`. Va aparte
 * del componente para poder probar la pantalla con datos de ejemplo.
 *
 * Reglas del catálogo:
 *  - «Oculto» = products.disponible = false (no se borra nada; el bot, los pedidos y Stock lo ignoran).
 *  - Un tamaño o un sabor (jugos) es una fila de product_sizes con `clase` 'tamano' | 'sabor'. Los que ya existen no se
 *    borran: se ocultan (activo = false), porque el stock y los pedidos pueden referenciarlos.
 */

const BUCKET = 'catalogo'

const CAMPOS_PRODUCTO =
  'id, tenant_id, slug, category_id, nombre, categoria_negocio, tipo, precio_base, descripcion, disponible, orden, ' +
  'area_produccion, familia_operativa, sabor, foto_url, gradiente_desde, gradiente_hasta, ' +
  'product_sizes(id, tamano, precio, activo, orden, clase, visible_publico), product_photos(id, url, ruta, principal, orden)'

const aError = (error, contexto) => {
  if (!error) return
  const e = new Error(`${contexto}: ${error.message}`)
  e.detalle = error
  throw e
}

export const slugificar = (texto) =>
  String(texto)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'producto'

const ordenarTamanos = (a, b) => (a.orden ?? 0) - (b.orden ?? 0) || Number(a.precio ?? 0) - Number(b.precio ?? 0)

export const catalogoApi = {
  // ——— Productos
  async cargarProductos() {
    const filas = await traerTodo(() => supabase.from('products').select(CAMPOS_PRODUCTO).order('orden').order('nombre'))
    return filas.map((p) => ({
      ...p,
      // Los tamaños que no son públicos (p. ej. la «Mediana» de las empanadas, de Órdenes) no se editan aquí.
      product_sizes: [...(p.product_sizes ?? [])].filter((t) => t.visible_publico !== false).sort(ordenarTamanos),
      product_photos: [...(p.product_photos ?? [])].sort((a, b) => (b.principal ? 1 : 0) - (a.principal ? 1 : 0) || a.orden - b.orden),
    }))
  },

  async cambiarActivo(id, activo) {
    const { error } = await supabase.from('products').update({ disponible: activo, actualizado_en: new Date().toISOString() }).eq('id', id)
    aError(error, 'No se pudo cambiar el estado del producto')
  },

  /** Intercambia el orden de dos productos vecinos de la misma familia. */
  async intercambiarOrden(a, b) {
    const r1 = await supabase.from('products').update({ orden: b.orden }).eq('id', a.id)
    aError(r1.error, 'No se pudo reordenar')
    const r2 = await supabase.from('products').update({ orden: a.orden }).eq('id', b.id)
    aError(r2.error, 'No se pudo reordenar')
  },

  /**
   * Crea o actualiza un producto y deja sus tamaños/sabores como están en `tamanos` (los nuevos se crean, los existentes
   * se actualizan; ninguno se borra). `existentes` (la lista cargada) da la familia hermana de la que se copian los
   * datos internos de un producto nuevo (categoría, rubro, color) y evita slugs repetidos.
   */
  async guardarProducto(p, tamanos, existentes) {
    const activos = tamanos.filter((t) => t.activo !== false && t.precio !== '' && t.precio !== null && t.precio !== undefined)
    const precioBase =
      activos.length > 0 ? Math.min(...activos.map((t) => Number(t.precio))) : Number(p.precio_base)
    if (!Number.isFinite(precioBase)) throw new Error('Falta el precio.')

    const comunes = {
      nombre: p.nombre.trim(),
      tipo: p.tipo,
      descripcion: p.descripcion?.trim() || null,
      disponible: p.disponible,
      area_produccion: p.area_produccion || null,
      familia_operativa: p.familia_operativa?.trim() || null,
      sabor: p.sabor?.trim() || null,
      precio_base: precioBase,
      actualizado_en: new Date().toISOString(),
    }

    let id = p.id
    if (id) {
      const { error } = await supabase.from('products').update(comunes).eq('id', id)
      aError(error, 'No se pudo guardar el producto')
    } else {
      const hermano = existentes.find((x) => x.tipo === p.tipo)
      if (!hermano) throw new Error('Elige una familia que ya exista.')
      const usados = new Set(existentes.map((x) => x.slug))
      let slug = slugificar(p.nombre)
      for (let i = 2; usados.has(slug); i++) slug = `${slugificar(p.nombre)}-${i}`
      const maxOrden = Math.max(0, ...existentes.map((x) => x.orden ?? 0))
      const { data, error } = await supabase
        .from('products')
        .insert({
          ...comunes,
          tenant_id: hermano.tenant_id,
          slug,
          category_id: hermano.category_id,
          categoria_negocio: hermano.categoria_negocio,
          gradiente_desde: hermano.gradiente_desde,
          gradiente_hasta: hermano.gradiente_hasta,
          orden: maxOrden + 1,
        })
        .select('id')
        .single()
      aError(error, 'No se pudo crear el producto')
      id = data.id
    }

    const hermanoTenant = existentes.find((x) => x.tipo === p.tipo)?.tenant_id ?? p.tenant_id
    for (const [i, t] of tamanos.entries()) {
      const fila = {
        tamano: t.tamano.trim(),
        precio: t.precio === '' || t.precio === null || t.precio === undefined ? null : Number(t.precio),
        activo: t.activo !== false,
        clase: t.clase === 'sabor' ? 'sabor' : 'tamano',
        orden: i + 1,
      }
      if (t.id) {
        const { error } = await supabase.from('product_sizes').update(fila).eq('id', t.id)
        aError(error, `No se pudo guardar «${fila.tamano}»`)
      } else {
        const { error } = await supabase.from('product_sizes').insert({ ...fila, product_id: id, tenant_id: hermanoTenant })
        aError(error, `No se pudo crear «${fila.tamano}»`)
      }
    }
    return id
  },

  /** Copia un producto (con sus tamaños, sin fotos). La copia nace OCULTA para que no salga a la venta a medias. */
  async duplicarProducto(p, existentes) {
    const tamanos = p.product_sizes.map(({ tamano, precio, clase }) => ({ tamano, precio, clase, activo: true }))
    return this.guardarProducto(
      { ...p, id: null, nombre: `${p.nombre} (copia)`, disponible: false },
      tamanos,
      existentes
    )
  },

  // ——— Fotos (Supabase Storage, bucket `catalogo`)
  async subirFoto(archivo, carpeta) {
    const { blob, tipo } = await comprimirImagen(archivo)
    const ruta = `${carpeta}/${crypto.randomUUID()}.${extensionDeTipo(tipo)}`
    const { error } = await supabase.storage.from(BUCKET).upload(ruta, blob, { contentType: tipo, upsert: false, cacheControl: '31536000' })
    aError(error, 'No se pudo subir la foto')
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(ruta)
    return { url: data.publicUrl, ruta }
  },

  async agregarFotoProducto(productId, archivo, cantidadActual) {
    const { url, ruta } = await this.subirFoto(archivo, `productos/${productId}`)
    const { data, error } = await supabase
      .from('product_photos')
      .insert({ product_id: productId, url, ruta, orden: cantidadActual + 1 })
      .select('id, url, ruta, principal, orden')
      .single()
    if (error) {
      await supabase.storage.from(BUCKET).remove([ruta]) // no dejar un archivo huérfano
      aError(error, 'No se pudo guardar la foto')
    }
    return data
  },

  async hacerPrincipal(foto, fotosDelProducto) {
    const actual = fotosDelProducto.find((f) => f.principal && f.id !== foto.id)
    if (actual) {
      const r = await supabase.from('product_photos').update({ principal: false }).eq('id', actual.id)
      aError(r.error, 'No se pudo cambiar la foto principal')
    }
    const { error } = await supabase.from('product_photos').update({ principal: true }).eq('id', foto.id)
    aError(error, 'No se pudo cambiar la foto principal')
  },

  async quitarFotoProducto(foto) {
    const { error } = await supabase.from('product_photos').delete().eq('id', foto.id)
    aError(error, 'No se pudo quitar la foto')
    await supabase.storage.from(BUCKET).remove([foto.ruta])
  },

  // ——— Combos y catering (activo/oculto, precio y foto; la foto es una sola)
  async cargarCombos() {
    const { data, error } = await supabase
      .from('combos')
      .select('id, nombre, precio_normal, precio_promo, canal_permitido, condicion_texto, activo, foto_url, orden')
      .order('orden')
      .order('nombre')
    aError(error, 'No se pudieron leer los combos')
    return data
  },
  async cargarCatering() {
    const { data, error } = await supabase.from('catering_items').select('id, nombre, categoria, activo, foto_url, orden').order('orden').order('nombre')
    aError(error, 'No se pudo leer el catering')
    return data
  },
  async guardarCombo(c) {
    const { error } = await supabase
      .from('combos')
      .update({ activo: c.activo, precio_promo: Number(c.precio_promo), precio_normal: Number(c.precio_normal) })
      .eq('id', c.id)
    aError(error, 'No se pudo guardar el combo')
  },
  async cambiarActivoCatering(id, activo) {
    const { error } = await supabase.from('catering_items').update({ activo }).eq('id', id)
    aError(error, 'No se pudo cambiar el estado')
  },
  /** Reemplaza la foto de un combo o de un ítem de catering (tabla = 'combos' | 'catering_items'). */
  async cambiarFotoUnica(tabla, fila, archivo) {
    const { url, ruta } = await this.subirFoto(archivo, `${tabla === 'combos' ? 'combos' : 'catering'}/${fila.id}`)
    const { error } = await supabase.from(tabla).update({ foto_url: url }).eq('id', fila.id)
    if (error) {
      await supabase.storage.from(BUCKET).remove([ruta])
      aError(error, 'No se pudo guardar la foto')
    }
    return url
  },
  async quitarFotoUnica(tabla, fila) {
    const { error } = await supabase.from(tabla).update({ foto_url: null }).eq('id', fila.id)
    aError(error, 'No se pudo quitar la foto')
  },
}

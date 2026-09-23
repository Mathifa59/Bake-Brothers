import type pg from 'pg'
import { evaluarSemaforoCatering, type SemaforoCatering } from '@bakebrothers/domain'

/**
 * Funciones de solo lectura contra el catálogo real — pensadas para que un
 * futuro LLM las invoque como "tools" (function calling) cuando el bot
 * responda preguntas de precio/disponibilidad/combos/catering. Ninguna
 * inventa un valor: si no hay match, devuelven `null`/`[]` explícito.
 *
 * La búsqueda acepta el slug exacto o un texto aproximado (`ilike`) porque
 * un cliente de WhatsApp nunca va a escribir el slug — va a escribir "el
 * carrot cake" o "cuánto cuesta el red velvet".
 */

export interface TamanoConPrecio {
  tamano: string
  precio: number
}

export interface PrecioProducto {
  slug: string
  nombre: string
  precioBase: number
  disponible: boolean
  tamanos: TamanoConPrecio[]
}

export async function consultarPrecio(
  client: pg.PoolClient,
  tenantId: string,
  busqueda: string
): Promise<PrecioProducto | null> {
  const { rows } = await client.query(
    `select id, slug, nombre, precio_base, disponible
     from products
     where tenant_id = $1 and (slug = $2 or nombre ilike $3)
     order by (slug = $2) desc, nombre
     limit 1`,
    [tenantId, busqueda, `%${busqueda}%`]
  )
  const producto = rows[0]
  if (!producto) return null

  const tamanos = await client.query(
    `select tamano, precio from product_sizes
     where product_id = $1 and precio is not null
     order by precio`,
    [producto.id]
  )

  return {
    slug: producto.slug,
    nombre: producto.nombre,
    precioBase: Number(producto.precio_base),
    disponible: producto.disponible,
    tamanos: tamanos.rows.map((t) => ({ tamano: t.tamano as string, precio: Number(t.precio) })),
  }
}

export interface StockPorSede {
  sedeId: string
  sedeNombre: string
  disponible: boolean
  cantidad: number | null
}

export interface Disponibilidad {
  slug: string
  nombre: string
  // Flag general del catálogo (products.disponible) — no depende de ninguna
  // sede. `stockPorSede` es más específico y gana cuando hay una fila.
  disponibleGlobal: boolean
  stockPorSede: StockPorSede[]
}

export async function consultarDisponibilidad(
  client: pg.PoolClient,
  tenantId: string,
  busqueda: string,
  sedeId?: string
): Promise<Disponibilidad | null> {
  const { rows } = await client.query(
    `select id, slug, nombre, disponible
     from products
     where tenant_id = $1 and (slug = $2 or nombre ilike $3)
     order by (slug = $2) desc, nombre
     limit 1`,
    [tenantId, busqueda, `%${busqueda}%`]
  )
  const producto = rows[0]
  if (!producto) return null

  // stock no tiene tenant_id — product_id (ya resuelto contra el tenant
  // arriba) alcanza para acotar la consulta.
  const condicionSede = sedeId ? 'and s.sede_id = $2' : ''
  const params = sedeId ? [producto.id, sedeId] : [producto.id]
  const stock = await client.query(
    `select s.disponible, s.cantidad, se.id as sede_id, se.nombre as sede_nombre
     from stock s
     join sedes se on se.id = s.sede_id
     where s.product_id = $1 and se.activo ${condicionSede}
     order by se.nombre`,
    params
  )

  return {
    slug: producto.slug,
    nombre: producto.nombre,
    disponibleGlobal: producto.disponible,
    stockPorSede: stock.rows.map((r) => ({
      sedeId: r.sede_id as string,
      sedeNombre: r.sede_nombre as string,
      disponible: r.disponible as boolean,
      cantidad: r.cantidad === null ? null : Number(r.cantidad),
    })),
  }
}

export interface ItemCombo {
  productoNombre: string
  tamano: string | null
  cantidad: number
}

export interface ComboInfo {
  id: string
  nombre: string
  precioNormal: number | null
  precioPromo: number
  canalPermitido: string
  permiteCambios: boolean
  condicionTexto: string | null
  items: ItemCombo[]
}

// combos/combo_items no llevan tenant_id (0004) — mismo caso que catering.
export async function consultarCombo(
  client: pg.PoolClient,
  busqueda: string
): Promise<ComboInfo | null> {
  const { rows } = await client.query(
    `select c.id, c.nombre, c.precio_normal, c.precio_promo, c.canal_permitido,
            c.permite_cambios, c.condicion_texto
     from combos c
     where c.activo and (c.id::text = $1 or c.nombre ilike $2)
     order by c.nombre
     limit 1`,
    [busqueda, `%${busqueda}%`]
  )
  const combo = rows[0]
  if (!combo) return null

  const items = await client.query(
    `select p.nombre as producto_nombre, ps.tamano, ci.cantidad
     from combo_items ci
     join products p on p.id = ci.product_id
     left join product_sizes ps on ps.id = ci.product_size_id
     where ci.combo_id = $1
     order by p.nombre`,
    [combo.id]
  )

  return {
    id: combo.id,
    nombre: combo.nombre,
    precioNormal: combo.precio_normal === null ? null : Number(combo.precio_normal),
    precioPromo: Number(combo.precio_promo),
    canalPermitido: combo.canal_permitido,
    permiteCambios: combo.permite_cambios,
    condicionTexto: combo.condicion_texto,
    items: items.rows.map((r) => ({
      productoNombre: r.producto_nombre as string,
      tamano: r.tamano as string | null,
      cantidad: Number(r.cantidad),
    })),
  }
}

export interface ReglaCatering {
  // uuid real de catering_items — lo necesita crearPedido para guardar la
  // línea del pedido (order_items.catering_item_id, ver 0019). No se lo
  // exponemos al modelo como algo que tenga que manejar, es un detalle
  // interno de wiring.
  itemId: string
  itemNombre: string
  categoria: string
  unidadesMinimas: number
  saleMismoDia: boolean
  anticipacionHoras: number
  requiereAutoObligatorio: boolean
  consultarDomingo: boolean
  // null = la fuente no confirma el dato para este ítem (ver 0007_catering_items.sql) — no se asume ni true ni false.
  necesitaTicket: boolean | null
  admiteCorteNocheAnterior: boolean
}

// catering_items/reglas_catering no llevan tenant_id (0007) — Bake Brothers
// es el único negocio del proyecto, no hace falta filtrar por tenant acá.
export async function consultarReglasCatering(
  client: pg.PoolClient,
  busqueda: string
): Promise<ReglaCatering | null> {
  const { rows } = await client.query(
    `select ci.id, ci.nombre, ci.categoria, r.unidades_minimas, r.sale_mismo_dia,
            r.anticipacion_horas, r.requiere_auto_obligatorio, r.consultar_domingo,
            r.necesita_ticket, r.admite_corte_noche_anterior
     from catering_items ci
     join reglas_catering r on r.catering_item_id = ci.id
     where ci.activo and ci.nombre ilike $1
     order by ci.nombre
     limit 1`,
    [`%${busqueda}%`]
  )
  const regla = rows[0]
  if (!regla) return null

  return {
    itemId: regla.id,
    itemNombre: regla.nombre,
    categoria: regla.categoria,
    unidadesMinimas: Number(regla.unidades_minimas),
    saleMismoDia: regla.sale_mismo_dia,
    anticipacionHoras: Number(regla.anticipacion_horas),
    requiereAutoObligatorio: regla.requiere_auto_obligatorio,
    consultarDomingo: regla.consultar_domingo,
    necesitaTicket: regla.necesita_ticket,
    admiteCorteNocheAnterior: regla.admite_corte_noche_anterior,
  }
}

export interface PedidoCateringConsulta {
  cantidadSolicitada: number
  /** YYYY-MM-DD — el día en que el cliente quiere la entrega. */
  fechaEntregaISO: string
}

/**
 * Semáforo de catering para un pedido real — junta el dato real de
 * reglas_catering (nunca inventado; null si el ítem no existe) con la
 * función pura `evaluarSemaforoCatering` de packages/domain (la lógica de
 * negocio vive ahí, esto solo la alimenta con datos reales).
 *
 * La usa el cerebro del bot (apps/api/src/bot/cerebro.ts) antes de confirmar
 * cualquier pedido de catering, y `crearPedido` (más abajo) la vuelve a
 * llamar server-side antes de persistir — nunca confía en que el modelo ya
 * la haya llamado.
 */
export async function evaluarSemaforoCateringPedido(
  client: pg.PoolClient,
  busquedaItem: string,
  pedido: PedidoCateringConsulta
): Promise<SemaforoCatering | null> {
  const regla = await consultarReglasCatering(client, busquedaItem)
  if (!regla) return null

  return evaluarSemaforoCatering(
    {
      unidadesMinimas: regla.unidadesMinimas,
      saleMismoDia: regla.saleMismoDia,
      anticipacionHoras: regla.anticipacionHoras,
      admiteCorteNocheAnterior: regla.admiteCorteNocheAnterior,
    },
    pedido
  )
}

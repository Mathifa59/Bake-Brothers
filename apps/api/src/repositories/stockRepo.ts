import type pg from 'pg'
import {
  productoDisponibleEnSede,
  type FilaStockSede,
  type MotivoNoDisponible,
  type ResultadoDisponibilidad,
} from '@bakebrothers/domain'

/**
 * Stock por sede para decidir si algo se puede vender (regla en `@bakebrothers/domain`,
 * `productoDisponibleEnSede`). Este archivo solo lee la base y arma la consulta; la decisión es del dominio.
 */

export interface SedeActiva {
  id: string
  nombre: string
  direccion: string | null
}

export interface ContextoStock {
  sedes: SedeActiva[]
  /** Filas de `stock` agrupadas por product_id. */
  filasPorProducto: Map<string, FilaStockSede[]>
}

/** Sedes activas y todas las filas de stock de los productos dados. */
export async function cargarContextoStock(client: pg.PoolClient, productIds: string[]): Promise<ContextoStock> {
  const { rows: sedes } = await client.query<SedeActiva>(`select id, nombre, direccion from sedes where activo order by nombre`)
  const filasPorProducto = new Map<string, FilaStockSede[]>()
  if (productIds.length > 0) {
    const { rows } = await client.query(
      `select product_id, sede_id, product_size_id, disponible, cantidad from stock where product_id = any($1::uuid[])`,
      [productIds]
    )
    for (const r of rows) {
      const lista = filasPorProducto.get(r.product_id) ?? []
      lista.push({
        sedeId: r.sede_id,
        productSizeId: r.product_size_id,
        disponible: r.disponible,
        cantidad: r.cantidad === null ? null : Number(r.cantidad),
      })
      filasPorProducto.set(r.product_id, lista)
    }
  }
  return { sedes, filasPorProducto }
}

/** Disponibilidad de un SKU (producto + tamaño) con el contexto ya cargado. */
export function disponibilidadDeSku(
  ctx: ContextoStock,
  sku: { productId: string; productSizeId: string | null; cantidad?: number },
  sedeId: string | null
): ResultadoDisponibilidad {
  return productoDisponibleEnSede({
    productSizeId: sku.productSizeId,
    cantidad: sku.cantidad ?? 1,
    sedeId,
    sedesActivas: ctx.sedes.map((s) => s.id),
    filas: ctx.filasPorProducto.get(sku.productId) ?? [],
  })
}

export interface LineaParaStock {
  productId: string
  productSizeId: string | null
  nombre: string
  /** Etiqueta del tamaño, solo para el mensaje. */
  tamano: string | null
  cantidad: number
}

export interface ProblemaStock {
  producto: string
  tamano: string | null
  motivo: MotivoNoDisponible
  /** Lo que queda contado en la sede (solo `cantidad_insuficiente` con sede conocida). */
  cantidadDisponible?: number
  /** Nombres de las sedes donde sí se podría vender. */
  disponibleEn: string[]
}

export type ResultadoStockDeLineas =
  | { ok: true }
  | { ok: false; error: 'PRODUCTO_AGOTADO'; detalle: { sedeId: string | null; productos: ProblemaStock[] } }

/**
 * Verifica que cada línea se pueda vender en la sede del pedido (o en alguna sede si todavía no tiene). Las líneas
 * del mismo SKU se suman antes de comparar contra un conteo exacto. Devuelve `PRODUCTO_AGOTADO` con el detalle de
 * cada línea que no se puede cumplir, para que el bot o el panel le digan al cliente qué pasó y qué ofrecer.
 */
export async function verificarStockDeLineas(
  client: pg.PoolClient,
  lineas: LineaParaStock[],
  sedeId: string | null
): Promise<ResultadoStockDeLineas> {
  if (lineas.length === 0) return { ok: true }

  const agregadas = new Map<string, LineaParaStock>()
  for (const l of lineas) {
    const clave = `${l.productId}|${l.productSizeId ?? ''}`
    const previa = agregadas.get(clave)
    agregadas.set(clave, previa ? { ...previa, cantidad: previa.cantidad + l.cantidad } : { ...l })
  }

  const ctx = await cargarContextoStock(client, [...new Set(lineas.map((l) => l.productId))])
  const nombreDeSede = new Map(ctx.sedes.map((s) => [s.id, s.nombre]))

  const problemas: ProblemaStock[] = []
  for (const l of agregadas.values()) {
    const r = disponibilidadDeSku(ctx, l, sedeId)
    if (r.disponible) continue
    problemas.push({
      producto: l.nombre,
      tamano: l.tamano,
      motivo: r.motivo,
      ...(r.cantidadDisponible !== undefined ? { cantidadDisponible: r.cantidadDisponible } : {}),
      disponibleEn: r.enSedes.map((id) => nombreDeSede.get(id) ?? id),
    })
  }
  return problemas.length === 0 ? { ok: true } : { ok: false, error: 'PRODUCTO_AGOTADO', detalle: { sedeId, productos: problemas } }
}

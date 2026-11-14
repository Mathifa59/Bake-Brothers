import type pg from 'pg'

/**
 * Un pedido PARA HOY que toma el bot solo se acepta si el producto se puede hacer hoy: lo que se hace «solo por encargo»
 * (tortas, postres enteros, personalizados) se agenda desde mañana. La clasificación es `modo_produccion` de cada producto
 * (y de cada tamaño, que pisa al del producto cuando lo tiene): `por_pedido` = solo por encargo; `vitrina`, `ambos` y
 * `no_produce` (bebidas) se pueden vender hoy. El modo del producto es obligatorio en la base (NOT NULL).
 */
type Modo = 'por_pedido' | 'vitrina' | 'ambos' | 'no_produce'

export interface ResultadoParaHoy {
  /** Productos (o combos) que son solo por encargo: no se pueden pedir para hoy. */
  porEncargo: string[]
}

/** `lineas` = productos de la orden (tienda y selecciones de combo); `comboIds` = combos de composición fija. */
export async function revisarProductosParaHoy(
  client: pg.PoolClient,
  lineas: { productId: string; tamano: string | null; nombre: string }[],
  comboIds: string[]
): Promise<ResultadoParaHoy> {
  const porEncargo = new Set<string>()
  const evaluar = (nombre: string, modo: Modo | null | undefined) => {
    if (modo === 'por_pedido') porEncargo.add(nombre)
  }

  if (lineas.length > 0) {
    const { rows } = await client.query(
      `select p.id, p.modo_produccion as modo_producto, ps.tamano, ps.modo_produccion as modo_tamano
         from products p left join product_sizes ps on ps.product_id = p.id
        where p.id = any($1::uuid[])`,
      [[...new Set(lineas.map((l) => l.productId))]]
    )
    for (const l of lineas) {
      const delProducto = rows.filter((r) => r.id === l.productId)
      const delTamano = l.tamano ? delProducto.find((r) => r.tamano === l.tamano) : undefined
      const nombre = l.tamano ? `${l.nombre} (${l.tamano})` : l.nombre
      evaluar(nombre, (delTamano?.modo_tamano as Modo | null) ?? (delProducto[0]?.modo_producto as Modo | undefined))
    }
  }

  if (comboIds.length > 0) {
    const { rows } = await client.query(
      `select cb.id, cb.nombre as combo, p.nombre as producto, p.modo_produccion as modo_producto, ps.modo_produccion as modo_tamano
         from combos cb
         left join combo_items ci on ci.combo_id = cb.id
         left join products p on p.id = ci.product_id
         left join product_sizes ps on ps.id = ci.product_size_id
        where cb.id = any($1::uuid[])`,
      [comboIds]
    )
    for (const r of rows) {
      if (!r.producto) continue
      evaluar(r.combo, (r.modo_tamano as Modo | null) ?? (r.modo_producto as Modo))
    }
  }
  return { porEncargo: [...porEncargo] }
}

import type pg from 'pg'

/**
 * Guarda el código de Mifact en productos / tamaños de nuestro catálogo (importador
 * de catálogo de Mifact, solo admin). NUNCA toca un precio ni un nombre: solo la
 * columna `codigo_mifact` (0033), y solo si el producto no tenía ya otro código y el
 * código no está en uso por otro — un cruce equivocado nunca pisa uno anterior.
 */

export interface AsignacionCodigo {
  tipo: 'producto' | 'tamano'
  id: string
  codigo: string
}

export type EstadoCodigo = 'guardado' | 'igual' | 'no_encontrado' | 'item_con_otro_codigo' | 'codigo_en_uso'

export interface ResultadoCodigo extends AsignacionCodigo {
  resultado: EstadoCodigo
  /** Contexto legible para mostrar en el dashboard (el otro código, o quién usa ya este). */
  detalle?: string
}

const TABLA = { producto: 'products', tamano: 'product_sizes' } as const

export async function guardarCodigosMifact(
  client: pg.PoolClient,
  tenantId: string,
  asignaciones: AsignacionCodigo[]
): Promise<ResultadoCodigo[]> {
  const resultados: ResultadoCodigo[] = []

  for (const a of asignaciones) {
    const tabla = TABLA[a.tipo]
    // product_sizes no tiene tenant_id (cuelga de products); products sí.
    const { rows } = await client.query<{ id: string; codigo_mifact: string | null }>(
      a.tipo === 'producto'
        ? `select id, codigo_mifact from products where id = $1 and tenant_id = $2`
        : `select id, codigo_mifact from product_sizes where id = $1`,
      a.tipo === 'producto' ? [a.id, tenantId] : [a.id]
    )
    const actual = rows[0]
    if (!actual) {
      resultados.push({ ...a, resultado: 'no_encontrado' })
      continue
    }
    if (actual.codigo_mifact === a.codigo) {
      resultados.push({ ...a, resultado: 'igual' })
      continue
    }
    if (actual.codigo_mifact) {
      resultados.push({ ...a, resultado: 'item_con_otro_codigo', detalle: `ya tiene el código ${actual.codigo_mifact}` })
      continue
    }

    // ¿Lo usa otro producto o tamaño (en cualquiera de las dos tablas)?
    const { rows: enUso } = await client.query<{ nombre: string }>(
      `select p.nombre from products p where p.codigo_mifact = $1 and p.id <> $2
       union all
       select p.nombre || ' ' || ps.tamano from product_sizes ps join products p on p.id = ps.product_id
       where ps.codigo_mifact = $1 and ps.id <> $2
       limit 1`,
      [a.codigo, a.id]
    )
    if (enUso[0]) {
      resultados.push({ ...a, resultado: 'codigo_en_uso', detalle: `lo usa ${enUso[0].nombre}` })
      continue
    }

    await client.query(`update ${tabla} set codigo_mifact = $2 where id = $1`, [a.id, a.codigo])
    resultados.push({ ...a, resultado: 'guardado' })
  }
  return resultados
}

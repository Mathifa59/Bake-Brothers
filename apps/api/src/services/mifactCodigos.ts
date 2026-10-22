import type pg from 'pg'

/**
 * Guarda los códigos de Mifact de nuestro catálogo (importador de catálogo de Mifact,
 * solo admin). NUNCA toca un precio ni un nombre: solo inserta en `mifact_codigos`
 * (0033), y solo si esa unidad no tenía ya OTRO código para ese almacén y el código no
 * está en uso por otra cosa — un cruce equivocado nunca pisa uno anterior.
 */

export interface AsignacionCodigo {
  tipo: 'producto' | 'tamano'
  id: string
  /** Almacén tal cual lo escribe Mifact ("CENTRAL", "santa marina", "TODOS"). */
  almacen: string
  codigo: string
  codigoBarras?: string | null
}

export type EstadoCodigo = 'guardado' | 'igual' | 'no_encontrado' | 'item_con_otro_codigo' | 'codigo_en_uso'

export interface ResultadoCodigo extends AsignacionCodigo {
  resultado: EstadoCodigo
  /** Contexto legible para mostrar en el dashboard (el otro código, o quién usa ya este). */
  detalle?: string
}

export const normalizarAlmacen = (a: string) => a.trim().replace(/\s+/g, ' ').toLowerCase()

export async function guardarCodigosMifact(
  client: pg.PoolClient,
  tenantId: string,
  asignaciones: AsignacionCodigo[]
): Promise<ResultadoCodigo[]> {
  const resultados: ResultadoCodigo[] = []

  for (const a of asignaciones) {
    const almacen = normalizarAlmacen(a.almacen)
    const columna = a.tipo === 'producto' ? 'product_id' : 'product_size_id'

    // ¿Existe la unidad? (product_sizes no tiene tenant_id: cuelga de products.)
    const { rows: existe } = await client.query(
      a.tipo === 'producto'
        ? `select id from products where id = $1 and tenant_id = $2`
        : `select ps.id from product_sizes ps join products p on p.id = ps.product_id where ps.id = $1 and p.tenant_id = $2`,
      [a.id, tenantId]
    )
    if (!existe[0]) {
      resultados.push({ ...a, almacen, resultado: 'no_encontrado' })
      continue
    }

    // ¿Esa unidad ya tiene un código para ese almacén?
    const { rows: actual } = await client.query<{ codigo: string }>(
      `select codigo from mifact_codigos where ${columna} = $1 and almacen = $2`,
      [a.id, almacen]
    )
    if (actual[0]) {
      resultados.push(
        actual[0].codigo === a.codigo
          ? { ...a, almacen, resultado: 'igual' }
          : { ...a, almacen, resultado: 'item_con_otro_codigo', detalle: `ya tiene el código ${actual[0].codigo} en ${almacen}` }
      )
      continue
    }

    // ¿Ese código ya lo usa otra cosa (producto, tamaño o la misma unidad en otro almacén)?
    const { rows: enUso } = await client.query<{ nombre: string }>(
      `select coalesce(p.nombre, p2.nombre || ' ' || ps.tamano) as nombre
       from mifact_codigos m
       left join products p on p.id = m.product_id
       left join product_sizes ps on ps.id = m.product_size_id
       left join products p2 on p2.id = ps.product_id
       where m.codigo = $1`,
      [a.codigo]
    )
    if (enUso[0]) {
      resultados.push({ ...a, almacen, resultado: 'codigo_en_uso', detalle: `lo usa ${enUso[0].nombre}` })
      continue
    }

    await client.query(
      `insert into mifact_codigos (${columna}, almacen, codigo, codigo_barras) values ($1, $2, $3, $4)`,
      [a.id, almacen, a.codigo, a.codigoBarras ?? null]
    )
    resultados.push({ ...a, almacen, resultado: 'guardado' })
  }
  return resultados
}

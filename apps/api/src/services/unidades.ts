/**
 * Unidades de negocio (Calle y Mayoristas): precios internos, «Salida a calle», pagos y el reporte por día.
 *
 *   · «Salida a calle»: se registra el día anterior como `planificada` (entra a la hoja de producción) y se confirma como
 *     `salio` con las cantidades reales. Al confirmar se descuenta el stock del local DONDE HAY CONTEO (nunca se bloquea:
 *     si el conteo quedara bajo cero se deja en 0 y se avisa) y se congela el precio interno de ese momento. Después se
 *     anota lo que volvió; si la unidad regresa a la tienda (Calle) vuelve al stock, también solo donde hay conteo.
 *   · Las órdenes de mayoristas NO descuentan vitrina: se producen contra la orden. Se valorizan al precio interno de la
 *     unidad Mayoristas (lo congela un trigger al crear cada línea).
 *   · El reporte muestra, por día y por unidad: cantidades, VALOR a precio interno, pagos y saldo. No hay porcentajes de
 *     reparto ni cálculo de sueldos: eso no existe en el sistema.
 *   · Un producto sin precio interno NO se valora como 0 en silencio: sale contado como «línea sin precio».
 */
import type pg from 'pg'
import { pool } from '../db.js'

export class ErrorUnidades extends Error {
  constructor(
    public readonly estado: number,
    public readonly codigo: string,
    mensaje: string,
    public readonly extra?: Record<string, unknown>
  ) {
    super(mensaje)
    this.name = 'ErrorUnidades'
  }
}

/** Transacción que le dice a la base QUIÉN hace el cambio (el historial de precios lo lee). */
async function conActor<T>(actorId: string | null, fn: (db: pg.PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect()
  try {
    await db.query('begin')
    if (actorId) await db.query(`select set_config('app.actor_id', $1, true)`, [actorId])
    const r = await fn(db)
    await db.query('commit')
    return r
  } catch (err) {
    await db.query('rollback').catch(() => {})
    throw err
  } finally {
    db.release()
  }
}

const dinero = (n: unknown): number => Math.round(Number(n ?? 0) * 100) / 100

// ———————————————————————————————————————————————————————————————— unidades y precios ————

export interface Unidad {
  id: string
  codigo: string
  nombre: string
  activa: boolean
  regresaAStock: boolean
}

export async function listarUnidades(): Promise<Unidad[]> {
  const { rows } = await pool.query(`select id, codigo, nombre, activa, regresa_a_stock from unidades_negocio order by nombre`)
  return rows.map((r) => ({ id: r.id, codigo: r.codigo, nombre: r.nombre, activa: r.activa, regresaAStock: r.regresa_a_stock }))
}

async function unidadPorId(db: pg.Pool | pg.PoolClient, id: string): Promise<Unidad> {
  const { rows } = await db.query(`select id, codigo, nombre, activa, regresa_a_stock from unidades_negocio where id = $1`, [id])
  if (!rows[0]) throw new ErrorUnidades(404, 'UNIDAD_NO_ENCONTRADA', 'Esa unidad no existe.')
  const r = rows[0]
  return { id: r.id, codigo: r.codigo, nombre: r.nombre, activa: r.activa, regresaAStock: r.regresa_a_stock }
}

export interface FilaPrecio {
  productId: string
  producto: string
  tipo: string | null
  productSizeId: string | null
  tamano: string | null
  /** Precio al público (referencia, no se usa para valorizar). */
  precioPublico: number | null
  /** Precio interno de esta unidad; null = sin precio cargado. */
  precio: number | null
}

/** Todos los productos activos con sus tamaños (incluido el tamaño oculto de empanadas) y el precio interno de la unidad. */
export async function listarPrecios(unidadId: string): Promise<{ unidad: Unidad; filas: FilaPrecio[] }> {
  const unidad = await unidadPorId(pool, unidadId)
  // Un producto sin tamaños es un solo SKU (sin tamaño). Las empanadas tienen además un tamaño oculto («Mediana», de los
  // mayoristas): su versión sin tamaño es la «Grande» y también lleva precio propio.
  const { rows } = await pool.query(
    `select p.id as product_id, p.nombre, p.tipo, p.orden, s.size_id, s.tamano, s.precio as precio_publico, s.orden_tamano, pi.precio as precio_interno
       from products p
       cross join lateral (
         select ps.id as size_id, ps.tamano, ps.precio, ps.orden as orden_tamano
           from product_sizes ps where ps.product_id = p.id and ps.activo
         union all
         select null::uuid, case when exists (select 1 from product_sizes h where h.product_id = p.id and h.activo and not h.visible_publico) then 'Grande' end,
                p.precio_base, -1
          where not exists (select 1 from product_sizes a where a.product_id = p.id and a.activo)
             or exists (select 1 from product_sizes h where h.product_id = p.id and h.activo and not h.visible_publico)
       ) s
       left join precios_internos pi on pi.unidad_id = $1 and pi.product_id = p.id and pi.product_size_id is not distinct from s.size_id
      where p.disponible
      order by p.tipo, p.orden, p.nombre, s.orden_tamano nulls first, s.tamano`,
    [unidadId]
  )
  return {
    unidad,
    filas: rows.map((r) => ({
      productId: r.product_id,
      producto: r.nombre,
      tipo: r.tipo ?? null,
      productSizeId: r.size_id ?? null,
      tamano: r.tamano ?? null,
      precioPublico: r.precio_publico === null ? null : Number(r.precio_publico),
      precio: r.precio_interno === null ? null : Number(r.precio_interno),
    })),
  }
}

export interface CambioPrecio {
  productId: string
  productSizeId: string | null
  /** null = quitar el precio. */
  precio: number | null
}

export async function guardarPrecios(actorId: string, unidadId: string, cambios: CambioPrecio[]): Promise<{ guardados: number; quitados: number }> {
  return conActor(actorId, async (db) => {
    await unidadPorId(db, unidadId)
    let guardados = 0
    let quitados = 0
    for (const c of cambios) {
      if (c.precio !== null && (!Number.isFinite(c.precio) || c.precio < 0 || c.precio > 100000))
        throw new ErrorUnidades(400, 'PRECIO_NO_VALIDO', 'El precio interno tiene que ser un número de 0 en adelante.')
      const { rows } = await db.query(`select 1 from products where id = $1`, [c.productId])
      if (!rows[0]) throw new ErrorUnidades(404, 'PRODUCTO_NO_ENCONTRADO', 'Hay un producto que no existe.')
      if (c.productSizeId) {
        const { rows: t } = await db.query(`select 1 from product_sizes where id = $1 and product_id = $2`, [c.productSizeId, c.productId])
        if (!t[0]) throw new ErrorUnidades(400, 'TAMANO_NO_ES_DEL_PRODUCTO', 'Un tamaño no es de ese producto.')
      }
      if (c.precio === null) {
        const r = await db.query(
          `delete from precios_internos where unidad_id = $1 and product_id = $2 and product_size_id is not distinct from $3`,
          [unidadId, c.productId, c.productSizeId]
        )
        quitados += r.rowCount ?? 0
        continue
      }
      const upd = await db.query(
        `update precios_internos set precio = $4 where unidad_id = $1 and product_id = $2 and product_size_id is not distinct from $3`,
        [unidadId, c.productId, c.productSizeId, c.precio]
      )
      if ((upd.rowCount ?? 0) === 0)
        await db.query(`insert into precios_internos (unidad_id, product_id, product_size_id, precio) values ($1, $2, $3, $4)`, [unidadId, c.productId, c.productSizeId, c.precio])
      guardados += 1
    }
    return { guardados, quitados }
  })
}

// ———————————————————————————————————————————————————————————————— stock ————

/**
 * Mueve el stock de un producto/tamaño SOLO si lleva conteo. Nunca bloquea: si el conteo quedara bajo cero se deja en 0 y se
 * devuelve un aviso. Sin fila o sin conteo no hace nada.
 */
async function moverStock(db: pg.PoolClient, sedeId: string, productId: string, sizeId: string | null, delta: number): Promise<{ aviso: string | null }> {
  if (delta === 0) return { aviso: null }
  const { rows } = await db.query(
    `select id, cantidad from stock where sede_id = $1 and product_id = $2 and product_size_id is not distinct from $3 for update`,
    [sedeId, productId, sizeId]
  )
  const fila = rows[0]
  if (!fila || fila.cantidad === null) return { aviso: null }
  const nueva = Number(fila.cantidad) + delta
  await db.query(`update stock set cantidad = $2, actualizado_en = now() where id = $1`, [fila.id, Math.max(0, nueva)])
  return { aviso: nueva < 0 ? `En Stock había ${fila.cantidad} y salieron ${-delta}: el conteo quedó en 0.` : null }
}

// ———————————————————————————————————————————————————————————————— salidas ————

export interface ItemEntrada {
  productId: string
  productSizeId?: string | null
  cantidad: number
}

interface ItemResuelto {
  productId: string
  productSizeId: string | null
  nombre: string
  tamano: string | null
  cantidad: number
}

async function resolverItems(db: pg.PoolClient, items: ItemEntrada[]): Promise<ItemResuelto[]> {
  if (items.length === 0) throw new ErrorUnidades(400, 'SIN_PRODUCTOS', 'Agrega al menos un producto.')
  const vistos = new Set<string>()
  const salida: ItemResuelto[] = []
  for (const it of items) {
    if (!Number.isInteger(it.cantidad) || it.cantidad < 1 || it.cantidad > 5000)
      throw new ErrorUnidades(400, 'CANTIDAD_NO_VALIDA', 'Las cantidades van de 1 a 5000.')
    const clave = `${it.productId}:${it.productSizeId ?? ''}`
    if (vistos.has(clave)) throw new ErrorUnidades(400, 'PRODUCTO_REPETIDO', 'Un producto con el mismo tamaño aparece dos veces: suma las cantidades en una sola línea.')
    vistos.add(clave)
    const { rows } = await db.query(`select nombre from products where id = $1`, [it.productId])
    if (!rows[0]) throw new ErrorUnidades(404, 'PRODUCTO_NO_ENCONTRADO', 'Hay un producto que no existe.')
    let tamano: string | null = null
    if (it.productSizeId) {
      const { rows: t } = await db.query(`select tamano from product_sizes where id = $1 and product_id = $2`, [it.productSizeId, it.productId])
      if (!t[0]) throw new ErrorUnidades(400, 'TAMANO_NO_ES_DEL_PRODUCTO', `Un tamaño no es de «${rows[0].nombre}».`)
      tamano = t[0].tamano
    }
    salida.push({ productId: it.productId, productSizeId: it.productSizeId ?? null, nombre: rows[0].nombre, tamano, cantidad: it.cantidad })
  }
  return salida
}

export interface Salida {
  id: string
  unidadId: string
  unidad: string
  sedeId: string
  sede: string | null
  fecha: string
  estado: 'planificada' | 'salio' | 'anulada'
  nota: string | null
  creadoPor: string | null
  creadoEn: string
  salioPor: string | null
  salioEn: string | null
  items: Array<{
    id: string
    productId: string
    productSizeId: string | null
    producto: string
    tamano: string | null
    cantidad: number
    cantidadSalio: number | null
    cantidadDevuelta: number | null
    precioInterno: number | null
  }>
  /** Total a precio interno de lo que salió menos lo que volvió (solo líneas con precio). */
  valor: number
  lineasSinPrecio: number
}

const fechaISO = (d: unknown): string => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10))

export async function listarSalidas(f: { desde?: string; hasta?: string; unidadId?: string; estado?: string; limite: number }): Promise<Salida[]> {
  const { rows } = await pool.query(
    `select s.*, u.nombre as unidad, se.nombre as sede, coalesce(c.nombre, c.usuario) as creado_por_nombre, coalesce(a.nombre, a.usuario) as salio_por_nombre
       from salidas_unidad s
       join unidades_negocio u on u.id = s.unidad_id
       left join sedes se on se.id = s.sede_id
       left join usuarios_dashboard c on c.id = s.creado_por
       left join usuarios_dashboard a on a.id = s.salio_por
      where ($1::date is null or s.fecha >= $1::date) and ($2::date is null or s.fecha <= $2::date)
        and ($3::uuid is null or s.unidad_id = $3::uuid) and ($4::text is null or s.estado = $4::text)
      order by s.fecha desc, s.creado_en desc
      limit $5`,
    [f.desde ?? null, f.hasta ?? null, f.unidadId ?? null, f.estado ?? null, f.limite]
  )
  if (rows.length === 0) return []
  const { rows: items } = await pool.query(`select * from salidas_unidad_items where salida_id = any($1::uuid[]) order by nombre_producto, tamano nulls first`, [rows.map((r) => r.id)])
  return rows.map((s) => {
    const mios = items.filter((i) => i.salida_id === s.id)
    let valor = 0
    let sinPrecio = 0
    if (s.estado === 'salio') {
      for (const i of mios) {
        const neto = (i.cantidad_salio ?? 0) - (i.cantidad_devuelta ?? 0)
        if (i.precio_interno === null) {
          if (neto > 0) sinPrecio += 1
        } else valor += neto * Number(i.precio_interno)
      }
    }
    return {
      id: s.id,
      unidadId: s.unidad_id,
      unidad: s.unidad,
      sedeId: s.sede_id,
      sede: s.sede,
      fecha: fechaISO(s.fecha),
      estado: s.estado,
      nota: s.nota,
      creadoPor: s.creado_por_nombre ?? null,
      creadoEn: new Date(s.creado_en).toISOString(),
      salioPor: s.salio_por_nombre ?? null,
      salioEn: s.salio_en ? new Date(s.salio_en).toISOString() : null,
      items: mios.map((i) => ({
        id: i.id,
        productId: i.product_id,
        productSizeId: i.product_size_id,
        producto: i.nombre_producto,
        tamano: i.tamano,
        cantidad: i.cantidad,
        cantidadSalio: i.cantidad_salio,
        cantidadDevuelta: i.cantidad_devuelta,
        precioInterno: i.precio_interno === null ? null : Number(i.precio_interno),
      })),
      valor: dinero(valor),
      lineasSinPrecio: sinPrecio,
    }
  })
}

async function leerSalida(db: pg.PoolClient, id: string, bloquear = true) {
  const { rows } = await db.query(`select * from salidas_unidad where id = $1 ${bloquear ? 'for update' : ''}`, [id])
  if (!rows[0]) throw new ErrorUnidades(404, 'SALIDA_NO_ENCONTRADA', 'Esa salida no existe.')
  return rows[0]
}

async function validarSede(db: pg.PoolClient, sedeId: string) {
  const { rows } = await db.query(`select 1 from sedes where id = $1 and activo`, [sedeId])
  if (!rows[0]) throw new ErrorUnidades(400, 'SEDE_NO_VALIDA', 'Ese local no existe o está inactivo.')
}

async function precioInterno(db: pg.PoolClient, unidadId: string, productId: string, sizeId: string | null): Promise<number | null> {
  const { rows } = await db.query(
    `select precio from precios_internos where unidad_id = $1 and product_id = $2 and product_size_id is not distinct from $3`,
    [unidadId, productId, sizeId]
  )
  return rows[0] ? Number(rows[0].precio) : null
}

export interface DatosNuevaSalida {
  unidadId: string
  sedeId: string
  fecha: string
  nota?: string | null
  items: ItemEntrada[]
  /** true = registrar directamente lo que salió (sin planificar antes). */
  confirmar?: boolean
}

export async function crearSalida(actorId: string, d: DatosNuevaSalida): Promise<{ id: string; avisos: string[] }> {
  return conActor(actorId, async (db) => {
    const unidad = await unidadPorId(db, d.unidadId)
    if (!unidad.activa) throw new ErrorUnidades(409, 'UNIDAD_INACTIVA', 'Esa unidad está desactivada.')
    if (unidad.codigo === 'mayoristas')
      throw new ErrorUnidades(400, 'MAYORISTAS_VA_POR_ORDENES', 'Lo de mayoristas se registra en Órdenes (se valoriza solo); acá van las salidas de la calle.')
    await validarSede(db, d.sedeId)
    const items = await resolverItems(db, d.items)
    const { rows } = await db.query(
      `insert into salidas_unidad (unidad_id, sede_id, fecha, nota, creado_por) values ($1, $2, $3, $4, $5) returning id`,
      [d.unidadId, d.sedeId, d.fecha, d.nota?.trim() || null, actorId]
    )
    const id = rows[0].id as string
    for (const it of items) {
      await db.query(
        `insert into salidas_unidad_items (salida_id, product_id, product_size_id, nombre_producto, tamano, cantidad) values ($1, $2, $3, $4, $5, $6)`,
        [id, it.productId, it.productSizeId, it.nombre, it.tamano, it.cantidad]
      )
    }
    const avisos = d.confirmar ? await aplicarSalio(db, actorId, id, unidad) : []
    return { id, avisos }
  })
}

export async function editarSalida(
  actorId: string,
  id: string,
  d: { fecha?: string; sedeId?: string; nota?: string | null; items?: ItemEntrada[] }
): Promise<void> {
  return conActor(actorId, async (db) => {
    const s = await leerSalida(db, id)
    if (s.estado !== 'planificada') throw new ErrorUnidades(409, 'SOLO_PLANIFICADAS', 'Solo se edita una salida planificada. Una que ya salió no se cambia (anota lo que volvió).')
    if (d.sedeId) await validarSede(db, d.sedeId)
    await db.query(
      `update salidas_unidad set fecha = coalesce($2, fecha), sede_id = coalesce($3, sede_id), nota = case when $4::boolean then $5 else nota end where id = $1`,
      [id, d.fecha ?? null, d.sedeId ?? null, d.nota !== undefined, d.nota?.trim() || null]
    )
    if (d.items) {
      const items = await resolverItems(db, d.items)
      await db.query(`delete from salidas_unidad_items where salida_id = $1`, [id])
      for (const it of items)
        await db.query(
          `insert into salidas_unidad_items (salida_id, product_id, product_size_id, nombre_producto, tamano, cantidad) values ($1, $2, $3, $4, $5, $6)`,
          [id, it.productId, it.productSizeId, it.nombre, it.tamano, it.cantidad]
        )
    }
  })
}

/** Pasa la salida a `salio`: descuenta stock donde hay conteo y congela el precio interno. Las cantidades que salieron ya están en las líneas. */
async function aplicarSalio(db: pg.PoolClient, actorId: string, id: string, unidad: Unidad): Promise<string[]> {
  const s = await leerSalida(db, id, false)
  const { rows: items } = await db.query(`select * from salidas_unidad_items where salida_id = $1 order by nombre_producto`, [id])
  const avisos: string[] = []
  for (const i of items) {
    const salio = i.cantidad_salio ?? i.cantidad
    const precio = await precioInterno(db, unidad.id, i.product_id, i.product_size_id)
    await db.query(`update salidas_unidad_items set cantidad_salio = $2, precio_interno = $3 where id = $1`, [i.id, salio, precio])
    const m = await moverStock(db, s.sede_id, i.product_id, i.product_size_id, -salio)
    if (m.aviso) avisos.push(`${i.nombre_producto}${i.tamano ? ` ${i.tamano}` : ''}: ${m.aviso}`)
  }
  await db.query(`update salidas_unidad set estado = 'salio', salio_por = $2, salio_en = now() where id = $1`, [id, actorId])
  return avisos
}

export interface DatosSalio {
  /** Lo que salió de verdad en cada línea planificada. Una línea que no se mencione se toma como 0 (no salió). */
  items: Array<{ itemId: string; cantidadSalio: number }>
  /** Productos que salieron y no estaban planificados. */
  nuevos?: ItemEntrada[]
}

export async function confirmarSalio(actorId: string, id: string, d: DatosSalio): Promise<{ avisos: string[] }> {
  return conActor(actorId, async (db) => {
    const s = await leerSalida(db, id)
    if (s.estado !== 'planificada') throw new ErrorUnidades(409, 'SOLO_PLANIFICADAS', s.estado === 'salio' ? 'Esta salida ya se confirmó.' : 'Esta salida está anulada.')
    const unidad = await unidadPorId(db, s.unidad_id)
    const { rows: existentes } = await db.query(`select id from salidas_unidad_items where salida_id = $1`, [id])
    const idsValidos = new Set(existentes.map((r) => r.id as string))
    const dadas = new Map<string, number>()
    for (const it of d.items) {
      if (!idsValidos.has(it.itemId)) throw new ErrorUnidades(400, 'LINEA_NO_ES_DE_LA_SALIDA', 'Una línea no es de esta salida.')
      if (!Number.isInteger(it.cantidadSalio) || it.cantidadSalio < 0 || it.cantidadSalio > 5000)
        throw new ErrorUnidades(400, 'CANTIDAD_NO_VALIDA', 'Las cantidades van de 0 a 5000.')
      dadas.set(it.itemId, it.cantidadSalio)
    }
    for (const itemId of idsValidos) await db.query(`update salidas_unidad_items set cantidad_salio = $2 where id = $1`, [itemId, dadas.get(itemId) ?? 0])
    if (d.nuevos?.length) {
      const nuevos = await resolverItems(db, d.nuevos)
      for (const it of nuevos) {
        const ya = await db.query(
          `select id from salidas_unidad_items where salida_id = $1 and product_id = $2 and product_size_id is not distinct from $3`,
          [id, it.productId, it.productSizeId]
        )
        if (ya.rows[0]) throw new ErrorUnidades(400, 'PRODUCTO_REPETIDO', `«${it.nombre}» ya está en la salida: cambia su cantidad en esa línea.`)
        await db.query(
          `insert into salidas_unidad_items (salida_id, product_id, product_size_id, nombre_producto, tamano, cantidad, cantidad_salio) values ($1, $2, $3, $4, $5, $6, $6)`,
          [id, it.productId, it.productSizeId, it.nombre, it.tamano, it.cantidad]
        )
      }
    }
    const avisos = await aplicarSalio(db, actorId, id, unidad)
    return { avisos }
  })
}

export async function registrarDevolucion(actorId: string, id: string, items: Array<{ itemId: string; cantidadDevuelta: number }>): Promise<{ avisos: string[] }> {
  return conActor(actorId, async (db) => {
    const s = await leerSalida(db, id)
    if (s.estado !== 'salio') throw new ErrorUnidades(409, 'NO_HA_SALIDO', 'Solo se anota lo que volvió de una salida que ya salió.')
    const unidad = await unidadPorId(db, s.unidad_id)
    const avisos: string[] = []
    for (const it of items) {
      const { rows } = await db.query(`select * from salidas_unidad_items where id = $1 and salida_id = $2 for update`, [it.itemId, id])
      const linea = rows[0]
      if (!linea) throw new ErrorUnidades(400, 'LINEA_NO_ES_DE_LA_SALIDA', 'Una línea no es de esta salida.')
      if (!Number.isInteger(it.cantidadDevuelta) || it.cantidadDevuelta < 0) throw new ErrorUnidades(400, 'CANTIDAD_NO_VALIDA', 'La cantidad que volvió tiene que ser un número entero desde 0.')
      if (it.cantidadDevuelta > (linea.cantidad_salio ?? 0))
        throw new ErrorUnidades(409, 'DEVUELVE_MAS_DE_LO_QUE_SALIO', `«${linea.nombre_producto}»: salieron ${linea.cantidad_salio}, no pueden volver ${it.cantidadDevuelta}.`)
      const antes = linea.cantidad_devuelta ?? 0
      await db.query(`update salidas_unidad_items set cantidad_devuelta = $2 where id = $1`, [linea.id, it.cantidadDevuelta])
      // Lo que vuelve regresa al stock del local solo si la unidad lo hace (Calle sí) y solo donde hay conteo.
      if (unidad.regresaAStock) {
        const m = await moverStock(db, s.sede_id, linea.product_id, linea.product_size_id, it.cantidadDevuelta - antes)
        if (m.aviso) avisos.push(`${linea.nombre_producto}: ${m.aviso}`)
      }
    }
    return { avisos }
  })
}

export async function anularSalida(actorId: string, id: string): Promise<void> {
  return conActor(actorId, async (db) => {
    const s = await leerSalida(db, id)
    if (s.estado === 'anulada') return
    if (s.estado === 'salio') throw new ErrorUnidades(409, 'YA_SALIO', 'Una salida que ya salió no se anula: anota lo que volvió.')
    await db.query(`update salidas_unidad set estado = 'anulada', anulado_por = $2, anulado_en = now() where id = $1`, [id, actorId])
  })
}

// ———————————————————————————————————————————————————————————————— pagos ————

export async function registrarPago(actorId: string, d: { unidadId: string; fecha: string; monto: number; nota?: string | null }): Promise<{ id: string }> {
  return conActor(actorId, async (db) => {
    await unidadPorId(db, d.unidadId)
    if (!Number.isFinite(d.monto) || d.monto <= 0 || d.monto > 1_000_000) throw new ErrorUnidades(400, 'MONTO_NO_VALIDO', 'El monto tiene que ser mayor que 0.')
    const { rows } = await db.query(
      `insert into pagos_unidad (unidad_id, fecha, monto, nota, registrado_por) values ($1, $2, $3, $4, $5) returning id`,
      [d.unidadId, d.fecha, dinero(d.monto), d.nota?.trim() || null, actorId]
    )
    return { id: rows[0].id }
  })
}

/** Un pago mal anotado no se borra (es un registro de dinero): se anula y deja de contar. */
export async function anularPago(actorId: string, id: string): Promise<void> {
  const r = await pool.query(`update pagos_unidad set anulado_por = $2, anulado_en = now() where id = $1 and anulado_en is null`, [id, actorId])
  if ((r.rowCount ?? 0) === 0) {
    const { rows } = await pool.query(`select anulado_en from pagos_unidad where id = $1`, [id])
    if (!rows[0]) throw new ErrorUnidades(404, 'PAGO_NO_ENCONTRADO', 'Ese pago no existe.')
  }
}

// ———————————————————————————————————————————————————————————————— reporte ————

export interface DiaReporte {
  fecha: string
  cantidad: number
  valor: number
  lineasSinPrecio: number
  pagos: number
  /** valor − pagos de ese día. */
  saldoDia: number
  /** Lo que la unidad le debe a Bake hasta el final de ese día (incluye lo anterior al rango). */
  saldoAcumulado: number
}

export interface ReporteUnidad {
  unidadId: string
  codigo: string
  nombre: string
  saldoAnterior: number
  dias: DiaReporte[]
  totales: { cantidad: number; valor: number; pagos: number; saldo: number; lineasSinPrecio: number }
  saldoFinal: number
  pagos: Array<{ id: string; fecha: string; monto: number; nota: string | null; registradoPor: string | null; anulado: boolean }>
}

/** Movimientos valorizados (una fila por línea): las salidas confirmadas (netas de lo que volvió) y las órdenes de mayoristas. */
const MOVIMIENTOS_SQL = `
  select s.unidad_id, s.fecha, (si.cantidad_salio - coalesce(si.cantidad_devuelta, 0)) as cant,
         coalesce(si.precio_interno, pi.precio) as precio
    from salidas_unidad s
    join salidas_unidad_items si on si.salida_id = s.id
    left join precios_internos pi on pi.unidad_id = s.unidad_id and pi.product_id = si.product_id and pi.product_size_id is not distinct from si.product_size_id
   where s.estado = 'salio' and si.cantidad_salio is not null
  union all
  select um.id as unidad_id, o.fecha_entrega as fecha, oi.cantidad as cant, coalesce(oi.precio_interno, pi.precio) as precio
    from orders o
    join order_items oi on oi.order_id = o.id
    cross join (select id from unidades_negocio where codigo = 'mayoristas') um
    left join product_sizes ps on ps.product_id = oi.product_id and ps.tamano = oi.tamano
    left join precios_internos pi on pi.unidad_id = um.id and pi.product_id = oi.product_id and pi.product_size_id is not distinct from ps.id
   where o.canal = 'mayorista' and o.estado <> 'cancelled' and oi.product_id is not null`

export async function reporte(f: { desde: string; hasta: string; unidadId?: string }): Promise<{ desde: string; hasta: string; unidades: ReporteUnidad[] }> {
  const unidades = (await listarUnidades()).filter((u) => (f.unidadId ? u.id === f.unidadId : true))
  if (f.unidadId && unidades.length === 0) throw new ErrorUnidades(404, 'UNIDAD_NO_ENCONTRADA', 'Esa unidad no existe.')

  const { rows: dias } = await pool.query(
    `with mov as (${MOVIMIENTOS_SQL})
     select unidad_id, fecha, sum(cant)::int as cantidad,
            coalesce(sum(cant * precio) filter (where precio is not null), 0) as valor,
            count(*) filter (where precio is null and cant > 0)::int as sin_precio
       from mov where fecha between $1::date and $2::date and ($3::uuid is null or unidad_id = $3::uuid)
      group by unidad_id, fecha`,
    [f.desde, f.hasta, f.unidadId ?? null]
  )
  const { rows: antes } = await pool.query(
    `with mov as (${MOVIMIENTOS_SQL})
     select unidad_id, coalesce(sum(cant * precio) filter (where precio is not null), 0) as valor
       from mov where fecha < $1::date and ($2::uuid is null or unidad_id = $2::uuid) group by unidad_id`,
    [f.desde, f.unidadId ?? null]
  )
  const { rows: pagos } = await pool.query(
    `select p.id, p.unidad_id, p.fecha, p.monto, p.nota, p.anulado_en, coalesce(u.nombre, u.usuario) as registrado_por
       from pagos_unidad p left join usuarios_dashboard u on u.id = p.registrado_por
      where p.fecha <= $1::date and ($2::uuid is null or p.unidad_id = $2::uuid)
      order by p.fecha, p.registrado_en`,
    [f.hasta, f.unidadId ?? null]
  )

  const resultado: ReporteUnidad[] = unidades.map((u) => {
    const valorAntes = Number(antes.find((a) => a.unidad_id === u.id)?.valor ?? 0)
    const pagosAntes = pagos.filter((p) => p.unidad_id === u.id && !p.anulado_en && fechaISO(p.fecha) < f.desde).reduce((n, p) => n + Number(p.monto), 0)
    const saldoAnterior = dinero(valorAntes - pagosAntes)

    const porFecha = new Map<string, { cantidad: number; valor: number; sinPrecio: number; pagos: number }>()
    const dia = (fecha: string) => {
      if (!porFecha.has(fecha)) porFecha.set(fecha, { cantidad: 0, valor: 0, sinPrecio: 0, pagos: 0 })
      return porFecha.get(fecha)!
    }
    for (const r of dias.filter((x) => x.unidad_id === u.id)) {
      const d = dia(fechaISO(r.fecha))
      d.cantidad += Number(r.cantidad)
      d.valor += Number(r.valor)
      d.sinPrecio += Number(r.sin_precio)
    }
    for (const p of pagos.filter((x) => x.unidad_id === u.id && !x.anulado_en && fechaISO(x.fecha) >= f.desde)) dia(fechaISO(p.fecha)).pagos += Number(p.monto)

    let acumulado = saldoAnterior
    const lista: DiaReporte[] = [...porFecha.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, d]) => {
        const saldoDia = dinero(d.valor - d.pagos)
        acumulado = dinero(acumulado + saldoDia)
        return { fecha, cantidad: d.cantidad, valor: dinero(d.valor), lineasSinPrecio: d.sinPrecio, pagos: dinero(d.pagos), saldoDia, saldoAcumulado: acumulado }
      })
    const totales = lista.reduce(
      (t, d) => ({ cantidad: t.cantidad + d.cantidad, valor: dinero(t.valor + d.valor), pagos: dinero(t.pagos + d.pagos), saldo: dinero(t.saldo + d.saldoDia), lineasSinPrecio: t.lineasSinPrecio + d.lineasSinPrecio }),
      { cantidad: 0, valor: 0, pagos: 0, saldo: 0, lineasSinPrecio: 0 }
    )
    return {
      unidadId: u.id,
      codigo: u.codigo,
      nombre: u.nombre,
      saldoAnterior,
      dias: lista,
      totales,
      saldoFinal: acumulado,
      pagos: pagos
        .filter((p) => p.unidad_id === u.id && fechaISO(p.fecha) >= f.desde)
        .map((p) => ({ id: p.id, fecha: fechaISO(p.fecha), monto: Number(p.monto), nota: p.nota, registradoPor: p.registrado_por ?? null, anulado: Boolean(p.anulado_en) })),
    }
  })
  return { desde: f.desde, hasta: f.hasta, unidades: resultado }
}

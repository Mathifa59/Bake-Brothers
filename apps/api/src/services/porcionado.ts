/**
 * Porcionado: resta enteras y suma porciones en Stock, en UNA transacción, según la regla del producto. La decisión (si
 * alcanza, si hay conteo, cuánto queda) es lógica pura del dominio (`planearPorcionado`); acá solo se lee y se escribe,
 * con las filas de stock bloqueadas para que dos personas porcionando a la vez no se pisen.
 *
 * Solo descuenta donde hay conteo. Quién puede lo decide la ruta (Administración o Encargado); el local ya viene
 * resuelto. Queda registro de quién, cuándo y cuánto en `porcionados`; Administración puede revertirlo.
 */
import type pg from 'pg'
import { planearPorcionado, planearReversion } from '@bakebrothers/domain'
import { pool } from '../db.js'

export class ErrorPorcionado extends Error {
  constructor(
    public readonly estado: number,
    public readonly codigo: string,
    mensaje: string
  ) {
    super(mensaje)
    this.name = 'ErrorPorcionado'
  }
}

async function enTransaccion<T>(fn: (db: pg.PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect()
  try {
    await db.query('begin')
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

interface FilaStock {
  id: string
  cantidad: number | null
}

/** Bloquea y lee la fila de stock de un SKU (producto + tamaño) en un local. */
async function stockBloqueado(db: pg.PoolClient, sedeId: string, productId: string, sizeId: string): Promise<FilaStock | null> {
  const { rows } = await db.query(
    `select id, cantidad from stock where sede_id = $1 and product_id = $2 and product_size_id = $3 for update`,
    [sedeId, productId, sizeId]
  )
  return rows[0] ? { id: rows[0].id, cantidad: rows[0].cantidad === null ? null : Number(rows[0].cantidad) } : null
}

const aSku = (f: FilaStock | null) => ({ existe: f !== null, cantidad: f ? f.cantidad : null })

export interface ResultadoPorcionado {
  id: string
  producto: string
  tamanoEntero: string
  tamanoPorcion: string
  enteras: number
  porcionesGeneradas: number
  enterasQuedan: number
  porcionesQuedan: number
}

export async function porcionar(usuarioId: string, datos: { sedeId: string; reglaId: string; enteras: number }): Promise<ResultadoPorcionado> {
  return enTransaccion(async (db) => {
    const { rows: reglas } = await db.query(
      `select r.id, r.product_id, r.size_entero_id, r.size_porcion_id, r.porciones,
              p.nombre as producto, se.tamano as tamano_entero, sp.tamano as tamano_porcion
         from porcionado_reglas r
         join products p on p.id = r.product_id
         join product_sizes se on se.id = r.size_entero_id
         join product_sizes sp on sp.id = r.size_porcion_id
        where r.id = $1 and r.activo`,
      [datos.reglaId]
    )
    const regla = reglas[0]
    if (!regla) throw new ErrorPorcionado(404, 'REGLA_NO_ENCONTRADA', 'Ese producto no tiene una regla de porcionado activa.')

    const { rows: sedes } = await db.query(`select 1 from sedes where id = $1 and activo`, [datos.sedeId])
    if (sedes.length === 0) throw new ErrorPorcionado(400, 'SEDE_NO_VALIDA', 'Ese local no existe o está inactivo.')

    const entero = await stockBloqueado(db, datos.sedeId, regla.product_id, regla.size_entero_id)
    const porcion = await stockBloqueado(db, datos.sedeId, regla.product_id, regla.size_porcion_id)

    const plan = planearPorcionado({ enteras: datos.enteras, rendimiento: Number(regla.porciones), entero: aSku(entero), porcion: aSku(porcion) })
    if (!plan.ok) throw new ErrorPorcionado(409, plan.error, plan.detalle)

    await db.query(`update stock set cantidad = $2, actualizado_en = now() where id = $1`, [entero!.id, plan.enterasQuedan])
    if (porcion) {
      // Con porciones de nuevo en la vitrina, el producto vuelve a estar disponible aunque estuviera marcado agotado.
      await db.query(`update stock set cantidad = $2, disponible = true, actualizado_en = now() where id = $1`, [porcion.id, plan.porcionesQuedan])
    } else {
      await db.query(
        `insert into stock (sede_id, product_id, product_size_id, disponible, cantidad) values ($1, $2, $3, true, $4)`,
        [datos.sedeId, regla.product_id, regla.size_porcion_id, plan.porcionesQuedan]
      )
    }

    const { rows } = await db.query(
      `insert into porcionados (sede_id, product_id, size_entero_id, size_porcion_id, producto_nombre, tamano_entero, tamano_porcion,
                                enteras, rendimiento, porciones_generadas, hecho_por)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
      [
        datos.sedeId,
        regla.product_id,
        regla.size_entero_id,
        regla.size_porcion_id,
        regla.producto,
        regla.tamano_entero,
        regla.tamano_porcion,
        datos.enteras,
        regla.porciones,
        plan.porcionesGeneradas,
        usuarioId,
      ]
    )
    return {
      id: rows[0].id,
      producto: regla.producto,
      tamanoEntero: regla.tamano_entero,
      tamanoPorcion: regla.tamano_porcion,
      enteras: datos.enteras,
      porcionesGeneradas: plan.porcionesGeneradas,
      enterasQuedan: plan.enterasQuedan,
      porcionesQuedan: plan.porcionesQuedan,
    }
  })
}

export async function revertirPorcionado(
  usuarioId: string,
  id: string,
  motivo: string | null
): Promise<{ id: string; enterasQuedan: number; porcionesQuedan: number }> {
  return enTransaccion(async (db) => {
    const { rows } = await db.query(`select * from porcionados where id = $1 for update`, [id])
    const p = rows[0]
    if (!p) throw new ErrorPorcionado(404, 'PORCIONADO_NO_ENCONTRADO', 'Ese porcionado no existe.')
    if (p.revertido_en) throw new ErrorPorcionado(409, 'YA_REVERTIDO', 'Este porcionado ya se revirtió.')

    const entero = await stockBloqueado(db, p.sede_id, p.product_id, p.size_entero_id)
    const porcion = await stockBloqueado(db, p.sede_id, p.product_id, p.size_porcion_id)
    const plan = planearReversion({ enteras: p.enteras, porcionesGeneradas: p.porciones_generadas, entero: aSku(entero), porcion: aSku(porcion) })
    if (!plan.ok) throw new ErrorPorcionado(409, plan.error, plan.detalle)

    await db.query(`update stock set cantidad = $2, actualizado_en = now() where id = $1`, [entero!.id, plan.enterasQuedan])
    await db.query(`update stock set cantidad = $2, actualizado_en = now() where id = $1`, [porcion!.id, plan.porcionesQuedan])
    await db.query(`update porcionados set revertido_por = $2, revertido_en = now(), motivo_reversion = $3 where id = $1`, [id, usuarioId, motivo])
    return { id, enterasQuedan: plan.enterasQuedan, porcionesQuedan: plan.porcionesQuedan }
  })
}

export interface PorcionadoListado {
  id: string
  sedeId: string
  sedeNombre: string | null
  producto: string
  tamanoEntero: string
  tamanoPorcion: string
  enteras: number
  rendimiento: number
  porcionesGeneradas: number
  hechoPor: string | null
  hechoEn: string
  revertidoPor: string | null
  revertidoEn: string | null
  motivoReversion: string | null
}

export async function listarPorcionados(opciones: { sedeId?: string; limite: number; desde: number }): Promise<PorcionadoListado[]> {
  const { rows } = await pool.query(
    `select p.*, s.nombre as sede_nombre,
            coalesce(h.nombre, h.usuario) as hecho_por_nombre, coalesce(r.nombre, r.usuario) as revertido_por_nombre
       from porcionados p
       left join sedes s on s.id = p.sede_id
       left join usuarios_dashboard h on h.id = p.hecho_por
       left join usuarios_dashboard r on r.id = p.revertido_por
      where ($1::uuid is null or p.sede_id = $1::uuid)
      order by p.hecho_en desc, p.id
      limit $2 offset $3`,
    [opciones.sedeId ?? null, opciones.limite, opciones.desde]
  )
  return rows.map((r) => ({
    id: r.id,
    sedeId: r.sede_id,
    sedeNombre: r.sede_nombre,
    producto: r.producto_nombre,
    tamanoEntero: r.tamano_entero,
    tamanoPorcion: r.tamano_porcion,
    enteras: r.enteras,
    rendimiento: r.rendimiento,
    porcionesGeneradas: r.porciones_generadas,
    hechoPor: r.hecho_por_nombre ?? null,
    hechoEn: new Date(r.hecho_en).toISOString(),
    revertidoPor: r.revertido_por_nombre ?? null,
    revertidoEn: r.revertido_en ? new Date(r.revertido_en).toISOString() : null,
    motivoReversion: r.motivo_reversion ?? null,
  }))
}

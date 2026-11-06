import type pg from 'pg'
import { cifrarTokenWhatsApp, descifrarTokenWhatsApp } from '../bot/tokensWhatsApp.js'

/**
 * Emisor de comprobantes de cada sede (0037). Hoy solo se carga y se consulta: todavía no se emite ningún
 * comprobante (la facturación con Mifact llega después). El token se guarda CIFRADO y solo sale en claro con
 * `tokenDelEmisor`, que usará la integración de Mifact desde la API — nunca llega al panel.
 */

export interface EmisorMifact {
  sedeId: string
  razonSocial: string
  ruc: string | null
  serieBoleta: string | null
  serieFactura: string | null
  /** true si ya hay un token cargado (el token en sí no se expone acá). */
  tieneToken: boolean
}

type Db = pg.Pool | pg.PoolClient

const aEmisor = (r: Record<string, unknown>): EmisorMifact => ({
  sedeId: r.sede_id as string,
  razonSocial: r.razon_social as string,
  ruc: (r.ruc as string | null) ?? null,
  serieBoleta: (r.serie_boleta as string | null) ?? null,
  serieFactura: (r.serie_factura as string | null) ?? null,
  tieneToken: r.token_cifrado != null,
})

export async function emisorDeSede(db: Db, sedeId: string): Promise<EmisorMifact | null> {
  const { rows } = await db.query(`select * from emisores_mifact where sede_id = $1`, [sedeId])
  return rows[0] ? aEmisor(rows[0]) : null
}

export async function emisoresMifact(db: Db): Promise<EmisorMifact[]> {
  const { rows } = await db.query(`select e.* from emisores_mifact e join sedes s on s.id = e.sede_id order by s.nombre`)
  return rows.map(aEmisor)
}

export class EmisorNoEncontradoError extends Error {
  constructor(sedeId: string) {
    super(`La sede ${sedeId} no tiene un emisor de Mifact registrado (emisores_mifact)`)
    this.name = 'EmisorNoEncontradoError'
  }
}

/**
 * Carga o actualiza RUC, series y/o token del emisor de una sede. Solo toca lo que se pasa (un campo omitido no
 * se borra). Las validaciones de formato las sostiene la base (CHECK en 0037), no solo este código.
 */
export async function guardarCredencialesEmisor(
  db: Db,
  sedeId: string,
  datos: { ruc?: string; serieBoleta?: string; serieFactura?: string; token?: string }
): Promise<EmisorMifact> {
  const { rows } = await db.query(
    `update emisores_mifact
        set ruc = coalesce($2, ruc),
            serie_boleta = coalesce($3, serie_boleta),
            serie_factura = coalesce($4, serie_factura),
            token_cifrado = coalesce($5, token_cifrado),
            actualizado_en = now()
      where sede_id = $1
      returning *`,
    [
      sedeId,
      datos.ruc ?? null,
      datos.serieBoleta ?? null,
      datos.serieFactura ?? null,
      datos.token ? cifrarTokenWhatsApp(datos.token) : null,
    ]
  )
  if (!rows[0]) throw new EmisorNoEncontradoError(sedeId)
  return aEmisor(rows[0])
}

/** El token en claro, solo para la integración de Mifact dentro de la API. */
export async function tokenDelEmisor(db: Db, sedeId: string): Promise<string | null> {
  const { rows } = await db.query(`select token_cifrado from emisores_mifact where sede_id = $1`, [sedeId])
  const cifrado = rows[0]?.token_cifrado as string | null | undefined
  return cifrado ? descifrarTokenWhatsApp(cifrado) : null
}

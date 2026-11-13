import type pg from 'pg'
import { claveNombreCliente, tamanoHabitualDesdeCodigo, type TamanoHabitual } from '@bakebrothers/domain'

/** Una fila de la hoja DATOS de la plantilla: «CLIENTE MAYORISTA» y «TAMAÑO HABITUAL» (GR / MED). */
export interface FilaMayorista {
  nombre: string
  tamano: string
}

export interface ResultadoImportacionMayoristas {
  /** Mayoristas que no existían y se crean (o se crearon, con `aplicar`). */
  creados: { nombre: string; tamano: TamanoHabitual }[]
  /** Ya existían (mismo nombre, sin importar mayúsculas, tildes ni puntuación): no se tocan. */
  yaExistian: string[]
  /** Ya existían sin tamaño habitual y la hoja lo trae: se completa (nunca se pisa uno distinto). */
  tamanoCompletado: { nombre: string; tamano: TamanoHabitual }[]
  /** Ya existían con OTRO tamaño habitual que el de la hoja: no se cambia, lo decide una persona. */
  conflictosDeTamano: { nombre: string; enBase: string; enHoja: TamanoHabitual }[]
  /** El mismo nombre dos veces en la hoja: se usa la primera fila. */
  repetidasEnLaHoja: string[]
  /** Filas que no se pueden importar (sin nombre, o un tamaño que no es GR/MED): nunca se adivina. */
  invalidas: { fila: number; motivo: string; nombre: string }[]
  /** Hay un cliente NO mayorista con el mismo nombre: se importa igual, pero conviene mirarlo. */
  coincidenConClientesNoMayoristas: string[]
}

/**
 * Importa los mayoristas de la hoja DATOS como clientes (es_mayorista = true, tamaño habitual), SIN teléfono: la hoja no lo
 * trae y se completa cuando el cliente lo entregue. Sin `aplicar` solo calcula y devuelve lo que haría (ensayo).
 * Es idempotente: se compara por nombre (claveNombreCliente), así correrlo dos veces no duplica a nadie.
 */
export async function importarMayoristas(
  client: pg.PoolClient,
  tenantId: string,
  filas: FilaMayorista[],
  opciones: { aplicar: boolean }
): Promise<ResultadoImportacionMayoristas> {
  const { rows: existentes } = await client.query<{ id: string; nombre: string; es_mayorista: boolean; tamano_habitual: string | null }>(
    `select id, nombre, es_mayorista, tamano_habitual from customers where tenant_id = $1`,
    [tenantId]
  )
  const mayoristas = new Map<string, (typeof existentes)[number]>()
  const noMayoristas = new Set<string>()
  for (const c of existentes) (c.es_mayorista ? mayoristas.set(claveNombreCliente(c.nombre), c) : noMayoristas.add(claveNombreCliente(c.nombre)))

  const r: ResultadoImportacionMayoristas = {
    creados: [],
    yaExistian: [],
    tamanoCompletado: [],
    conflictosDeTamano: [],
    repetidasEnLaHoja: [],
    invalidas: [],
    coincidenConClientesNoMayoristas: [],
  }
  const vistas = new Set<string>()

  for (const [i, fila] of filas.entries()) {
    const nombre = fila.nombre.trim().replace(/\s+/g, ' ')
    const numeroDeFila = i + 2 // la fila 1 es el encabezado
    const clave = claveNombreCliente(nombre)
    if (!clave) {
      r.invalidas.push({ fila: numeroDeFila, motivo: 'sin nombre', nombre })
      continue
    }
    const tamano = tamanoHabitualDesdeCodigo(fila.tamano)
    if (!tamano) {
      r.invalidas.push({ fila: numeroDeFila, motivo: `tamaño habitual «${fila.tamano}» no es GR ni MED`, nombre })
      continue
    }
    if (vistas.has(clave)) {
      r.repetidasEnLaHoja.push(nombre)
      continue
    }
    vistas.add(clave)

    const existente = mayoristas.get(clave)
    if (existente) {
      if (!existente.tamano_habitual) {
        r.tamanoCompletado.push({ nombre: existente.nombre, tamano })
        if (opciones.aplicar) await client.query(`update customers set tamano_habitual = $2 where id = $1`, [existente.id, tamano])
      } else if (existente.tamano_habitual !== tamano) {
        r.conflictosDeTamano.push({ nombre: existente.nombre, enBase: existente.tamano_habitual, enHoja: tamano })
      } else {
        r.yaExistian.push(existente.nombre)
      }
      continue
    }

    if (noMayoristas.has(clave)) r.coincidenConClientesNoMayoristas.push(nombre)
    r.creados.push({ nombre, tamano })
    if (opciones.aplicar) {
      await client.query(
        `insert into customers (tenant_id, nombre, es_mayorista, tamano_habitual, nombre_confirmado) values ($1, $2, true, $3, true)`,
        [tenantId, nombre, tamano]
      )
    }
  }
  return r
}

/** CSV mínimo con comillas dobles (el que genera Excel / Python): devuelve las filas sin el encabezado. */
export function leerCsvMayoristas(contenido: string): FilaMayorista[] {
  const filas: string[][] = []
  let campo = ''
  let fila: string[] = []
  let entreComillas = false
  const texto = contenido.replace(/^﻿/, '')
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]
    if (entreComillas) {
      if (ch === '"' && texto[i + 1] === '"') {
        campo += '"'
        i++
      } else if (ch === '"') entreComillas = false
      else campo += ch
    } else if (ch === '"') entreComillas = true
    else if (ch === ',') {
      fila.push(campo)
      campo = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++
      fila.push(campo)
      campo = ''
      if (fila.some((c) => c.trim() !== '')) filas.push(fila)
      fila = []
    } else campo += ch
  }
  fila.push(campo)
  if (fila.some((c) => c.trim() !== '')) filas.push(fila)
  return filas.slice(1).map(([nombre = '', tamano = '']) => ({ nombre, tamano }))
}

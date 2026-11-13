// Importación de mayoristas de la hoja DATOS (Etapa 4): sin teléfono, con tamaño habitual, idempotente y sin adivinar.
// Cada prueba corre dentro de una transacción que se revierte: no queda nada en la base. Necesita Postgres con el esquema
// hasta la 0045; sin eso se salta. El lector de CSV se prueba siempre.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { importarMayoristas, leerCsvMayoristas } from '../src/services/importarMayoristas.js'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal = !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

describe('leerCsvMayoristas', () => {
  it('lee nombre y tamaño sin el encabezado, con comillas, BOM y saltos de línea de Windows', () => {
    const csv = '﻿nombre,tamano_habitual_codigo\r\nAGATTA,GR\r\n"CERRILLANITA, CULTURA",MED\r\n\r\n"Con ""comillas""",GR\r\n'
    expect(leerCsvMayoristas(csv)).toEqual([
      { nombre: 'AGATTA', tamano: 'GR' },
      { nombre: 'CERRILLANITA, CULTURA', tamano: 'MED' },
      { nombre: 'Con "comillas"', tamano: 'GR' },
    ])
  })
})

describe.skipIf(!hayBaseDeDatosReal)('importarMayoristas', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let tenantId: string

  beforeAll(async () => {
    client = await pool.connect()
    tenantId = (await client.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
  })
  afterAll(async () => {
    client.release()
    await pool.end()
  })

  const enTransaccion = async (fn: () => Promise<void>) => {
    await client.query('begin')
    try {
      await fn()
    } finally {
      await client.query('rollback')
    }
  }
  const contar = async () => (await client.query(`select count(*)::int n from customers where nombre like 'TEST IMP %'`)).rows[0].n

  const HOJA = [
    { nombre: 'TEST IMP AGATTA', tamano: 'GR' },
    { nombre: 'TEST IMP MIRTHA - HUANUCO', tamano: 'MED' },
    { nombre: 'TEST IMP ALIMENTANDO', tamano: 'GR' },
  ]

  it('ensayo: calcula lo que haría y no escribe nada', async () => {
    await enTransaccion(async () => {
      const r = await importarMayoristas(client, tenantId, HOJA, { aplicar: false })
      expect(r.creados.map((c) => c.nombre)).toEqual(HOJA.map((h) => h.nombre))
      expect(await contar()).toBe(0)
    })
  })

  it('aplicar: crea mayoristas sin teléfono, con su tamaño habitual', async () => {
    await enTransaccion(async () => {
      await importarMayoristas(client, tenantId, HOJA, { aplicar: true })
      const { rows } = await client.query(
        `select nombre, es_mayorista, tamano_habitual, telefono, nombre_confirmado from customers where nombre like 'TEST IMP %' order by nombre`
      )
      expect(rows).toHaveLength(3)
      expect(rows.find((x) => x.nombre === 'TEST IMP AGATTA')).toMatchObject({ es_mayorista: true, tamano_habitual: 'Grande', telefono: null, nombre_confirmado: true })
      expect(rows.find((x) => x.nombre === 'TEST IMP MIRTHA - HUANUCO')?.tamano_habitual).toBe('Mediana')
    })
  })

  it('es idempotente: correrlo otra vez no duplica a nadie, aunque cambien mayúsculas, tildes o puntuación', async () => {
    await enTransaccion(async () => {
      await importarMayoristas(client, tenantId, HOJA, { aplicar: true })
      const otra = await importarMayoristas(
        client,
        tenantId,
        [
          { nombre: 'test imp agatta', tamano: 'GR' },
          { nombre: 'TEST IMP Mirtha Huánuco', tamano: 'MED' },
          { nombre: 'TEST IMP ALIMENTANDO', tamano: 'GR' },
        ],
        { aplicar: true }
      )
      expect(otra.creados).toHaveLength(0)
      expect(otra.yaExistian).toHaveLength(3)
      expect(await contar()).toBe(3)
    })
  })

  it('completa el tamaño de uno que existía sin él, pero NUNCA pisa uno distinto (lo avisa)', async () => {
    await enTransaccion(async () => {
      await client.query(
        `insert into customers (tenant_id, nombre, es_mayorista, tamano_habitual) values ($1, 'TEST IMP SIN TAMANO', true, null), ($1, 'TEST IMP CON TAMANO', true, 'Grande')`,
        [tenantId]
      )
      const r = await importarMayoristas(
        client,
        tenantId,
        [
          { nombre: 'TEST IMP SIN TAMANO', tamano: 'MED' },
          { nombre: 'TEST IMP CON TAMANO', tamano: 'MED' },
        ],
        { aplicar: true }
      )
      expect(r.tamanoCompletado).toEqual([{ nombre: 'TEST IMP SIN TAMANO', tamano: 'Mediana' }])
      expect(r.conflictosDeTamano).toEqual([{ nombre: 'TEST IMP CON TAMANO', enBase: 'Grande', enHoja: 'Mediana' }])
      const { rows } = await client.query(`select nombre, tamano_habitual from customers where nombre like 'TEST IMP %' order by nombre`)
      expect(rows).toEqual([
        { nombre: 'TEST IMP CON TAMANO', tamano_habitual: 'Grande' }, // no se pisó
        { nombre: 'TEST IMP SIN TAMANO', tamano_habitual: 'Mediana' },
      ])
    })
  })

  it('no adivina: un tamaño que no es GR/MED y una fila sin nombre se rechazan y se informan; los repetidos usan la primera fila', async () => {
    await enTransaccion(async () => {
      const r = await importarMayoristas(
        client,
        tenantId,
        [
          { nombre: 'TEST IMP RARO', tamano: 'XL' },
          { nombre: '   ', tamano: 'GR' },
          { nombre: 'TEST IMP DOBLE', tamano: 'GR' },
          { nombre: 'test imp doble', tamano: 'MED' },
        ],
        { aplicar: true }
      )
      expect(r.invalidas.map((x) => x.fila)).toEqual([2, 3])
      expect(r.repetidasEnLaHoja).toEqual(['test imp doble'])
      const { rows } = await client.query(`select nombre, tamano_habitual from customers where nombre ilike 'TEST IMP %'`)
      expect(rows).toEqual([{ nombre: 'TEST IMP DOBLE', tamano_habitual: 'Grande' }])
    })
  })

  it('avisa si el nombre coincide con un cliente que NO es mayorista (se importa igual)', async () => {
    await enTransaccion(async () => {
      await client.query(`insert into customers (tenant_id, nombre, telefono) values ($1, 'TEST IMP JAVIER', '+51999400900')`, [tenantId])
      const r = await importarMayoristas(client, tenantId, [{ nombre: 'TEST IMP JAVIER', tamano: 'GR' }], { aplicar: false })
      expect(r.coincidenConClientesNoMayoristas).toEqual(['TEST IMP JAVIER'])
      expect(r.creados).toHaveLength(1)
    })
  })
})

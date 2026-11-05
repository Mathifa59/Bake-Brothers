// Bandeja de Conversaciones: tomar, devolver al bot, cerrar, asignar local y responder (con la ventana de 24 h de
// WhatsApp y el nombre de quien contesta). Contra Postgres real, cada caso dentro de una transacción que se
// deshace, y `fetch` mockeado (nunca sale un request real a Meta). Se salta sin DATABASE_URL.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { gestionarConversacion, asignarSedeDeConversacion } = await import('../src/services/gestionarConversacion.js')
const { responderConversacion } = await import('../src/services/responderConversacion.js')
const { cifrarTokenWhatsApp } = await import('../src/bot/tokensWhatsApp.js')

const PHONE_ID_BOT = 'PHONE_ID_BANDEJA_DE_PRUEBA'
const USUARIO_LUIS = '44444444-0000-0000-0000-000000000001'

describe.skipIf(!hayBaseDeDatosReal)('bandeja de Conversaciones — gestión y respuesta', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let tenantId: string
  let sedeA: string
  let sedeB: string

  beforeAll(async () => {
    client = await pool.connect()
    tenantId = (await client.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
    // El envío usa el pool (otra conexión), así que el número del bot tiene que estar confirmado en la base:
    // se siembra fuera de las transacciones de cada caso y se borra al final.
    await client.query(`delete from whatsapp_conexiones where phone_number_id = $1`, [PHONE_ID_BOT])
    await client.query(
      `insert into whatsapp_conexiones (sede_id, waba_id, phone_number_id, token_cifrado, tipo_token, origen, uso)
       values (null, 'WABA_BANDEJA', $1, $2, 'sistema', 'manual', 'bot')`,
      [PHONE_ID_BOT, cifrarTokenWhatsApp('token-bandeja-de-prueba')]
    )
  })
  afterAll(async () => {
    await client.query(`delete from whatsapp_conexiones where phone_number_id = $1`, [PHONE_ID_BOT])
    client.release()
    await pool.end()
  })

  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.OK' }] }), text: async () => '' })
  })

  const horasAtras = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()

  /** 2 locales, un usuario con nombre, el número del bot conectado y una conversación sin local. */
  async function sembrar(opciones: { estado?: string; clienteEscribioHace?: number; sede?: 'A' | 'B' | null } = {}) {
    sedeA = (await client.query(`insert into sedes (nombre) values ('Bandeja A') returning id`)).rows[0].id
    sedeB = (await client.query(`insert into sedes (nombre) values ('Bandeja B') returning id`)).rows[0].id
    await client.query(`insert into auth.users (id) values ($1)`, [USUARIO_LUIS])
    await client.query(`insert into usuarios_dashboard (id, rol, sede_id, nombre) values ($1, 'operador', $2, 'Luis')`, [USUARIO_LUIS, sedeA])
    const historial = [
      { rol: 'cliente', texto: 'Hola', en: horasAtras(opciones.clienteEscribioHace ?? 1) },
      { rol: 'bot', texto: 'Hola, ¿en qué te ayudo?', en: horasAtras((opciones.clienteEscribioHace ?? 1) - 0.01) },
    ]
    const sede = opciones.sede === 'A' ? sedeA : opciones.sede === 'B' ? sedeB : null
    const conv = (
      await client.query(
        `insert into conversaciones (tenant_id, canal, external_id, estado, historial, sede_id, whatsapp_phone_number_id)
         values ($1, 'whatsapp', '51999000111', $2, $3::jsonb, $4, $5) returning id`,
        [tenantId, opciones.estado ?? 'escalada', JSON.stringify(historial), sede, PHONE_ID_BOT]
      )
    ).rows[0].id as string
    return conv
  }

  const empleadoDeA = () => ({ id: USUARIO_LUIS, rol: 'operador' as const, sedeId: sedeA })
  const empleadoDeB = () => ({ id: '44444444-0000-0000-0000-000000000002', rol: 'operador' as const, sedeId: sedeB })
  const admin = () => ({ id: '44444444-0000-0000-0000-000000000003', rol: 'admin' as const, sedeId: null })

  const enTransaccion = async (fn: () => Promise<void>) => {
    await client.query('begin')
    try {
      await fn()
    } finally {
      await client.query('rollback')
    }
  }
  const leer = async (id: string) =>
    (await client.query(`select estado, sede_id, contexto, historial from conversaciones where id = $1`, [id])).rows[0]

  it('tomar: un empleado toma una conversación sin local y queda en SU local, atendida por él', async () => {
    await enTransaccion(async () => {
      const id = await sembrar()
      const r = await gestionarConversacion(client, tenantId, empleadoDeA(), id, 'tomar')
      expect(r).toEqual({ ok: true, estado: 'atendida_por_operador', sedeId: sedeA })
      const c = await leer(id)
      expect(c.estado).toBe('atendida_por_operador')
      expect(c.sede_id).toBe(sedeA)
      expect(c.contexto.atendidaPor.nombre).toBe('Luis')
    })
  })

  it('tomar: la dirección puede dejarla sin local o elegir uno; un local inexistente se rechaza', async () => {
    await enTransaccion(async () => {
      const id = await sembrar()
      expect(await gestionarConversacion(client, tenantId, admin(), id, 'tomar')).toMatchObject({ ok: true, sedeId: null })
      expect((await leer(id)).sede_id).toBeNull()
    })
    await enTransaccion(async () => {
      const id = await sembrar()
      expect(await gestionarConversacion(client, tenantId, admin(), id, 'tomar', { sedeId: sedeB })).toMatchObject({ ok: true, sedeId: sedeB })
      expect((await leer(id)).sede_id).toBe(sedeB)
    })
    await enTransaccion(async () => {
      const id = await sembrar()
      expect(await gestionarConversacion(client, tenantId, admin(), id, 'tomar', { sedeId: '00000000-0000-0000-0000-000000000000' })).toEqual({
        ok: false,
        error: 'SEDE_NO_VALIDA',
      })
    })
  })

  it('un empleado NO atiende la conversación de otro local; la de su local sí', async () => {
    await enTransaccion(async () => {
      const id = await sembrar({ sede: 'A' })
      expect(await gestionarConversacion(client, tenantId, empleadoDeB(), id, 'tomar')).toEqual({ ok: false, error: 'SIN_ACCESO_A_LA_CONVERSACION' })
      expect(await gestionarConversacion(client, tenantId, empleadoDeB(), id, 'cerrar')).toEqual({ ok: false, error: 'SIN_ACCESO_A_LA_CONVERSACION' })
      expect((await leer(id)).estado).toBe('escalada')
      expect(await gestionarConversacion(client, tenantId, empleadoDeA(), id, 'tomar')).toMatchObject({ ok: true })
    })
  })

  it('devolver al bot: solo desde «atendida» (o cerrada); borra quién la atendía; el bot vuelve a ser dueño', async () => {
    await enTransaccion(async () => {
      const id = await sembrar()
      // desde «escalada» no (primero se toma)
      expect(await gestionarConversacion(client, tenantId, empleadoDeA(), id, 'devolver')).toMatchObject({ ok: false, error: 'TRANSICION_NO_VALIDA' })
      await gestionarConversacion(client, tenantId, empleadoDeA(), id, 'tomar')
      expect(await gestionarConversacion(client, tenantId, empleadoDeA(), id, 'devolver')).toMatchObject({ ok: true, estado: 'activa' })
      const c = await leer(id)
      expect(c.estado).toBe('activa')
      expect(c.contexto.atendidaPor).toBeUndefined()
    })
  })

  it('cerrar: desde cualquier estado menos «cerrada»', async () => {
    await enTransaccion(async () => {
      const id = await sembrar()
      expect(await gestionarConversacion(client, tenantId, empleadoDeA(), id, 'cerrar')).toMatchObject({ ok: true, estado: 'cerrada' })
      expect(await gestionarConversacion(client, tenantId, empleadoDeA(), id, 'cerrar')).toMatchObject({ ok: false, error: 'TRANSICION_NO_VALIDA' })
      expect(await gestionarConversacion(client, tenantId, empleadoDeA(), '00000000-0000-0000-0000-00000000dead', 'cerrar')).toEqual({ ok: false, error: 'CONVERSACION_NO_ENCONTRADA' })
    })
  })

  it('asignar local (dirección): pone y quita el local sin cambiar el estado', async () => {
    await enTransaccion(async () => {
      const id = await sembrar()
      expect(await asignarSedeDeConversacion(client, tenantId, id, sedeB)).toMatchObject({ ok: true, sedeId: sedeB })
      expect((await leer(id)).sede_id).toBe(sedeB)
      expect(await asignarSedeDeConversacion(client, tenantId, id, null)).toMatchObject({ ok: true, sedeId: null })
      expect((await leer(id)).estado).toBe('escalada')
    })
  })

  it('responder con la ventana ABIERTA: sale por WhatsApp, el mensaje lleva el nombre de quien contestó y la conversación queda en su local', async () => {
    await enTransaccion(async () => {
      const id = await sembrar({ clienteEscribioHace: 3 })
      const r = await responderConversacion(client, tenantId, empleadoDeA(), id, 'Hola, te escribimos del local')
      expect(r).toEqual({ ok: true })
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const c = await leer(id)
      expect(c.estado).toBe('atendida_por_operador')
      expect(c.sede_id).toBe(sedeA)
      const ultimo = c.historial.at(-1)
      expect(ultimo).toMatchObject({ rol: 'operador', texto: 'Hola, te escribimos del local', autor: 'Luis' })
    })
  })

  it('responder con la ventana CERRADA (más de 24 h): no se envía nada y se explica el motivo', async () => {
    await enTransaccion(async () => {
      const id = await sembrar({ clienteEscribioHace: 30 })
      const r = await responderConversacion(client, tenantId, empleadoDeA(), id, 'Hola')
      expect(r).toMatchObject({ ok: false, error: 'VENTANA_24H_CERRADA' })
      expect(mockFetch).not.toHaveBeenCalled()
      const c = await leer(id)
      expect(c.estado).toBe('escalada')
      expect(c.historial).toHaveLength(2)
    })
  })
})

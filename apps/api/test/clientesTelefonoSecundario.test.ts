// Un cliente con DOS teléfonos (migración 0047): lo que sostiene la base (formato, unicidad, cruces) y que el bot y los
// pedidos lo reconozcan escribiendo desde cualquiera de los dos números. Necesita Postgres con el esquema hasta la 0047.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'
import { findOrCreateCustomer, encontrarOCrearClienteDeWhatsApp, listarPedidos } from '../src/repositories/ordersRepo.js'
import { crearPedido } from '../src/services/crearPedido.js'

const hayBaseDeDatosReal = !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

const P1 = '+51999000461' // principal de «Mayorista Doble»
const S1 = '+51999000462' // secundario de «Mayorista Doble»
const P2 = '+51999000463' // principal de otro cliente
const S2 = '+51999000464' // secundario de otro cliente
const TELEFONOS = [P1, S1, P2, S2, '+51999000465']

describe.skipIf(!hayBaseDeDatosReal)('cliente con teléfono secundario', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let client: pg.PoolClient
  let tenantId: string
  let idDoble: string

  const limpiar = () =>
    client.query(`delete from customers where telefono = any($1) or telefono_secundario = any($1)`, [TELEFONOS])
  const insertar = (nombre: string, tel: string | null, sec: string | null, extra = false) =>
    client.query(
      `insert into customers (tenant_id, nombre, telefono, telefono_secundario, es_mayorista) values ($1, $2, $3, $4, $5) returning id`,
      [tenantId, nombre, tel, sec, extra]
    )
  const rechazo = async (consulta: Promise<unknown>) => {
    try {
      await consulta
    } catch (e) {
      return e as { code?: string; constraint?: string; message: string }
    }
    return null
  }

  beforeAll(async () => {
    client = await pool.connect()
    tenantId = (await client.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
    await limpiar()
    idDoble = (await insertar('[PRUEBA] Mayorista Doble', P1, S1, true)).rows[0].id
  })
  afterAll(async () => {
    await limpiar()
    client.release()
    await pool.end()
  })

  describe('lo que sostiene la base', () => {
    it('guarda los dos teléfonos del mismo cliente', async () => {
      const { rows } = await client.query(`select telefono, telefono_secundario from customers where id = $1`, [idDoble])
      expect(rows[0]).toEqual({ telefono: P1, telefono_secundario: S1 })
    })

    it('el secundario tiene que estar en E.164', async () => {
      const e = await rechazo(insertar('[PRUEBA] formato', P2, '912944096'))
      expect(e?.constraint).toBe('customers_telefono_secundario_e164')
    })

    it('no hay secundario sin principal ni secundario igual al principal', async () => {
      expect((await rechazo(insertar('[PRUEBA] sin principal', null, S2)))?.constraint).toBe('customers_telefono_secundario_valido')
      expect((await rechazo(insertar('[PRUEBA] igual', P2, P2)))?.constraint).toBe('customers_telefono_secundario_valido')
    })

    it('un secundario no se repite entre clientes', async () => {
      const e = await rechazo(insertar('[PRUEBA] otro', P2, S1))
      expect(e?.code).toBe('23505')
    })

    it('cruce: el secundario de uno no puede ser el principal de otro, ni al revés', async () => {
      // el secundario de «Doble» (S1) como principal de otro cliente
      expect((await rechazo(insertar('[PRUEBA] cruce 1', S1, null)))?.code).toBe('23505')
      // el principal de «Doble» (P1) como secundario de otro cliente
      expect((await rechazo(insertar('[PRUEBA] cruce 2', P2, P1)))?.code).toBe('23505')
      // y actualizando uno que ya existe
      const otro = (await insertar('[PRUEBA] Otro', P2, null)).rows[0].id
      expect((await rechazo(client.query(`update customers set telefono_secundario = $2 where id = $1`, [otro, S1])))?.code).toBe('23505')
      expect((await rechazo(client.query(`update customers set telefono = $2 where id = $1`, [otro, S1])))?.code).toBe('23505')
      await client.query(`delete from customers where id = $1`, [otro])
    })

    it('actualizar al mismo cliente sin cambiar sus teléfonos no choca consigo mismo', async () => {
      await client.query(`update customers set nombre = '[PRUEBA] Mayorista Doble' where id = $1`, [idDoble])
      await client.query(`update customers set telefono = telefono, telefono_secundario = telefono_secundario where id = $1`, [idDoble])
    })
  })

  describe('el bot y los pedidos lo reconocen por cualquiera de los dos números', () => {
    it('findOrCreateCustomer: el número secundario devuelve al mismo cliente y no crea otro', async () => {
      const antes = (await client.query(`select count(*)::int n from customers where tenant_id = $1`, [tenantId])).rows[0].n
      expect(await findOrCreateCustomer(client, tenantId, { nombre: 'Mayorista', telefono: S1 })).toBe(idDoble)
      expect(await findOrCreateCustomer(client, tenantId, { nombre: 'Mayorista', telefono: '999 000 462' })).toBe(idDoble)
      expect(await findOrCreateCustomer(client, tenantId, { nombre: 'Mayorista', telefono: P1 })).toBe(idDoble)
      const despues = (await client.query(`select count(*)::int n from customers where tenant_id = $1`, [tenantId])).rows[0].n
      expect(despues).toBe(antes)
    })

    it('WhatsApp: quien escribe desde el secundario es el mismo cliente (sin cliente nuevo de «solo el número»)', async () => {
      expect(await encontrarOCrearClienteDeWhatsApp(client, tenantId, '51999000462', 'Perfil WhatsApp')).toBe(idDoble)
      expect(await encontrarOCrearClienteDeWhatsApp(client, tenantId, '51999000461', null)).toBe(idDoble)
      const { rows } = await client.query(`select count(*)::int n from customers where telefono = $1 or telefono_secundario = $1`, [S1])
      expect(rows[0].n).toBe(1)
    })

    it('un número que no es de nadie sí crea un cliente nuevo (sin cambios para el resto)', async () => {
      const id = await encontrarOCrearClienteDeWhatsApp(client, tenantId, '51999000465', 'Alguien')
      expect(id).not.toBeNull()
      expect(id).not.toBe(idDoble)
    })

    it('listarPedidos filtra por cualquiera de los dos números', async () => {
      // Sin pedidos no hay filas, pero la consulta debe aceptar el filtro con el secundario sin error de SQL.
      await expect(listarPedidos(client, tenantId, { telefono: S1 })).resolves.toEqual([])
    })

    it('un mayorista se reconoce por cualquiera de sus dos números: el bot no le toma pedido (lo atiende una persona)', async () => {
      const lima = (hhmm: string) => new Date(`2026-11-13T${hhmm}:00-05:00`)
      const pedido = (telefono: string, ahora: Date) =>
        crearPedido(client, tenantId, 'whatsapp', {
          cliente: { nombre: 'Mayorista Doble', telefono },
          sedeElegida: 'Cedros',
          tipoEntrega: 'tienda',
          fechaEntregaISO: '2026-11-13',
          horario: '9:00 a. m.',
          // Un producto que no existe: si el corte NO rechaza, se cae acá (PRODUCTO_NO_ENCONTRADO) y no crea nada.
          items: [{ tipo: 'producto', busqueda: 'producto-que-no-existe-xyz', cantidad: 1 }],
          metodoPago: 'yape',
          pagoPorAdelantado: false,
          ahora,
        } as never)
      // Con el número principal o con el secundario: el mismo mayorista, rechazado igual (a las 9:00 p. m. incluso).
      expect(await pedido(S1, lima('21:00'))).toMatchObject({ ok: false, error: 'MAYORISTA_ATENCION_DIRECTA' })
      expect(await pedido(P1, lima('21:00'))).toMatchObject({ ok: false, error: 'MAYORISTA_ATENCION_DIRECTA' })
      // Un número que no es de ningún mayorista sigue su camino normal (aquí, para hoy a las 9:00 p. m. la hora de recojo ya pasó).
      expect(await pedido('+51999000465', lima('21:00'))).toMatchObject({ error: 'HORA_PASADA' })
    })
  })
})

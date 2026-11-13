// Lo agotado NO se vende, por ningún camino: el bot (crearPedido + consultarPrecio/listarCatalogo), "Nuevo pedido" del
// dashboard (POST /api/dashboard/orders) y la web (POST /api/orders). La regla es una sola
// (`productoDisponibleEnSede`, packages/domain); acá se prueba que cada camino la aplica de verdad contra Postgres.
//
// Sin sede conocida (la web, un delivery del bot) se acepta si ALGUNA sede lo tiene; con sede, se mira esa sede.
// Un producto sin fila de stock es disponible; un conteo exacto solo bloquea si no alcanza; la venta NO descuenta.
//
// Lo que se mockea: el SDK de Anthropic (un solo test, para ver qué le llega al modelo) y la verificación del JWT del
// dashboard (necesita el JWKS real de Supabase por red; ya la prueban dashboardOrders/dashboardConversaciones con JWT
// reales). Todo lo demás corre real. Necesita Postgres con el esquema (DATABASE_URL real); sin eso se salta.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { fechaLimaISO, sumarDiasISO } from '@bakebrothers/domain'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

process.env.ANTHROPIC_API_KEY ||= 'dummy-para-test-mockeado-nunca-sale-un-request-real'
const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({ messages: { create: mockCreate } })),
}))

// Rol y sede del "operador" salen de headers de prueba (nunca del navegador real); sin header = sin sesión.
vi.mock('../src/auth/verificarJwtOperador.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/auth/verificarJwtOperador.js')>()),
  verificarJwtOperador: async (
    req: { headers: Record<string, string | undefined>; operador?: unknown },
    reply: { code: (n: number) => { send: (b: unknown) => unknown } }
  ) => {
    const rol = req.headers['x-test-rol']
    if (!rol) return reply.code(401).send({ error: 'NO_AUTORIZADO' })
    req.operador = { id: 'operador-de-prueba', rol, sedeId: req.headers['x-test-sede'] ?? null }
  },
}))

const { buildApp } = await import('../src/app.js')
const { crearPedido } = await import('../src/services/crearPedido.js')
const { consultarPrecio, listarCatalogo } = await import('../src/bot/tools.js')
const { evaluarTurno } = await import('../src/bot/cerebro.js')

const TEL = '999000555'
const MANANA = sumarDiasISO(fechaLimaISO(), 1)

interface Sedes {
  cedros: string
  sm: string
}

interface FilaTest {
  producto: string // nombre exacto en el catálogo
  tamano?: string // etiqueta exacta del tamaño (omitir = SKU sin tamaño)
  sede: string // id
  disponible?: boolean
  cantidad?: number | null
}

/** Deja el stock de esos productos exactamente como dice `filas` (borra lo que hubiera de ellos). */
async function fijarStock(db: pg.Pool | pg.PoolClient, filas: FilaTest[], productosExtra: string[] = []) {
  const nombres = [...new Set([...filas.map((f) => f.producto), ...productosExtra])]
  await db.query(`delete from stock where product_id in (select id from products where nombre = any($1))`, [nombres])
  for (const f of filas) {
    await db.query(
      `insert into stock (sede_id, product_id, product_size_id, disponible, cantidad)
       select $1, p.id, ps.id, $4, $5
       from products p left join product_sizes ps on ps.product_id = p.id and ps.tamano = $3
       where p.nombre = $2 and ($3::text is null or ps.id is not null)`,
      [f.sede, f.producto, f.tamano ?? null, f.disponible ?? true, f.cantidad ?? null]
    )
  }
}

/**
 * Filas "agotado" para un producto/tamaño en TODAS las sedes activas de este momento. Otros archivos de test crean
 * sedes temporales mientras corren en paralelo; una sede activa sin fila de stock cuenta como disponible, así que
 * "agotado en todas" tiene que cubrir también esas.
 */
async function agotadoEnTodas(db: pg.Pool | pg.PoolClient, producto: string, tamanos: (string | undefined)[]): Promise<FilaTest[]> {
  const { rows } = await db.query(`select id from sedes where activo`)
  return rows.flatMap((s) => tamanos.map((tamano) => ({ producto, tamano, sede: s.id as string, disponible: false })))
}

const ALFAJOR = 'Alfajor Mix'
const X10 = 'Caja x10'
const X18 = 'Caja x18'

describe.skipIf(!hayBaseDeDatosReal)('lo agotado no se vende', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let tenantId: string
  let sedes: Sedes

  beforeAll(async () => {
    tenantId = (await pool.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
    const { rows } = await pool.query(`select id, nombre from sedes where activo`)
    sedes = {
      cedros: rows.find((r) => r.nombre === 'Cedros').id,
      sm: rows.find((r) => r.nombre === 'Santa Marina').id,
    }
  })
  afterAll(async () => {
    await pool.end()
  })

  // ————————————————————————————————————————————————————————— el bot ————
  describe('el bot (todo dentro de una transacción que se revierte)', () => {
    let client: pg.PoolClient
    beforeEach(async () => {
      mockCreate.mockReset()
      client = await pool.connect()
      await client.query('begin')
    })
    afterEach(async () => {
      await client.query('rollback')
      client.release()
    })

    const pedido = (over: Record<string, unknown> = {}) => ({
      cliente: { nombre: 'Prueba Agotados', telefono: TEL },
      tipoEntrega: 'tienda' as const,
      fechaEntregaISO: MANANA,
      horario: '4pm',
      metodoPago: 'yape' as const,
      pagoPorAdelantado: false,
      items: [{ tipo: 'producto' as const, busqueda: 'alfajor mix', tamano: X10, cantidad: 1 }],
      ...over,
    })
    const pedidosDelCliente = async () =>
      (await client.query(`select count(*)::int n from orders where customer_id in (select id from customers where right(regexp_replace(coalesce(telefono, ''), '\\D', '', 'g'), 9) = right(regexp_replace($1, '\\D', '', 'g'), 9))`, [TEL]))
        .rows[0].n as number

    it('crearPedido: agotado en la sede de la conversación → PRODUCTO_AGOTADO, no se crea nada, y dice dónde sí hay', async () => {
      await fijarStock(client, [{ producto: ALFAJOR, tamano: X10, sede: sedes.cedros, disponible: false }])
      const r = await crearPedido(client, tenantId, 'whatsapp', pedido({ sedeId: sedes.cedros }))
      expect(r.ok).toBe(false)
      if (r.ok) return
      expect(r.error).toBe('PRODUCTO_AGOTADO')
      expect(r.detalle).toMatchObject({
        productos: [{ producto: ALFAJOR, tamano: X10, motivo: 'agotado', disponibleEn: expect.arrayContaining(['Santa Marina']) }],
      })
      expect(JSON.stringify(r.detalle)).not.toContain('"disponibleEn":["Cedros"')
      expect(await pedidosDelCliente()).toBe(0)
    })

    it('crearPedido: la MISMA caja en la otra sede (donde no está agotada) sí se vende', async () => {
      await fijarStock(client, [{ producto: ALFAJOR, tamano: X10, sede: sedes.cedros, disponible: false }])
      const r = await crearPedido(client, tenantId, 'whatsapp', pedido({ sedeId: sedes.sm }))
      expect(r.ok).toBe(true)
      expect(await pedidosDelCliente()).toBe(1)
    })

    it('crearPedido: agotar un tamaño no bloquea el otro tamaño', async () => {
      await fijarStock(client, [{ producto: ALFAJOR, tamano: X10, sede: sedes.cedros, disponible: false }])
      const r = await crearPedido(
        client,
        tenantId,
        'whatsapp',
        pedido({ sedeId: sedes.cedros, items: [{ tipo: 'producto', busqueda: 'alfajor mix', tamano: X18, cantidad: 1 }] })
      )
      expect(r.ok).toBe(true)
    })

    it('crearPedido: una fila del producto ENTERO agotada (sin tamaño) cubre todos sus tamaños (caso BB-2491)', async () => {
      await fijarStock(client, [{ producto: ALFAJOR, sede: sedes.cedros, disponible: false }])
      for (const tamano of [X10, X18]) {
        const r = await crearPedido(
          client,
          tenantId,
          'whatsapp',
          pedido({ sedeId: sedes.cedros, items: [{ tipo: 'producto', busqueda: 'alfajor mix', tamano, cantidad: 1 }] })
        )
        expect(r.ok).toBe(false)
        if (r.ok) return
        expect(r.error).toBe('PRODUCTO_AGOTADO')
        expect(r.detalle).toMatchObject({ productos: [{ producto: ALFAJOR, tamano, motivo: 'agotado' }] })
      }
      expect(await pedidosDelCliente()).toBe(0)
      // En la otra sede sí se vende.
      expect((await crearPedido(client, tenantId, 'whatsapp', pedido({ sedeId: sedes.sm }))).ok).toBe(true)
    })

    it('consultarPrecio: con la fila del producto ENTERO agotada, todos los tamaños salen agotados en esa sede', async () => {
      await fijarStock(client, [{ producto: ALFAJOR, sede: sedes.cedros, disponible: false }])
      const enCedros = await consultarPrecio(client, tenantId, 'alfajor mix', sedes.cedros)
      expect(enCedros?.disponible).toBe(false)
      expect(enCedros?.tamanos.every((t) => t.agotado === true)).toBe(true)
      expect((await consultarPrecio(client, tenantId, 'alfajor mix', sedes.sm))?.disponible).toBe(true)
    })

    it('crearPedido con el número del bot: el local que elige el cliente decide', async () => {
      await fijarStock(client, [{ producto: ALFAJOR, tamano: X10, sede: sedes.cedros, disponible: false }])
      const enCedros = await crearPedido(client, tenantId, 'whatsapp', pedido({ sedeElegida: 'Cedros' }))
      expect(enCedros).toMatchObject({ ok: false, error: 'PRODUCTO_AGOTADO' })
      const enSM = await crearPedido(client, tenantId, 'whatsapp', pedido({ sedeElegida: 'Santa Marina' }))
      expect(enSM.ok).toBe(true)
    })

    it('crearPedido, delivery sin sede: se acepta si alguna sede lo tiene; si está agotado en todas, se rechaza', async () => {
      const delivery = pedido({
        tipoEntrega: 'delivery',
        direccion: 'Av. Prueba 123',
        distrito: 'Chorrillos',
        pagoPorAdelantado: true,
      })
      await fijarStock(client, [{ producto: ALFAJOR, tamano: X10, sede: sedes.cedros, disponible: false }])
      const algunaSede = await crearPedido(client, tenantId, 'whatsapp', delivery)
      expect(algunaSede).toMatchObject({ ok: true, sedeId: null })

      await fijarStock(client, await agotadoEnTodas(client, ALFAJOR, [X10]))
      const ninguna = await crearPedido(client, tenantId, 'whatsapp', delivery)
      expect(ninguna).toMatchObject({ ok: false, error: 'PRODUCTO_AGOTADO' })
    })

    it('conteo exacto: bloquea solo si no alcanza, y la venta NO descuenta', async () => {
      await fijarStock(client, [{ producto: ALFAJOR, tamano: X10, sede: sedes.sm, cantidad: 2 }])
      const tres = await crearPedido(
        client,
        tenantId,
        'whatsapp',
        pedido({ sedeId: sedes.sm, items: [{ tipo: 'producto', busqueda: 'alfajor mix', tamano: X10, cantidad: 3 }] })
      )
      expect(tres).toMatchObject({ ok: false, error: 'PRODUCTO_AGOTADO' })
      if (!tres.ok) expect(tres.detalle).toMatchObject({ productos: [{ motivo: 'cantidad_insuficiente', cantidadDisponible: 2 }] })

      const dos = await crearPedido(
        client,
        tenantId,
        'whatsapp',
        pedido({ sedeId: sedes.sm, items: [{ tipo: 'producto', busqueda: 'alfajor mix', tamano: X10, cantidad: 2 }] })
      )
      expect(dos.ok).toBe(true)
      const { rows } = await client.query(
        `select s.cantidad from stock s join products p on p.id = s.product_id where p.nombre = $1 and s.sede_id = $2`,
        [ALFAJOR, sedes.sm]
      )
      expect(rows[0].cantidad).toBe(2) // no se descontó nada
    })

    it('las líneas del mismo producto se suman antes de comparar contra el conteo', async () => {
      await fijarStock(client, [{ producto: ALFAJOR, tamano: X10, sede: sedes.sm, cantidad: 3 }])
      const r = await crearPedido(
        client,
        tenantId,
        'whatsapp',
        pedido({
          sedeId: sedes.sm,
          items: [
            { tipo: 'producto', busqueda: 'alfajor mix', tamano: X10, cantidad: 2 },
            { tipo: 'producto', busqueda: 'alfajor mix', tamano: X10, cantidad: 2 },
          ],
        })
      )
      expect(r).toMatchObject({ ok: false, error: 'PRODUCTO_AGOTADO' })
    })

    it('combo de composición fija: si un producto del combo está agotado en la sede, no se vende el combo', async () => {
      // Pie Pack = Pie de Manzana individual + Pie de Limón individual (canal ambos).
      await fijarStock(client, [{ producto: 'Pie de Limón', tamano: 'Individual', sede: sedes.cedros, disponible: false }])
      const combo = (sedeId: string) =>
        crearPedido(client, tenantId, 'whatsapp', pedido({ sedeId, items: [{ tipo: 'combo', busqueda: 'Pie Pack', cantidad: 1 }] }))
      const enCedros = await combo(sedes.cedros)
      expect(enCedros).toMatchObject({ ok: false, error: 'PRODUCTO_AGOTADO' })
      if (!enCedros.ok) expect(enCedros.detalle).toMatchObject({ productos: [{ producto: 'Pie de Limón', tamano: 'Individual' }] })
      expect((await combo(sedes.sm)).ok).toBe(true)
    })

    it('combo con cambios: se verifica lo que el cliente ELIGIÓ, no la composición por defecto', async () => {
      // Tortipack permite cambios (por defecto: Carrot Cake + Torta de Chocolate, individuales).
      await fijarStock(client, [{ producto: 'Carrot Cake', tamano: 'Individual', sede: sedes.cedros, disponible: false }])
      const tortipack = (seleccion: { productoBusqueda: string; tamano: string; cantidad: number }[]) =>
        crearPedido(
          client,
          tenantId,
          'whatsapp',
          pedido({ sedeId: sedes.cedros, items: [{ tipo: 'combo', busqueda: 'Tortipack', cantidad: 1, seleccion }] })
        )
      const eligeElAgotado = await tortipack([
        { productoBusqueda: 'carrot cake', tamano: 'Individual', cantidad: 1 },
        { productoBusqueda: 'torta de chocolate con manjar', tamano: 'Individual', cantidad: 1 },
      ])
      expect(eligeElAgotado).toMatchObject({ ok: false, error: 'PRODUCTO_AGOTADO' })

      const cambiaPorOtro = await tortipack([
        { productoBusqueda: 'red velvet', tamano: 'Individual', cantidad: 1 },
        { productoBusqueda: 'torta de chocolate con manjar', tamano: 'Individual', cantidad: 1 },
      ])
      expect(cambiaPorOtro.ok).toBe(true)
    })

    it('consultarPrecio: marca el tamaño agotado, dice dónde, y solo da disponible=false si no queda nada', async () => {
      await fijarStock(client, [{ producto: ALFAJOR, tamano: X10, sede: sedes.cedros, disponible: false }])
      const parcial = await consultarPrecio(client, tenantId, 'alfajor mix', sedes.cedros)
      expect(parcial?.disponible).toBe(true) // todavía hay Caja x18
      expect(parcial?.tamanos.find((t) => t.tamano === X10)?.agotado).toBe(true)
      expect(parcial?.tamanos.find((t) => t.tamano === X18)?.agotado).toBeUndefined()
      expect(parcial?.agotadoEn).toEqual([{ sede: 'Cedros', tamano: X10, motivo: 'agotado' }])

      const pidiendoElAgotado = await consultarPrecio(client, tenantId, 'alfajor mix x10', sedes.cedros)
      expect(pidiendoElAgotado?.tamanoSolicitado?.tamano?.agotado).toBe(true)

      // Todo agotado en Cedros: ahí no se vende, pero con la otra sede (o sin sede) sí.
      await fijarStock(client, [
        { producto: ALFAJOR, tamano: X10, sede: sedes.cedros, disponible: false },
        { producto: ALFAJOR, tamano: X18, sede: sedes.cedros, disponible: false },
      ])
      expect((await consultarPrecio(client, tenantId, 'alfajor mix', sedes.cedros))?.disponible).toBe(false)
      expect((await consultarPrecio(client, tenantId, 'alfajor mix', sedes.sm))?.disponible).toBe(true)
      expect((await consultarPrecio(client, tenantId, 'alfajor mix'))?.disponible).toBe(true)

      // Agotado en todas las sedes: tampoco sin sede.
      await fijarStock(client, await agotadoEnTodas(client, ALFAJOR, [X10, X18]))
      expect((await consultarPrecio(client, tenantId, 'alfajor mix'))?.disponible).toBe(false)
    })

    it('consultarPrecio: dice en qué local está agotado y en cuáles SÍ hay (disponibleEn, con dirección)', async () => {
      const { rows } = await client.query(`select nombre, direccion from sedes where id = $1`, [sedes.sm])
      const sm = { sede: rows[0].nombre, direccion: rows[0].direccion }

      // Agotada la Caja x10 solo en Cedros: en una conversación de Cedros, Santa Marina es la alternativa.
      await fijarStock(client, [{ producto: ALFAJOR, tamano: X10, sede: sedes.cedros, disponible: false }])
      const enCedros = await consultarPrecio(client, tenantId, 'alfajor mix', sedes.cedros)
      expect(enCedros?.localDeLaConversacion).toBe('Cedros')
      expect(enCedros?.disponibleEn).toEqual(expect.arrayContaining([sm]))
      expect(enCedros?.disponibleEn?.some((l) => l.sede === 'Cedros')).toBe(false)
      expect(enCedros?.tamanos.find((t) => t.tamano === X10)).toMatchObject({ agotado: true, disponibleEn: expect.arrayContaining(['Santa Marina']) })
      expect(enCedros?.tamanos.find((t) => t.tamano === X18)?.disponibleEn).toBeUndefined()

      // Desde Santa Marina no hay nada agotado que decir, ni otro local que ofrecer.
      const enSm = await consultarPrecio(client, tenantId, 'alfajor mix', sedes.sm)
      expect(enSm?.localDeLaConversacion).toBe('Santa Marina')
      expect(enSm?.disponibleEn).toBeUndefined()

      // Con el número del bot (sin local): agotadoEn dice dónde se agotó y disponibleEn dónde sí hay.
      const sinLocal = await consultarPrecio(client, tenantId, 'alfajor mix')
      expect(sinLocal?.localDeLaConversacion).toBeUndefined()
      expect(sinLocal?.agotadoEn).toEqual([{ sede: 'Cedros', tamano: X10, motivo: 'agotado' }])
      expect(sinLocal?.disponibleEn).toEqual(expect.arrayContaining([sm]))

      // Producto ENTERO agotado en Cedros (fila sin tamaño): todos los tamaños salen agotados y la alternativa es la misma.
      await fijarStock(client, [{ producto: ALFAJOR, sede: sedes.cedros, disponible: false }])
      const entero = await consultarPrecio(client, tenantId, 'alfajor mix', sedes.cedros)
      expect(entero?.disponible).toBe(false)
      expect(entero?.disponibleEn).toEqual(expect.arrayContaining([sm]))

      // Agotado en todos los locales: no hay otro local que ofrecer (no se inventa).
      await fijarStock(client, await agotadoEnTodas(client, ALFAJOR, [undefined]))
      const enTodos = await consultarPrecio(client, tenantId, 'alfajor mix', sedes.cedros)
      expect(enTodos?.disponible).toBe(false)
      expect(enTodos?.disponibleEn).toBeUndefined()
    })

    it('consultarPrecio de un producto sin tamaños y sin ninguna fila de stock: disponible, sin avisos', async () => {
      await fijarStock(client, [], ['Tartaleta de Frutas'])
      const r = await consultarPrecio(client, tenantId, 'tartaleta de frutas', sedes.cedros)
      expect(r?.disponible).toBe(true)
      expect(r?.agotadoEn).toBeUndefined()
      await fijarStock(client, [{ producto: 'Tartaleta de Frutas', sede: sedes.cedros, disponible: false }])
      expect((await consultarPrecio(client, tenantId, 'tartaleta de frutas', sedes.cedros))?.disponible).toBe(false)
    })

    it('listarCatalogo: no lista lo agotado en esa sede (y avisa cuál se omitió)', async () => {
      await fijarStock(client, [
        { producto: ALFAJOR, tamano: X10, sede: sedes.cedros, disponible: false },
        { producto: ALFAJOR, tamano: X18, sede: sedes.cedros, disponible: false },
      ])
      const nombres = (l: Awaited<ReturnType<typeof listarCatalogo>>) => l.grupos.flatMap((g) => g.productos.map((p) => p.nombre))

      const enCedros = await listarCatalogo(client, tenantId, 'alfajores', sedes.cedros)
      expect(nombres(enCedros)).not.toContain(ALFAJOR)
      expect(nombres(enCedros)).toContain('Alfajor con Manjar') // lo demás sigue
      expect(enCedros.agotadosOmitidos).toEqual([ALFAJOR])

      const enSM = await listarCatalogo(client, tenantId, 'alfajores', sedes.sm)
      expect(nombres(enSM)).toContain(ALFAJOR)
      expect(enSM.agotadosOmitidos).toBeUndefined()

      // Con un solo tamaño agotado el producto sigue en la lista (todavía se puede pedir el otro).
      await fijarStock(client, [{ producto: ALFAJOR, tamano: X10, sede: sedes.cedros, disponible: false }])
      expect(nombres(await listarCatalogo(client, tenantId, 'alfajores', sedes.cedros))).toContain(ALFAJOR)
    })

    it('el modelo recibe PRODUCTO_AGOTADO como resultado de crearPedido y no se crea ningún pedido', async () => {
      await fijarStock(client, [{ producto: ALFAJOR, tamano: X10, sede: sedes.cedros, disponible: false }])
      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            id: 'toolu_agotado',
            name: 'crearPedido',
            input: {
              clienteNombre: 'Prueba Agotados',
              clienteTelefono: TEL,
              tipoEntrega: 'tienda',
              fechaEntregaISO: MANANA,
              horario: '4pm',
              items: [{ tipo: 'producto', busqueda: 'alfajor mix', tamano: X10, cantidad: 1 }],
              metodoPago: 'yape',
              pagoPorAdelantado: false,
            },
          },
        ],
      })
      mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'Hoy esa caja está agotada en Cedros 🙏' }] })

      const r = await evaluarTurno(client, tenantId, [], 'Quiero una caja x10 de alfajor mix para mañana', 'activa', 'whatsapp', sedes.cedros)

      expect(r.herramientasUsadas).toEqual(['crearPedido'])
      expect(r.pedidosCreados ?? []).toHaveLength(0)
      expect(await pedidosDelCliente()).toBe(0)
      // La segunda llamada al modelo lleva el resultado de la herramienta: el error y a dónde ofrecer.
      const mensajes = mockCreate.mock.calls[1][0].messages as { role: string; content: unknown }[]
      const resultadoTool = JSON.stringify(mensajes.at(-1)?.content)
      expect(resultadoTool).toContain('PRODUCTO_AGOTADO')
      expect(resultadoTool).toContain('Santa Marina')
    })
  })

  // ——————————————————————————————— Nuevo pedido y la web (por HTTP) ————
  // Esta parte COMMITEA stock real en la base de pruebas (las rutas usan su propia conexión), así que usa un producto
  // que ningún otro archivo de test pide (Pie de Manzana): con "Alfajor Mix" rompería, en paralelo, los tests del
  // simulador y de campañas que sí lo piden. El stock se restaura al terminar cada test.
  describe('Nuevo pedido (POST /api/dashboard/orders) y la web (POST /api/orders)', () => {
    const PIE = 'Pie de Manzana'
    const TAM = 'Individual'
    let app: Awaited<ReturnType<typeof buildApp>>

    const limpiar = async () => {
      await pool.query(
        `delete from order_items where order_id in (select o.id from orders o join customers c on c.id = o.customer_id where right(regexp_replace(coalesce(c.telefono, ''), '\\D', '', 'g'), 9) = right(regexp_replace($1, '\\D', '', 'g'), 9))`,
        [TEL]
      )
      await pool.query(`delete from orders where customer_id in (select id from customers where right(regexp_replace(coalesce(telefono, ''), '\\D', '', 'g'), 9) = right(regexp_replace($1, '\\D', '', 'g'), 9))`, [TEL])
      await pool.query(`delete from customers where right(regexp_replace(coalesce(telefono, ''), '\\D', '', 'g'), 9) = right(regexp_replace($1, '\\D', '', 'g'), 9)`, [TEL])
    }
    // El stock de estos productos se restaura al terminar (la base de pruebas ya traía algunas filas).
    let respaldo: Record<string, unknown>[] = []
    const NOMBRES = [PIE, 'Tartaleta de Frutas']

    beforeAll(async () => {
      app = await buildApp()
      respaldo = (
        await pool.query(`select s.* from stock s join products p on p.id = s.product_id where p.nombre = any($1)`, [NOMBRES])
      ).rows
    })
    afterEach(async () => {
      await limpiar()
      await pool.query(`delete from stock where product_id in (select id from products where nombre = any($1))`, [NOMBRES])
      for (const f of respaldo) {
        await pool.query(
          `insert into stock (id, sede_id, product_id, product_size_id, disponible, cantidad, actualizado_en) values ($1,$2,$3,$4,$5,$6,$7)`,
          [f.id, f.sede_id, f.product_id, f.product_size_id, f.disponible, f.cantidad, f.actualizado_en]
        )
      }
    })
    afterAll(async () => {
      await app.close()
    })

    const cuerpoDashboard = (items: unknown[], extra: Record<string, unknown> = {}) => ({
      cliente: { nombre: 'Prueba Agotados', telefono: TEL },
      tipoEntrega: 'tienda',
      fechaEntrega: MANANA,
      horario: '4pm',
      items,
      metodoPago: 'yape',
      yaPago: true,
      ...extra,
    })
    const nuevoPedido = (items: unknown[], sedeDelOperador: string | null, rol = 'operador', extra: Record<string, unknown> = {}) =>
      app.inject({
        method: 'POST',
        url: '/api/dashboard/orders',
        headers: { 'x-test-rol': rol, ...(sedeDelOperador ? { 'x-test-sede': sedeDelOperador } : {}) },
        payload: cuerpoDashboard(items, extra),
      })
    const caja = (cantidad = 1, tamano = TAM) => [{ tipo: 'producto', productoId: 'pie de manzana', tamano, cantidad }]

    it('Nuevo pedido: un operador de la sede donde está agotado recibe 409 PRODUCTO_AGOTADO y no queda ningún pedido', async () => {
      await fijarStock(pool, [{ producto: PIE, tamano: TAM, sede: sedes.cedros, disponible: false }])
      const r = await nuevoPedido(caja(), sedes.cedros)
      expect(r.statusCode).toBe(409)
      expect(r.json()).toMatchObject({
        error: 'PRODUCTO_AGOTADO',
        detalle: { productos: [{ producto: PIE, tamano: TAM, disponibleEn: expect.arrayContaining(['Santa Marina']) }] },
      })
      expect((await pool.query(`select count(*)::int n from customers where right(regexp_replace(coalesce(telefono, ''), '\\D', '', 'g'), 9) = right(regexp_replace($1, '\\D', '', 'g'), 9)`, [TEL])).rows[0].n).toBe(0)
    })

    it('Nuevo pedido: una fila del producto ENTERO agotada (sin tamaño) también bloquea — reproduce BB-2491', async () => {
      await fijarStock(pool, [{ producto: PIE, sede: sedes.cedros, disponible: false }]) // sin tamaño: producto entero
      const r = await nuevoPedido(caja(), sedes.cedros)
      expect(r.statusCode).toBe(409)
      expect(r.json()).toMatchObject({
        error: 'PRODUCTO_AGOTADO',
        detalle: { productos: [{ producto: PIE, tamano: TAM, motivo: 'agotado', disponibleEn: expect.arrayContaining(['Santa Marina']) }] },
      })
      expect((await pool.query(`select count(*)::int n from customers where right(regexp_replace(coalesce(telefono, ''), '\\D', '', 'g'), 9) = right(regexp_replace($1, '\\D', '', 'g'), 9)`, [TEL])).rows[0].n).toBe(0)
      // Cualquier otro tamaño del mismo producto, en esa sede, también.
      expect((await nuevoPedido(caja(1, 'Mini 18cm'), sedes.cedros)).statusCode).toBe(409)
      // En la otra sede sí se vende.
      expect((await nuevoPedido(caja(), sedes.sm)).statusCode).toBe(201)
    })

    it('Nuevo pedido: el operador de la otra sede sí puede vender la misma caja', async () => {
      await fijarStock(pool, [{ producto: PIE, tamano: TAM, sede: sedes.cedros, disponible: false }])
      const r = await nuevoPedido(caja(), sedes.sm)
      expect(r.statusCode).toBe(201)
    })

    it('Nuevo pedido: un operador no puede esquivar el bloqueo mandando otra sede en el cuerpo', async () => {
      await fijarStock(pool, [{ producto: PIE, tamano: TAM, sede: sedes.cedros, disponible: false }])
      const r = await nuevoPedido(caja(), sedes.cedros, 'operador', { sedeId: sedes.sm })
      expect(r.statusCode).toBe(409)
    })

    it('Nuevo pedido: un admin que elige la sede donde está agotado también recibe 409', async () => {
      await fijarStock(pool, [{ producto: PIE, tamano: TAM, sede: sedes.cedros, disponible: false }])
      expect((await nuevoPedido(caja(), null, 'admin', { sedeId: sedes.cedros })).statusCode).toBe(409)
      expect((await nuevoPedido(caja(), null, 'admin', { sedeId: sedes.sm })).statusCode).toBe(201)
    })

    it('Nuevo pedido: con conteo, bloquea si no alcanza', async () => {
      await fijarStock(pool, [{ producto: PIE, tamano: TAM, sede: sedes.cedros, cantidad: 2 }])
      const r = await nuevoPedido(caja(3), sedes.cedros)
      expect(r.statusCode).toBe(409)
      expect(r.json().detalle.productos[0]).toMatchObject({ motivo: 'cantidad_insuficiente', cantidadDisponible: 2 })
      expect((await nuevoPedido(caja(2), sedes.cedros)).statusCode).toBe(201)
    })

    it('Nuevo pedido: un combo con un producto agotado en la sede no se vende ahí', async () => {
      // "Combo para ti" (canal presencial) = Refresher + Tartaleta de Frutas.
      await fijarStock(pool, [{ producto: 'Tartaleta de Frutas', sede: sedes.cedros, disponible: false }])
      const combo = [{ tipo: 'combo', comboId: 'Combo para ti', cantidad: 1 }]
      const enCedros = await nuevoPedido(combo, sedes.cedros)
      expect(enCedros.statusCode).toBe(409)
      expect(enCedros.json()).toMatchObject({ error: 'PRODUCTO_AGOTADO', detalle: { productos: [{ producto: 'Tartaleta de Frutas' }] } })
      expect((await nuevoPedido(combo, sedes.sm)).statusCode).toBe(201)
    })

    const pedidoWeb = (cantidad = 1) =>
      app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          cliente: { nombre: 'Prueba Agotados', telefono: TEL },
          tipoEntrega: 'tienda',
          fechaEntrega: MANANA,
          horario: '4pm',
          metodoPago: 'yape',
          items: [{ productoId: 'pie de manzana', tamano: TAM, cantidad }],
        },
      })

    it('web: agotado solo en una sede → se acepta (la otra puede cumplir)', async () => {
      await fijarStock(pool, [{ producto: PIE, tamano: TAM, sede: sedes.cedros, disponible: false }])
      expect((await pedidoWeb()).statusCode).toBe(201)
    })

    it('web: agotado en TODAS las sedes → 409 PRODUCTO_AGOTADO y no queda ningún pedido', async () => {
      await fijarStock(pool, await agotadoEnTodas(pool, PIE, [TAM]))
      const r = await pedidoWeb()
      expect(r.statusCode).toBe(409)
      expect(r.json()).toMatchObject({ error: 'PRODUCTO_AGOTADO', detalle: { productos: [{ producto: PIE, tamano: TAM, disponibleEn: [] }] } })
      expect((await pool.query(`select count(*)::int n from customers where right(regexp_replace(coalesce(telefono, ''), '\\D', '', 'g'), 9) = right(regexp_replace($1, '\\D', '', 'g'), 9)`, [TEL])).rows[0].n).toBe(0)
    })

    it('web: el producto ENTERO agotado (sin tamaño) en TODAS las sedes → 409', async () => {
      await fijarStock(pool, await agotadoEnTodas(pool, PIE, [undefined]))
      const r = await pedidoWeb()
      expect(r.statusCode).toBe(409)
      expect(r.json()).toMatchObject({ error: 'PRODUCTO_AGOTADO', detalle: { productos: [{ producto: PIE, tamano: TAM, disponibleEn: [] }] } })
    })

    it('web: sin ninguna fila de stock (lo normal hoy) todo sigue vendiéndose igual que antes', async () => {
      await fijarStock(pool, [], NOMBRES)
      expect((await pedidoWeb()).statusCode).toBe(201)
    })
  })
})

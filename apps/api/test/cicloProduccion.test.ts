// Ciclo Órdenes → Producción → Stock, de punta a punta contra Postgres real y las rutas reales:
//   · órdenes de mayoristas (cantidades por sabor, total por cotizar, «repetir el anterior») y de Rappi;
//   · corte de las 11:00 p. m. (avisa, no bloquea);
//   · empanada MEDIANA oculta para la web y el bot;
//   · plan del día (por pedido + vitrina) y hojas para imprimir (PDF);
//   · «producido» deja el stock de la sede disponible, suma el conteo solo si se lleva y no duplica al repetir;
//   · un empleado queda forzado a su sede.
//
// Lo que se mockea: SOLO la verificación del JWT del dashboard (necesita el JWKS real de Supabase por red; ya la
// prueban dashboardOrders/dashboardConversaciones con JWT reales). Rol, sede y usuario salen de headers de prueba.
// Necesita Postgres con el esquema (DATABASE_URL real); sin eso se salta.
//
// Estos tests COMMITEAN datos en la base de pruebas (las rutas usan su propia conexión): usan una fecha lejana
// (2031) y clientes «Prueba Ciclo», y lo limpian al terminar, para no pisar a ningún otro archivo en paralelo.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

vi.mock('../src/auth/verificarJwtOperador.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/auth/verificarJwtOperador.js')>()),
  verificarJwtOperador: async (
    req: { headers: Record<string, string | undefined>; operador?: unknown },
    reply: { code: (n: number) => { send: (b: unknown) => unknown } }
  ) => {
    const rol = req.headers['x-test-rol']
    if (!rol) return reply.code(401).send({ error: 'NO_AUTORIZADO' })
    req.operador = { id: req.headers['x-test-id'] ?? null, rol, sedeId: req.headers['x-test-sede'] ?? null }
  },
}))

const { buildApp } = await import('../src/app.js')
const { crearOrdenMayorista, crearOrdenRappi } = await import('../src/services/ordenesEquipo.js')
const { consultarPrecio, listarCatalogo } = await import('../src/bot/tools.js')
const { listarProductos } = await import('../src/repositories/productsRepo.js')

const LUNES = '2031-03-10' // lunes
const DOMINGO = '2031-03-09'
const PREFIJO = 'Prueba Ciclo'

describe.skipIf(!hayBaseDeDatosReal)('ciclo Órdenes → Producción → Stock', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let app: Awaited<ReturnType<typeof buildApp>>
  let tenantId: string
  let cedros: string
  let sm: string
  let prod: Record<string, string> // nombre → id de producto
  let respaldoStock: Record<string, unknown>[] = []

  const PRODUCTOS = ['Empanada de Pollo', 'Empanada de Carne', 'Empanada Hawaiana', 'Cupcakes Artesanal', 'Cheesecake de Fresa', 'Carrot Cake', 'Inka Kola']

  const como = (rol: 'admin' | 'operador', sede: string | null = null) => ({
    'x-test-rol': rol,
    'x-test-id': '00000000-0000-0000-0000-00000000c1c1',
    ...(sede ? { 'x-test-sede': sede } : {}),
  })
  const post = (url: string, headers: Record<string, string>, payload: unknown) => app.inject({ method: 'POST', url, headers, payload: payload as Record<string, unknown> })
  const get = (url: string, headers: Record<string, string>) => app.inject({ method: 'GET', url, headers })

  const limpiar = async () => {
    await pool.query(`delete from order_items where order_id in (select id from orders where fecha_entrega in ($1,$2))`, [LUNES, DOMINGO])
    await pool.query(`delete from orders where fecha_entrega in ($1,$2)`, [LUNES, DOMINGO])
    await pool.query(`delete from customers where nombre like $1 or nombre = 'Rappi'`, [`${PREFIJO}%`])
    await pool.query(`delete from produccion_dia where fecha in ($1,$2)`, [LUNES, DOMINGO])
    await pool.query(`delete from plan_vitrina where product_id = any($1::uuid[])`, [Object.values(prod)])
    await pool.query(`delete from stock where product_id = any($1::uuid[])`, [Object.values(prod)])
    for (const f of respaldoStock) {
      await pool.query(
        `insert into stock (id, sede_id, product_id, product_size_id, disponible, cantidad, actualizado_en) values ($1,$2,$3,$4,$5,$6,$7)`,
        [f.id, f.sede_id, f.product_id, f.product_size_id, f.disponible, f.cantidad, f.actualizado_en]
      )
    }
  }

  beforeAll(async () => {
    app = await buildApp()
    tenantId = (await pool.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
    const { rows: sedes } = await pool.query(`select id, nombre from sedes where activo`)
    cedros = sedes.find((s) => s.nombre === 'Cedros').id
    sm = sedes.find((s) => s.nombre === 'Santa Marina').id
    const { rows } = await pool.query(`select id, nombre from products where nombre = any($1)`, [PRODUCTOS])
    prod = Object.fromEntries(rows.map((r) => [r.nombre, r.id]))
    respaldoStock = (await pool.query(`select * from stock where product_id = any($1::uuid[])`, [Object.values(prod)])).rows
    await limpiar()
  })
  afterEach(limpiar)
  afterAll(async () => {
    await limpiar()
    await app.close()
    await pool.end()
  })

  const mayorista = (over: Record<string, unknown> = {}) => ({
    cliente: { nombre: `${PREFIJO} Panadería Sol` },
    fechaEntrega: LUNES,
    hora: '7:30',
    empanadas: [
      { productoId: prod['Empanada de Pollo'], tamano: 'Mediana', cantidad: 60 },
      { productoId: prod['Empanada de Carne'], tamano: 'Mediana', cantidad: 40 },
    ],
    postres: [{ productoId: prod['Cheesecake de Fresa'], tamano: 'Individual', cantidad: 6 }],
    ...over,
  })

  // ——————————————————————————————————————————————————————— mayoristas ————
  describe('órdenes de mayoristas', () => {
    it('registra la orden como pedido confirmado, con el total por cotizar y las líneas por sabor y tamaño', async () => {
      const r = await post('/api/dashboard/ordenes/mayorista', como('operador', cedros), mayorista())
      expect(r.statusCode).toBe(201)
      const { numero } = r.json()
      const { rows: [o] } = await pool.query(
        `select o.*, c.nombre, c.es_mayorista, c.tamano_habitual, c.hora_habitual from orders o join customers c on c.id = o.customer_id where o.numero = $1`,
        [numero]
      )
      expect(o).toMatchObject({
        canal: 'mayorista',
        estado: 'confirmed',
        sede_id: cedros,
        horario_entrega: '07:30', // hora en 24 h, canónica
        total_pendiente: true,
        subtotal: '0.00',
        total: '0.00',
        es_mayorista: true,
        tamano_habitual: 'Mediana',
        hora_habitual: '07:30',
      })
      const { rows: items } = await pool.query(`select nombre_producto, tamano, cantidad from order_items where order_id = $1 order by nombre_producto`, [o.id])
      expect(items).toEqual([
        { nombre_producto: 'Cheesecake de Fresa', tamano: 'Individual', cantidad: 6 },
        { nombre_producto: 'Empanada de Carne', tamano: 'Mediana', cantidad: 40 },
        { nombre_producto: 'Empanada de Pollo', tamano: 'Mediana', cantidad: 60 },
      ])
    })

    it('«grande» es la empanada sin tamaño (la de siempre)', async () => {
      const r = await post('/api/dashboard/ordenes/mayorista', como('operador', cedros), mayorista({ empanadas: [{ productoId: prod['Empanada Hawaiana'], tamano: 'Grande', cantidad: 12 }], postres: [] }))
      expect(r.statusCode).toBe(201)
      const { rows } = await pool.query(`select tamano from order_items oi join orders o on o.id = oi.order_id where o.numero = $1`, [r.json().numero])
      expect(rows).toEqual([{ tamano: null }])
    })

    it('un empleado queda forzado a su sede aunque mande otra; el admin elige la sede', async () => {
      const emp = await post('/api/dashboard/ordenes/mayorista', como('operador', cedros), mayorista({ sedeId: sm }))
      expect((await pool.query(`select sede_id from orders where numero = $1`, [emp.json().numero])).rows[0].sede_id).toBe(cedros)
      const adm = await post('/api/dashboard/ordenes/mayorista', como('admin'), mayorista({ sedeId: sm, cliente: { nombre: `${PREFIJO} Bodega Luz` } }))
      expect((await pool.query(`select sede_id from orders where numero = $1`, [adm.json().numero])).rows[0].sede_id).toBe(sm)
    })

    it('rechaza lo que no tiene sentido: sin sesión, sin líneas, hora ilegible, un producto que no es empanada como empanada', async () => {
      expect((await post('/api/dashboard/ordenes/mayorista', {}, mayorista())).statusCode).toBe(401)
      expect((await post('/api/dashboard/ordenes/mayorista', como('operador', cedros), mayorista({ empanadas: [], postres: [] }))).json().error).toBe('SIN_ITEMS')
      const hora = await post('/api/dashboard/ordenes/mayorista', como('operador', cedros), mayorista({ hora: 'temprano' }))
      expect(hora.statusCode).toBe(400)
      expect(hora.json().error).toBe('HORA_INVALIDA')
      const noEmp = await post('/api/dashboard/ordenes/mayorista', como('operador', cedros), mayorista({ empanadas: [{ productoId: prod['Carrot Cake'], tamano: 'Grande', cantidad: 1 }] }))
      expect(noEmp.json().error).toBe('NO_ES_EMPANADA')
      const sinNombre = await post('/api/dashboard/ordenes/mayorista', como('operador', cedros), mayorista({ cliente: {} }))
      expect(sinNombre.json().error).toBe('CLIENTE_REQUERIDO')
      expect((await pool.query(`select count(*)::int n from customers where nombre like $1`, [`${PREFIJO}%`])).rows[0].n).toBe(0)
    })

    it('«repetir el anterior»: devuelve las líneas de la última orden de ese cliente (y 404 si no hay)', async () => {
      const primera = await post('/api/dashboard/ordenes/mayorista', como('operador', cedros), mayorista())
      const { rows: [c] } = await pool.query(`select c.id from customers c join orders o on o.customer_id = c.id where o.numero = $1`, [primera.json().numero])
      const r = await get(`/api/dashboard/ordenes/mayorista/ultima?clienteId=${c.id}`, como('operador', cedros))
      expect(r.statusCode).toBe(200)
      const u = r.json()
      expect(u.hora).toBe('07:30')
      expect(u.empanadas).toEqual(
        expect.arrayContaining([
          { productoId: prod['Empanada de Pollo'], tamano: 'Mediana', cantidad: 60 },
          { productoId: prod['Empanada de Carne'], tamano: 'Mediana', cantidad: 40 },
        ])
      )
      expect(u.postres).toEqual([{ productoId: prod['Cheesecake de Fresa'], tamano: 'Individual', cantidad: 6 }])

      // Con ese cliente se registra de nuevo SIN duplicar al cliente (mismo nombre → mismo cliente).
      const segunda = await post('/api/dashboard/ordenes/mayorista', como('operador', cedros), mayorista({ cliente: { id: c.id }, fechaEntrega: DOMINGO }))
      expect(segunda.statusCode).toBe(201)
      expect((await pool.query(`select count(*)::int n from customers where nombre like $1`, [`${PREFIJO}%`])).rows[0].n).toBe(1)

      const otro = await pool.query(`insert into customers (tenant_id, nombre, telefono) values ($1, $2, '+51999000321') returning id`, [tenantId, `${PREFIJO} Sin órdenes`])
      expect((await get(`/api/dashboard/ordenes/mayorista/ultima?clienteId=${otro.rows[0].id}`, como('operador', cedros))).statusCode).toBe(404)
    })

    it('una orden anulada no cuenta como «el anterior»', async () => {
      const r = await post('/api/dashboard/ordenes/mayorista', como('operador', cedros), mayorista())
      await pool.query(`update orders set estado = 'cancelled' where numero = $1`, [r.json().numero])
      const { rows: [c] } = await pool.query(`select customer_id as id from orders where numero = $1`, [r.json().numero])
      expect((await get(`/api/dashboard/ordenes/mayorista/ultima?clienteId=${c.id}`, como('operador', cedros))).statusCode).toBe(404)
    })
  })

  // ———————————————————————————————————————————————————— corte 10:30 p. m. ————
  describe('corte de las 11:00 p. m.: avisa, no bloquea', () => {
    const conAhora = async (iso: string) => {
      const c = await pool.connect()
      try {
        await c.query('begin')
        const r = await crearOrdenMayorista(c, tenantId, {
          cliente: { nombre: `${PREFIJO} Corte` },
          sedeId: cedros,
          fechaEntregaISO: LUNES,
          hora: '7:30',
          empanadas: [{ productoId: prod['Empanada de Pollo'], tamano: 'Mediana', cantidad: 5 }],
          postres: [],
          ahora: new Date(iso),
        })
        const { rows } = r.ok ? await c.query(`select fuera_de_corte from orders where numero = $1`, [r.numero]) : { rows: [] }
        await c.query('rollback')
        return { r, fuera: rows[0]?.fuera_de_corte }
      } finally {
        c.release()
      }
    }
    // Entrega el lunes 10/03/2031: el corte es el domingo 09/03 a las 23:00 hora de Lima (= 04:00Z del lunes).
    it('registrada el domingo 10:59 p. m. → a tiempo', async () => {
      const { r, fuera } = await conAhora('2031-03-10T03:59:00Z')
      expect(r.ok).toBe(true)
      expect(fuera).toBe(false)
    })
    it('registrada el domingo 11:00 p. m. → se registra igual, marcada fuera de corte', async () => {
      const { r, fuera } = await conAhora('2031-03-10T04:00:00Z')
      expect(r.ok).toBe(true) // no bloquea
      if (r.ok) expect(r.corte).toEqual({ fueraDeCorte: true, motivo: 'pasado_el_corte' })
      expect(fuera).toBe(true)
    })
    it('registrada el mismo lunes (para hoy) → fuera de corte', async () => {
      const { r, fuera } = await conAhora('2031-03-10T15:00:00Z')
      expect(r.ok).toBe(true)
      expect(fuera).toBe(true)
    })
  })

  // ————————————————————————————————————————————————————————————— Rappi ————
  describe('órdenes de Rappi', () => {
    const rappi = (over: Record<string, unknown> = {}) => ({
      referenciaExterna: 'RAP-5521',
      fechaEntrega: LUNES,
      hora: '1:30 pm',
      items: [{ productoId: prod['Cupcakes Artesanal'], cantidad: 3 }, { productoId: prod['Carrot Cake'], tamano: 'Individual', cantidad: 2 }],
      total: 61.4,
      ...over,
    })

    it('registra la orden de la tablet: número de orden, productos y el total tal cual', async () => {
      const r = await post('/api/dashboard/ordenes/rappi', como('operador', cedros), rappi())
      expect(r.statusCode).toBe(201)
      const { rows: [o] } = await pool.query(`select o.*, c.nombre from orders o join customers c on c.id = o.customer_id where o.numero = $1`, [r.json().numero])
      expect(o).toMatchObject({ canal: 'rappi', estado: 'confirmed', referencia_externa: 'RAP-5521', total: '61.40', subtotal: '61.40', total_pendiente: false, nombre: 'Rappi', horario_entrega: '13:30', sede_id: cedros })
      const { rows: items } = await pool.query(`select nombre_producto, tamano, cantidad, precio_unitario from order_items where order_id = $1 order by nombre_producto`, [o.id])
      expect(items.map((i) => [i.nombre_producto, i.tamano, i.cantidad, i.precio_unitario])).toEqual([
        ['Carrot Cake', 'Individual', 2, '0.00'], // los precios de Rappi no son los de la carta: líneas sin precio
        ['Cupcakes Artesanal', null, 3, '0.00'],
      ])
    })

    it('la misma orden de Rappi no se registra dos veces', async () => {
      await post('/api/dashboard/ordenes/rappi', como('operador', cedros), rappi())
      const otra = await post('/api/dashboard/ordenes/rappi', como('operador', cedros), rappi())
      expect(otra.statusCode).toBe(409)
      expect(otra.json().error).toBe('ORDEN_RAPPI_DUPLICADA')
      expect((await pool.query(`select count(*)::int n from orders where canal = 'rappi' and referencia_externa = 'RAP-5521'`)).rows[0].n).toBe(1)
    })

    it('rechaza total inválido, sin productos y producto inexistente', async () => {
      expect((await post('/api/dashboard/ordenes/rappi', como('operador', cedros), rappi({ total: 0 }))).statusCode).toBe(400)
      expect((await post('/api/dashboard/ordenes/rappi', como('operador', cedros), rappi({ items: [] }))).statusCode).toBe(400)
      const inexistente = await post('/api/dashboard/ordenes/rappi', como('operador', cedros), rappi({ items: [{ productoId: '11111111-1111-4111-8111-111111111111', cantidad: 1 }] }))
      expect(inexistente.json().error).toBe('PRODUCTO_NO_ENCONTRADO')
    })

    it('un servicio con `ahora` fuera de corte también marca las órdenes de Rappi', async () => {
      const c = await pool.connect()
      try {
        await c.query('begin')
        const r = await crearOrdenRappi(c, tenantId, {
          referenciaExterna: 'RAP-CORTE',
          sedeId: cedros,
          fechaEntregaISO: LUNES,
          items: [{ productoId: prod['Cupcakes Artesanal'], cantidad: 1 }],
          total: 8.9,
          ahora: new Date('2031-03-10T04:15:00Z'),
        })
        expect(r.ok && r.corte.fueraDeCorte).toBe(true)
        await c.query('rollback')
      } finally {
        c.release()
      }
    })
  })

  // ————————————————————————————————————————————— MEDIANA oculta (web y bot) ————
  describe('empanada MEDIANA: oculta para la web y el bot, sin precio hasta confirmarlo', () => {
    it('existe en la base en los 10 sabores, oculta y sin precio', async () => {
      const { rows } = await pool.query(`select visible_publico, precio from product_sizes where tamano = 'Mediana'`)
      expect(rows).toHaveLength(10)
      expect(rows.every((r) => r.visible_publico === false && r.precio === null)).toBe(true)
    })
    it('el catálogo de la web sigue diciendo que la empanada no tiene tamaños', async () => {
      const c = await pool.connect()
      try {
        const productos = await listarProductos(c, tenantId)
        const emp = productos.find((p) => p.nombre === 'Empanada de Pollo')
        expect(emp?.tamanos).toBe(false)
      } finally {
        c.release()
      }
    })
    it('el bot no la ve: consultarPrecio no lista «Mediana» y listarCatalogo tampoco la presenta como tamaño', async () => {
      const c = await pool.connect()
      try {
        const p = await consultarPrecio(c, tenantId, 'empanada de pollo')
        expect(p?.tamanos).toEqual([])
        const l = await listarCatalogo(c, tenantId, 'empanadas')
        const pollo = l.grupos.flatMap((g) => g.productos).find((x) => x.nombre === 'Empanada de Pollo')
        expect(pollo?.variosTamanos).toBe(false)
        // Si el cliente pide «mediana», el bot no la conoce: no hay producto con ese nombre ni tamaño con ese nombre.
        const pedida = await consultarPrecio(c, tenantId, 'empanada mediana de pollo')
        expect(pedida === null || !pedida.tamanos.some((t) => t.tamano === 'Mediana')).toBe(true)
      } finally {
        c.release()
      }
    })
  })

  // ——————————————————————————————————————————————————— plan del día + PDFs ————
  describe('plan del día', () => {
    const vitrina = (sede: string, producto: string, cantidad: number, domingo: number | null = null, tamano: string | null = null) =>
      pool.query(
        `insert into plan_vitrina (sede_id, product_id, product_size_id, cantidad, cantidad_domingo)
         select $1, p.id, ps.id, $3, $4 from products p left join product_sizes ps on ps.product_id = p.id and ps.tamano = $5 where p.nombre = $2`,
        [sede, producto, cantidad, domingo, tamano]
      )
    const nuevoPedidoDeTienda = (sede: string, items: unknown[], yaPago = true) =>
      post('/api/dashboard/orders', como('operador', sede), {
        cliente: { nombre: `${PREFIJO} Tienda`, telefono: '999000654' },
        tipoEntrega: 'tienda',
        fechaEntrega: LUNES,
        horario: '10am',
        items,
        metodoPago: 'yape',
        yaPago,
      })

    it('suma lo que se produce por pedido (mayoristas, tienda, Rappi) con lo de vitrina, por sede', async () => {
      await post('/api/dashboard/ordenes/mayorista', como('operador', cedros), mayorista())
      await post('/api/dashboard/ordenes/rappi', como('operador', cedros), { referenciaExterna: 'RAP-1', fechaEntrega: LUNES, items: [{ productoId: prod['Cupcakes Artesanal'], cantidad: 3 }], total: 26.7 })
      await nuevoPedidoDeTienda(cedros, [{ tipo: 'producto', productoId: 'cupcakes', cantidad: 2 }])
      await vitrina(cedros, 'Cupcakes Artesanal', 12)
      await vitrina(cedros, 'Empanada de Pollo', 20)
      await vitrina(sm, 'Cupcakes Artesanal', 99) // otra sede: no debe aparecer en el plan de Cedros

      const r = await get(`/api/dashboard/produccion/plan?fecha=${LUNES}`, como('operador', cedros))
      expect(r.statusCode).toBe(200)
      const plan = r.json()
      const l = (nombre: string, tamano: string | null = null) => plan.lineas.find((x: { nombre: string; tamano: string | null }) => x.nombre === nombre && x.tamano === tamano)
      expect(l('Cupcakes Artesanal')).toMatchObject({ porPedido: 5, vitrina: 12, total: 17 }) // 3 Rappi + 2 tienda; vitrina de Cedros
      expect(l('Empanada de Pollo', 'Mediana')).toMatchObject({ porPedido: 60, antesDe8: 60 }) // el mayorista sale a las 7:30
      expect(l('Empanada de Pollo')).toMatchObject({ porPedido: 0, vitrina: 20 }) // la grande de vitrina, aparte de la mediana
      expect(l('Cheesecake de Fresa', 'Individual')).toMatchObject({ porPedido: 6 })

      // La hoja: lo que sale antes de las 8, las empanadas por sabor y el resto por área.
      expect(plan.hoja.antesDe8.map((x: { nombre: string; cantidad: number }) => [x.nombre, x.cantidad])).toEqual(
        expect.arrayContaining([['Empanada de Carne', 40], ['Empanada de Pollo', 60]])
      )
      const pollo = plan.hoja.empanadas.filas.find((x: { sabor: string }) => x.sabor === 'Pollo')
      expect(pollo).toMatchObject({ mediana: 60, grande: 20, mini: 0, total: 80 })
      expect(plan.hoja.porArea.map((a: { nombre: string }) => a.nombre)).toContain('Pastelería')
    })

    it('un empleado ve SOLO su sede; el admin ve todas juntas', async () => {
      await post('/api/dashboard/ordenes/mayorista', como('operador', cedros), mayorista())
      await post('/api/dashboard/ordenes/mayorista', como('operador', sm), mayorista({ cliente: { nombre: `${PREFIJO} Bodega SM` } }))
      const soloCedros = (await get(`/api/dashboard/produccion/plan?fecha=${LUNES}`, como('operador', cedros))).json()
      const soloSM = (await get(`/api/dashboard/produccion/plan?fecha=${LUNES}`, como('operador', sm))).json()
      const todas = (await get(`/api/dashboard/produccion/plan?fecha=${LUNES}`, como('admin'))).json()
      const pollo = (p: { lineas: { nombre: string; tamano: string | null; porPedido: number }[] }) => p.lineas.find((x) => x.nombre === 'Empanada de Pollo' && x.tamano === 'Mediana')!.porPedido
      expect(pollo(soloCedros)).toBe(60)
      expect(pollo(soloSM)).toBe(60)
      expect(pollo(todas)).toBe(120)
      // Un empleado no puede pedir otra sede por la URL.
      const intento = (await get(`/api/dashboard/produccion/plan?fecha=${LUNES}&sedeId=${sm}`, como('operador', cedros))).json()
      expect(pollo(intento)).toBe(60)
      expect((await get(`/api/dashboard/produccion/plan?fecha=${LUNES}`, {})).statusCode).toBe(401)
    })

    it('el domingo usa la cantidad de vitrina del domingo', async () => {
      await vitrina(cedros, 'Cupcakes Artesanal', 12, 5)
      const dom = (await get(`/api/dashboard/produccion/plan?fecha=${DOMINGO}`, como('operador', cedros))).json()
      const lun = (await get(`/api/dashboard/produccion/plan?fecha=${LUNES}`, como('operador', cedros))).json()
      expect(dom.lineas.find((x: { nombre: string }) => x.nombre === 'Cupcakes Artesanal').vitrina).toBe(5)
      expect(lun.lineas.find((x: { nombre: string }) => x.nombre === 'Cupcakes Artesanal').vitrina).toBe(12)
    })

    it('los pedidos que esperan pago y las bebidas no están en el plan; los pedidos sin sede se avisan aparte', async () => {
      await nuevoPedidoDeTienda(cedros, [{ tipo: 'producto', productoId: 'inka kola', cantidad: 4 }])
      const pendiente = await nuevoPedidoDeTienda(cedros, [{ tipo: 'producto', productoId: 'cupcakes', cantidad: 7 }], false)
      await pool.query(`update orders set estado = 'payment_pending' where numero = $1`, [pendiente.json().numero])
      await pool.query(`update orders o set sede_id = null where o.numero = $1`, [(await nuevoPedidoDeTienda(cedros, [{ tipo: 'producto', productoId: 'cupcakes', cantidad: 1 }])).json().numero])
      const plan = (await get(`/api/dashboard/produccion/plan?fecha=${LUNES}`, como('operador', cedros))).json()
      expect(plan.lineas.find((x: { nombre: string }) => x.nombre === 'Inka Kola')).toBeUndefined() // no se produce
      expect(plan.lineas.find((x: { nombre: string }) => x.nombre === 'Cupcakes Artesanal')).toBeUndefined() // el pendiente de pago no cuenta; el sin sede es de nadie
      expect(plan.pagoPendiente).toBe(1)
      expect(plan.sinAsignar).toBe(1)
    })

    it('hoja de producción y hoja de empaque mayorista salen en PDF (A4) y respetan la sede', async () => {
      await post('/api/dashboard/ordenes/mayorista', como('operador', cedros), mayorista())
      await post('/api/dashboard/ordenes/mayorista', como('operador', sm), mayorista({ cliente: { nombre: `${PREFIJO} Bodega SM` } }))
      const hoja = await get(`/api/dashboard/produccion/hoja.pdf?fecha=${LUNES}`, como('operador', cedros))
      expect(hoja.statusCode).toBe(200)
      expect(hoja.headers['content-type']).toBe('application/pdf')
      expect(hoja.rawPayload.subarray(0, 4).toString()).toBe('%PDF')
      const empaque = await get(`/api/dashboard/ordenes/empaque-mayorista.pdf?fecha=${LUNES}`, como('operador', cedros))
      expect(empaque.statusCode).toBe(200)
      expect(empaque.rawPayload.subarray(0, 4).toString()).toBe('%PDF')
      expect(empaque.headers['content-disposition']).toContain(`empaque-mayorista-${LUNES}.pdf`)
      expect((await get(`/api/dashboard/produccion/hoja.pdf?fecha=${LUNES}`, {})).statusCode).toBe(401)
      expect((await get(`/api/dashboard/produccion/hoja.pdf?fecha=mañana`, como('admin'))).statusCode).toBe(400)
    })
  })

  // ———————————————————————————————————————————————— producido → stock ————
  describe('producido → stock', () => {
    const vitrina = (sede: string, producto: string, cantidad: number, tamano: string | null = null) =>
      pool.query(
        `insert into plan_vitrina (sede_id, product_id, product_size_id, cantidad)
         select $1, p.id, ps.id, $3 from products p left join product_sizes ps on ps.product_id = p.id and ps.tamano = $4 where p.nombre = $2`,
        [sede, producto, cantidad, tamano]
      )
    const stockDe = async (sede: string, producto: string, tamano: string | null = null) =>
      (
        await pool.query(
          `select s.disponible, s.cantidad from stock s join products p on p.id = s.product_id left join product_sizes ps on ps.id = s.product_size_id
           where s.sede_id = $1 and p.nombre = $2 and ($3::text is null or ps.tamano = $3)`,
          [sede, producto, tamano]
        )
      ).rows[0]
    const producido = (headers: Record<string, string>, producto: string, cantidadProducida: number, tamano: string | null = null, sede?: string) =>
      post('/api/dashboard/produccion/producido', headers, { fecha: LUNES, productId: prod[producto], tamano, cantidadProducida, ...(sede ? { sedeId: sede } : {}) })

    it('sin fila de stock: queda DISPONIBLE, sin conteo (el conteo exacto sigue siendo opcional)', async () => {
      await vitrina(cedros, 'Cupcakes Artesanal', 12)
      expect(await stockDe(cedros, 'Cupcakes Artesanal')).toBeUndefined()
      const r = await producido(como('operador', cedros), 'Cupcakes Artesanal', 12)
      expect(r.statusCode).toBe(200)
      expect(r.json()).toMatchObject({ aVitrina: 12, stockActualizado: true, cantidadStock: null })
      expect(await stockDe(cedros, 'Cupcakes Artesanal')).toEqual({ disponible: true, cantidad: null })
    })

    it('un producto que estaba AGOTADO vuelve a estar disponible al marcarlo producido', async () => {
      await vitrina(cedros, 'Cupcakes Artesanal', 12)
      await pool.query(`insert into stock (sede_id, product_id, disponible) values ($1, $2, false)`, [cedros, prod['Cupcakes Artesanal']])
      await producido(como('operador', cedros), 'Cupcakes Artesanal', 12)
      expect((await stockDe(cedros, 'Cupcakes Artesanal')).disponible).toBe(true)
    })

    it('con conteo: se suma lo producido para vitrina (descontando lo comprometido por pedido) y marcar de nuevo NO duplica', async () => {
      await vitrina(cedros, 'Cupcakes Artesanal', 12)
      await pool.query(`insert into stock (sede_id, product_id, disponible, cantidad) values ($1, $2, true, 5)`, [cedros, prod['Cupcakes Artesanal']])
      // 3 por pedido (Rappi) + 12 de vitrina: se producen 15 → 12 van a la vitrina.
      await post('/api/dashboard/ordenes/rappi', como('operador', cedros), { referenciaExterna: 'RAP-9', fechaEntrega: LUNES, items: [{ productoId: prod['Cupcakes Artesanal'], cantidad: 3 }], total: 26.7 })
      const a = await producido(como('operador', cedros), 'Cupcakes Artesanal', 15)
      expect(a.json()).toMatchObject({ aVitrina: 12, cantidadStock: 17 })
      expect((await stockDe(cedros, 'Cupcakes Artesanal')).cantidad).toBe(17)
      // Lo mismo otra vez: no suma de nuevo.
      const b = await producido(como('operador', cedros), 'Cupcakes Artesanal', 15)
      expect(b.json().cantidadStock).toBe(17)
      // Se hicieron 5 más: suma solo la diferencia.
      const c = await producido(como('operador', cedros), 'Cupcakes Artesanal', 20)
      expect(c.json()).toMatchObject({ aVitrina: 17, cantidadStock: 22 })
      expect((await pool.query(`select count(*)::int n from produccion_dia where fecha = $1 and product_id = $2`, [LUNES, prod['Cupcakes Artesanal']])).rows[0].n).toBe(1)
    })

    it('si solo se produjo lo comprometido por pedido, no entra nada a la vitrina', async () => {
      await vitrina(cedros, 'Cupcakes Artesanal', 12)
      await pool.query(`insert into stock (sede_id, product_id, disponible, cantidad) values ($1, $2, true, 5)`, [cedros, prod['Cupcakes Artesanal']])
      await post('/api/dashboard/ordenes/rappi', como('operador', cedros), { referenciaExterna: 'RAP-8', fechaEntrega: LUNES, items: [{ productoId: prod['Cupcakes Artesanal'], cantidad: 3 }], total: 26.7 })
      const r = await producido(como('operador', cedros), 'Cupcakes Artesanal', 3)
      expect(r.json()).toMatchObject({ aVitrina: 0, cantidadStock: 5 })
    })

    it('el stock es por tamaño: marcar el individual no toca otros tamaños', async () => {
      await vitrina(cedros, 'Cheesecake de Fresa', 8, 'Individual')
      await producido(como('operador', cedros), 'Cheesecake de Fresa', 8, 'Individual')
      expect(await stockDe(cedros, 'Cheesecake de Fresa', 'Individual')).toEqual({ disponible: true, cantidad: null })
      expect((await pool.query(`select count(*)::int n from stock s join products p on p.id = s.product_id where p.nombre = 'Cheesecake de Fresa'`)).rows[0].n).toBe(1)
    })

    it('un producto que NO está en el plan del día no se puede marcar (409)', async () => {
      const r = await producido(como('operador', cedros), 'Cupcakes Artesanal', 5)
      expect(r.statusCode).toBe(409)
      expect(r.json().error).toBe('NO_ESTA_EN_EL_PLAN')
      expect(await stockDe(cedros, 'Cupcakes Artesanal')).toBeUndefined()
    })

    it('un producto solo por pedido (sin vitrina) se registra como producido pero NO toca el stock', async () => {
      await post('/api/dashboard/ordenes/rappi', como('operador', cedros), { referenciaExterna: 'RAP-7', fechaEntrega: LUNES, items: [{ productoId: prod['Carrot Cake'], tamano: 'Individual', cantidad: 2 }], total: 19.8 })
      const r = await producido(como('operador', cedros), 'Carrot Cake', 2, 'Individual')
      expect(r.json()).toMatchObject({ aVitrina: 0, stockActualizado: false })
      expect(await stockDe(cedros, 'Carrot Cake', 'Individual')).toBeUndefined()
      const plan = (await get(`/api/dashboard/produccion/plan?fecha=${LUNES}`, como('operador', cedros))).json()
      expect(plan.lineas.find((x: { nombre: string }) => x.nombre === 'Carrot Cake').producida).toBe(2)
    })

    it('un empleado marca SOLO en su sede (aunque mande otra); el admin debe decir la sede', async () => {
      await vitrina(cedros, 'Cupcakes Artesanal', 12)
      await vitrina(sm, 'Cupcakes Artesanal', 12)
      await producido(como('operador', cedros), 'Cupcakes Artesanal', 12, null, sm)
      expect(await stockDe(cedros, 'Cupcakes Artesanal')).toBeDefined()
      expect(await stockDe(sm, 'Cupcakes Artesanal')).toBeUndefined()
      expect((await producido(como('admin'), 'Cupcakes Artesanal', 12)).statusCode).toBe(400)
      expect((await producido(como('admin'), 'Cupcakes Artesanal', 12, null, sm)).statusCode).toBe(200)
      expect(await stockDe(sm, 'Cupcakes Artesanal')).toBeDefined()
      expect((await producido({}, 'Cupcakes Artesanal', 1)).statusCode).toBe(401)
    })

    it('rechaza cantidades inválidas', async () => {
      await vitrina(cedros, 'Cupcakes Artesanal', 12)
      expect((await producido(como('operador', cedros), 'Cupcakes Artesanal', -1)).statusCode).toBe(400)
      expect((await producido(como('operador', cedros), 'Cupcakes Artesanal', 1.5)).statusCode).toBe(400)
    })
  })
})

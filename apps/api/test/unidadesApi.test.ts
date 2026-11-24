// Unidades de negocio (migración 0058): precios internos, «Salida a calle», pagos y reporte por día; las órdenes de
// mayoristas valorizadas al precio interno; y Métricas sin contar a los mayoristas como venta al público.
// Solo se mockea la verificación del JWT; todo lo demás (stock, triggers, plan de producción, SQL del reporte) es real.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'
import { PERFILES } from '@bakebrothers/domain'

const hayBaseDeDatosReal = !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

vi.mock('../src/auth/verificarJwtOperador.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/auth/verificarJwtOperador.js')>()),
  verificarJwtOperador: async (
    req: { headers: Record<string, string | undefined>; operador?: unknown },
    reply: { code: (n: number) => { send: (b: unknown) => unknown } }
  ) => {
    const perfiles = req.headers['x-test-perfiles']
    if (!perfiles) return reply.code(401).send({ error: 'NO_AUTORIZADO' })
    const lista = perfiles.split(',')
    req.operador = {
      id: req.headers['x-test-actor'] ?? '00000000-0000-0000-0000-0000000000bb',
      rol: lista.includes('administracion') ? 'admin' : 'operador',
      sedeId: req.headers['x-test-sede'] ?? null,
      perfiles: lista,
      esEncargado: false,
    }
  },
}))

const { buildApp } = await import('../src/app.js')

let ip = 0
const otraIp = () => `10.${(ip >> 16) & 255}.${(ip >> 8) & 255}.${++ip & 255}`
const D1 = '2031-03-10'
const D2 = '2031-03-11'
const D3 = '2031-03-12'

describe.skipIf(!hayBaseDeDatosReal)('Unidades de negocio', () => {
  const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL })
  let app: Awaited<ReturnType<typeof buildApp>>
  let sede: string
  let calle: string
  let mayoristas: string
  let admId: string
  let ordId: string
  let tenantId: string
  const empanada = { id: '', sizeId: null as string | null }
  const torta = { id: '', individualId: '' }
  const sedes: string[] = []
  const usuarios: string[] = []
  const clientes: string[] = []

  const crearUsuario = async (nombre: string, perfiles: string[]) => {
    const id = randomUUID()
    await admin.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${randomUUID().slice(0, 8)}@prueba.test`])
    await admin.query(`insert into usuarios_dashboard (id, rol, perfiles, nombre) values ($1, $2, $3, $4)`, [id, perfiles.includes('administracion') ? 'admin' : 'operador', perfiles, nombre])
    usuarios.push(id)
    return id
  }

  const llamar = (metodo: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, quien: 'admin' | 'ordenes' | string[] | null, payload?: unknown) =>
    app.inject({
      method: metodo,
      url,
      remoteAddress: otraIp(),
      headers: quien
        ? { 'x-test-perfiles': quien === 'admin' ? 'administracion' : quien === 'ordenes' ? 'ordenes' : quien.join(','), 'x-test-actor': quien === 'ordenes' ? ordId : admId }
        : {},
      ...(payload === undefined ? {} : { payload: payload as object }),
    })
  const j = (r: { body: string }) => JSON.parse(r.body)

  const poner = async (sedeId: string, productId: string, sizeId: string | null, cantidad: number | null) => {
    await admin.query(`delete from stock where sede_id = $1 and product_id = $2 and product_size_id is not distinct from $3`, [sedeId, productId, sizeId])
    await admin.query(`insert into stock (sede_id, product_id, product_size_id, disponible, cantidad) values ($1,$2,$3,true,$4)`, [sedeId, productId, sizeId, cantidad])
  }
  const stockDe = async (sedeId: string, productId: string, sizeId: string | null) =>
    (await admin.query(`select cantidad from stock where sede_id = $1 and product_id = $2 and product_size_id is not distinct from $3`, [sedeId, productId, sizeId])).rows[0]?.cantidad

  const precio = (unidadId: string, productId: string, sizeId: string | null, valor: number | null) =>
    llamar('PUT', '/api/dashboard/unidades/precios', 'admin', { unidadId, cambios: [{ productId, productSizeId: sizeId, precio: valor }] })

  const salida = async (fecha: string, items: Array<{ productId: string; productSizeId?: string | null; cantidad: number }>, extra: Record<string, unknown> = {}) => {
    const r = await llamar('POST', '/api/dashboard/unidades/salidas', 'ordenes', { unidadId: calle, sedeId: sede, fecha, items, ...extra })
    expect(r.statusCode, r.body).toBe(201)
    return j(r).id as string
  }
  const leerSalida = async (id: string) => {
    const r = await llamar('GET', `/api/dashboard/unidades/salidas?limite=300`, 'ordenes')
    return j(r).salidas.find((s: { id: string }) => s.id === id)
  }

  /** Orden de mayorista de prueba con una línea de empanada. */
  const ordenMayorista = async (fecha: string, cantidad: number, estado = 'confirmed', tamano: string | null = null) => {
    const cliente = (await admin.query(`insert into customers (tenant_id, nombre, es_mayorista) values ($1, $2, true) returning id`, [tenantId, `Mayorista prueba ${randomUUID().slice(0, 6)}`])).rows[0].id
    clientes.push(cliente)
    const o = (
      await admin.query(
        `insert into orders (tenant_id, numero, customer_id, canal, estado, tipo_entrega, sede_id, fecha_entrega, horario_entrega, metodo_pago, subtotal, total, total_pendiente)
         values ($1, $2, $3, 'mayorista', $4, 'delivery', $5, $6, '7:00 am', 'contraentrega', 0, 0, true) returning id`,
        [tenantId, `UNI-${randomUUID().slice(0, 8)}`, cliente, estado, sede, fecha]
      )
    ).rows[0].id
    await admin.query(`insert into order_items (tenant_id, order_id, product_id, nombre_producto, tamano, cantidad, precio_unitario) values ($1,$2,$3,'Empanada',$4,$5,0)`, [tenantId, o, empanada.id, tamano, cantidad])
    return o as string
  }

  beforeAll(async () => {
    app = await buildApp()
    tenantId = (await admin.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
    sede = (await admin.query(`insert into sedes (nombre) values ($1) returning id`, [`Unidades ${randomUUID().slice(0, 6)}`])).rows[0].id
    sedes.push(sede)
    calle = (await admin.query(`select id from unidades_negocio where codigo = 'calle'`)).rows[0].id
    mayoristas = (await admin.query(`select id from unidades_negocio where codigo = 'mayoristas'`)).rows[0].id
    admId = await crearUsuario('Admin unidades', ['administracion'])
    ordId = await crearUsuario('Órdenes unidades', ['ordenes'])
    const e = (await admin.query(`select p.id from products p join categories c on c.id = p.category_id where c.nombre = 'Empanadas' and p.disponible order by p.nombre limit 1`)).rows[0]
    empanada.id = e.id
    const t = (await admin.query(`select p.id, ps.id as individual from products p join product_sizes ps on ps.product_id = p.id where p.slug = 'torta-carrot-cake' and ps.tamano = 'Individual'`)).rows[0]
    torta.id = t.id
    torta.individualId = t.individual
  })

  beforeEach(async () => {
    await admin.query(`delete from pagos_unidad`)
    await admin.query(`delete from salidas_unidad where sede_id = any($1::uuid[])`, [sedes])
    await admin.query(`delete from precios_internos`)
    await poner(sede, empanada.id, null, 50)
    await poner(sede, torta.id, torta.individualId, 4)
  })

  afterAll(async () => {
    await admin.query(`delete from pagos_unidad`)
    await admin.query(`delete from salidas_unidad where sede_id = any($1::uuid[])`, [sedes])
    await admin.query(`delete from order_items where order_id in (select id from orders where customer_id = any($1::uuid[]))`, [clientes])
    await admin.query(`delete from orders where customer_id = any($1::uuid[])`, [clientes])
    await admin.query(`delete from customers where id = any($1::uuid[])`, [clientes])
    await admin.query(`delete from precios_internos`)
    await admin.query(`delete from stock where sede_id = any($1::uuid[])`, [sedes])
    await admin.query(`delete from sedes where id = any($1::uuid[])`, [sedes])
    await admin.query(`alter table equipo_auditoria disable trigger equipo_auditoria_inmutable`)
    try {
      await admin.query(`delete from equipo_auditoria where objetivo_id = any($1::uuid[])`, [usuarios])
      await admin.query(`delete from precios_internos_historial where cambiado_por = any($1::uuid[])`, [usuarios])
      await admin.query(`delete from auth.users where id = any($1::uuid[])`, [usuarios])
    } finally {
      await admin.query(`alter table equipo_auditoria enable trigger equipo_auditoria_inmutable`)
      await admin.end()
    }
  })

  // ——— quién puede ———
  describe('autorización', () => {
    it('sin sesión 401; ventas, caja y producción 403 en todo; Órdenes solo en salidas', async () => {
      const salidas = [
        { m: 'GET' as const, u: '/api/dashboard/unidades' },
        { m: 'GET' as const, u: '/api/dashboard/unidades/salidas' },
        { m: 'POST' as const, u: '/api/dashboard/unidades/salidas' },
      ]
      const soloAdmin = [
        { m: 'GET' as const, u: `/api/dashboard/unidades/precios?unidadId=${calle}` },
        { m: 'PUT' as const, u: '/api/dashboard/unidades/precios' },
        { m: 'GET' as const, u: `/api/dashboard/unidades/reporte?desde=${D1}&hasta=${D2}` },
        { m: 'POST' as const, u: '/api/dashboard/unidades/pagos' },
        { m: 'POST' as const, u: `/api/dashboard/unidades/pagos/${randomUUID()}/anular` },
      ]
      for (const r of [...salidas, ...soloAdmin]) expect((await llamar(r.m, r.u, null, r.m === 'GET' ? undefined : {})).statusCode, r.u).toBe(401)
      for (const perfil of PERFILES.filter((p) => !['administracion', 'ordenes'].includes(p))) {
        for (const r of [...salidas, ...soloAdmin]) expect((await llamar(r.m, r.u, [perfil], r.m === 'GET' ? undefined : {})).statusCode, `${perfil} ${r.u}`).toBe(403)
      }
      for (const r of salidas.filter((x) => x.m === 'GET')) expect((await llamar(r.m, r.u, 'ordenes')).statusCode, r.u).toBe(200)
      for (const r of soloAdmin) {
        const x = await llamar(r.m, r.u, 'ordenes', r.m === 'GET' ? undefined : {})
        expect(x.statusCode, `ordenes ${r.u}`).toBe(403)
        expect(j(x).error).toBe('SOLO_ADMIN')
      }
    })
  })

  // ——— datos iniciales ———
  it('Calle regresa a la tienda; Mayoristas no; y la lista de precios internos nace VACÍA', async () => {
    const { unidades } = j(await llamar('GET', '/api/dashboard/unidades', 'ordenes'))
    expect(unidades.find((u: { codigo: string }) => u.codigo === 'calle')).toMatchObject({ regresaAStock: true, activa: true })
    expect(unidades.find((u: { codigo: string }) => u.codigo === 'mayoristas')).toMatchObject({ regresaAStock: false })
    const lista = j(await llamar('GET', `/api/dashboard/unidades/precios?unidadId=${calle}`, 'admin'))
    expect(lista.filas.length).toBeGreaterThan(50)
    expect(lista.filas.every((f: { precio: number | null }) => f.precio === null)).toBe(true)
    // incluye el tamaño oculto «Mediana» de las empanadas (lo necesitan los mayoristas)
    expect(lista.filas.some((f: { tamano: string | null }) => f.tamano === 'Mediana')).toBe(true)
  })

  // ——— precios ———
  describe('precios internos (Administración)', () => {
    it('se cargan, se cambian, se quitan, y cada cambio queda en el historial con quién lo hizo', async () => {
      const desdeId = Number((await admin.query(`select coalesce(max(id), 0) as m from precios_internos_historial`)).rows[0].m)
      expect((await precio(calle, empanada.id, null, 3)).statusCode).toBe(200)
      expect((await precio(calle, torta.id, torta.individualId, 8)).statusCode).toBe(200)
      expect((await precio(calle, empanada.id, null, 3.5)).statusCode).toBe(200)
      const lista = j(await llamar('GET', `/api/dashboard/unidades/precios?unidadId=${calle}`, 'admin'))
      expect(lista.filas.find((f: { productId: string; productSizeId: string | null }) => f.productId === empanada.id && f.productSizeId === null).precio).toBe(3.5)
      expect(lista.filas.find((f: { productSizeId: string | null }) => f.productSizeId === torta.individualId).precio).toBe(8)
      // los precios de Calle no se mezclan con los de Mayoristas
      const may = j(await llamar('GET', `/api/dashboard/unidades/precios?unidadId=${mayoristas}`, 'admin'))
      expect(may.filas.every((f: { precio: number | null }) => f.precio === null)).toBe(true)

      expect((await precio(calle, empanada.id, null, null)).statusCode).toBe(200)
      const { rows } = await admin.query(`select precio_antes, precio_despues, cambiado_por from precios_internos_historial where unidad_id = $1 and product_id = $2 and product_size_id is null and id > $3 order by id`, [calle, empanada.id, desdeId])
      expect(rows.map((r) => [r.precio_antes === null ? null : Number(r.precio_antes), r.precio_despues === null ? null : Number(r.precio_despues)])).toEqual([[null, 3], [3, 3.5], [3.5, null]])
      expect(rows.every((r) => r.cambiado_por === admId)).toBe(true)
    })

    it('rechaza precios inválidos y tamaños de otro producto', async () => {
      expect((await precio(calle, empanada.id, null, -1)).statusCode).toBe(400)
      expect((await precio(calle, empanada.id, torta.individualId, 3)).statusCode).toBe(400)
      expect((await precio(randomUUID(), empanada.id, null, 3)).statusCode).toBe(404)
      expect((await admin.query(`select count(*) from precios_internos`)).rows[0].count).toBe('0')
    })
  })

  // ——— salida a calle ———
  describe('salida a calle', () => {
    it('planificada: entra a la hoja de producción y NO toca el stock', async () => {
      const id = await salida(D1, [{ productId: empanada.id, cantidad: 30 }, { productId: torta.id, productSizeId: torta.individualId, cantidad: 2 }])
      expect(await stockDe(sede, empanada.id, null)).toBe(50)
      expect(await stockDe(sede, torta.id, torta.individualId)).toBe(4)
      const s = await leerSalida(id)
      expect(s).toMatchObject({ estado: 'planificada', fecha: D1, unidad: 'Venta en la calle', valor: 0 })
      expect(s.items.every((i: { cantidadSalio: number | null }) => i.cantidadSalio === null)).toBe(true)

      const plan = await llamar('GET', `/api/dashboard/produccion/plan?fecha=${D1}&sedeId=${sede}`, 'admin')
      expect(plan.statusCode).toBe(200)
      const lineas = j(plan).lineas as Array<{ productId: string; tamano: string | null; porPedido: number }>
      expect(lineas.find((l) => l.productId === empanada.id && l.tamano === null)?.porPedido).toBe(30)
      expect(lineas.find((l) => l.productId === torta.id)?.porPedido).toBe(2)
    })

    it('confirmar «salió»: descuenta el stock donde hay conteo, congela el precio de ese momento y no depende de lo planificado', async () => {
      await precio(calle, empanada.id, null, 3)
      await poner(sede, torta.id, torta.individualId, null) // sin conteo: no se descuenta
      const id = await salida(D1, [{ productId: empanada.id, cantidad: 30 }, { productId: torta.id, productSizeId: torta.individualId, cantidad: 2 }])
      const antes = await leerSalida(id)
      const [linEmp, linTorta] = [antes.items.find((i: { productId: string }) => i.productId === empanada.id), antes.items.find((i: { productId: string }) => i.productId === torta.id)]
      // salieron 28 de 30 empanadas, y la torta no salió (no se menciona = 0)
      const r = await llamar('POST', `/api/dashboard/unidades/salidas/${id}/salio`, 'ordenes', { items: [{ itemId: linEmp.id, cantidadSalio: 28 }] })
      expect(r.statusCode, r.body).toBe(200)
      expect(await stockDe(sede, empanada.id, null)).toBe(22)
      const s = await leerSalida(id)
      expect(s).toMatchObject({ estado: 'salio', valor: 84 })
      expect(s.items.find((i: { id: string }) => i.id === linEmp.id)).toMatchObject({ cantidadSalio: 28, precioInterno: 3 })
      expect(s.items.find((i: { id: string }) => i.id === linTorta.id)).toMatchObject({ cantidadSalio: 0 })
      expect(await stockDe(sede, torta.id, torta.individualId)).toBeNull() // sin conteo: intacto
      // un cambio de precio posterior no reescribe lo ya salido
      await precio(calle, empanada.id, null, 5)
      expect((await leerSalida(id)).valor).toBe(84)
    })

    it('un producto que salió sin estar planificado se agrega al confirmar', async () => {
      const id = await salida(D1, [{ productId: empanada.id, cantidad: 10 }])
      const s = await leerSalida(id)
      const r = await llamar('POST', `/api/dashboard/unidades/salidas/${id}/salio`, 'ordenes', {
        items: [{ itemId: s.items[0].id, cantidadSalio: 10 }],
        nuevos: [{ productId: torta.id, productSizeId: torta.individualId, cantidad: 3 }],
      })
      expect(r.statusCode, r.body).toBe(200)
      expect(await stockDe(sede, torta.id, torta.individualId)).toBe(1)
      expect((await leerSalida(id)).items).toHaveLength(2)
    })

    it('si el stock no alcanza no bloquea: lo deja en 0 y avisa', async () => {
      await poner(sede, empanada.id, null, 5)
      const id = await salida(D1, [{ productId: empanada.id, cantidad: 8 }])
      const s = await leerSalida(id)
      const r = await llamar('POST', `/api/dashboard/unidades/salidas/${id}/salio`, 'ordenes', { items: [{ itemId: s.items[0].id, cantidadSalio: 8 }] })
      expect(r.statusCode).toBe(200)
      expect(j(r).avisos[0]).toMatch(/quedó en 0/)
      expect(await stockDe(sede, empanada.id, null)).toBe(0)
      expect((await leerSalida(id)).estado).toBe('salio')
    })

    it('registrar directo lo que salió (sin planificar): sale confirmada y con precio', async () => {
      await precio(calle, empanada.id, null, 3)
      const id = await salida(D2, [{ productId: empanada.id, cantidad: 12 }], { confirmar: true })
      expect(await leerSalida(id)).toMatchObject({ estado: 'salio', valor: 36 })
      expect(await stockDe(sede, empanada.id, null)).toBe(38)
    })

    it('lo que vuelve regresa al stock (Calle sí regresa), se puede corregir y no puede ser más de lo que salió', async () => {
      await precio(calle, empanada.id, null, 3)
      const id = await salida(D1, [{ productId: empanada.id, cantidad: 20 }], { confirmar: true })
      const linea = (await leerSalida(id)).items[0]
      expect(await stockDe(sede, empanada.id, null)).toBe(30)

      const url = `/api/dashboard/unidades/salidas/${id}/devolucion`
      expect((await llamar('POST', url, 'ordenes', { items: [{ itemId: linea.id, cantidadDevuelta: 5 }] })).statusCode).toBe(200)
      expect(await stockDe(sede, empanada.id, null)).toBe(35)
      expect((await leerSalida(id)).valor).toBe(45) // (20 − 5) × 3
      // corregir: en realidad volvieron 7 → el stock sube solo la diferencia
      expect((await llamar('POST', url, 'ordenes', { items: [{ itemId: linea.id, cantidadDevuelta: 7 }] })).statusCode).toBe(200)
      expect(await stockDe(sede, empanada.id, null)).toBe(37)
      const mas = await llamar('POST', url, 'ordenes', { items: [{ itemId: linea.id, cantidadDevuelta: 21 }] })
      expect(mas.statusCode).toBe(409)
      expect(j(mas).error).toBe('DEVUELVE_MAS_DE_LO_QUE_SALIO')
      expect(await stockDe(sede, empanada.id, null)).toBe(37)
    })

    it('no se anota devolución de una salida que no salió', async () => {
      const id = await salida(D1, [{ productId: empanada.id, cantidad: 5 }])
      const linea = (await leerSalida(id)).items[0]
      const r = await llamar('POST', `/api/dashboard/unidades/salidas/${id}/devolucion`, 'ordenes', { items: [{ itemId: linea.id, cantidadDevuelta: 1 }] })
      expect(r.statusCode).toBe(409)
      expect(j(r).error).toBe('NO_HA_SALIDO')
    })

    it('editar y anular una planificada; una que ya salió no se edita ni se anula', async () => {
      const id = await salida(D1, [{ productId: empanada.id, cantidad: 5 }])
      expect((await llamar('PATCH', `/api/dashboard/unidades/salidas/${id}`, 'ordenes', { fecha: D2, items: [{ productId: empanada.id, cantidad: 9 }] })).statusCode).toBe(200)
      expect(await leerSalida(id)).toMatchObject({ fecha: D2, items: [expect.objectContaining({ cantidad: 9 })] })
      expect((await llamar('POST', `/api/dashboard/unidades/salidas/${id}/anular`, 'ordenes', {})).statusCode).toBe(200)
      expect((await leerSalida(id)).estado).toBe('anulada')
      // una anulada ya no entra a la producción
      const plan = j(await llamar('GET', `/api/dashboard/produccion/plan?fecha=${D2}&sedeId=${sede}`, 'admin')).lineas as Array<{ productId: string; porPedido: number }>
      expect(plan.find((l) => l.productId === empanada.id)?.porPedido ?? 0).toBe(0)

      const salio = await salida(D1, [{ productId: empanada.id, cantidad: 5 }], { confirmar: true })
      expect((await llamar('PATCH', `/api/dashboard/unidades/salidas/${salio}`, 'ordenes', { nota: 'x' })).statusCode).toBe(409)
      const anular = await llamar('POST', `/api/dashboard/unidades/salidas/${salio}/anular`, 'ordenes', {})
      expect(anular.statusCode).toBe(409)
      expect(j(anular).error).toBe('YA_SALIO')
    })

    it('valida lo que llega: sin productos, cantidades, repetidos, tamaño de otro producto, local y unidad inválidos', async () => {
      const base = { unidadId: calle, sedeId: sede, fecha: D1 }
      const casos: Array<[string, Record<string, unknown>, number]> = [
        ['sin productos', { items: [] }, 400],
        ['cantidad 0', { items: [{ productId: empanada.id, cantidad: 0 }] }, 400],
        ['repetido', { items: [{ productId: empanada.id, cantidad: 1 }, { productId: empanada.id, cantidad: 2 }] }, 400],
        ['tamaño de otro producto', { items: [{ productId: empanada.id, productSizeId: torta.individualId, cantidad: 1 }] }, 400],
        ['producto inexistente', { items: [{ productId: randomUUID(), cantidad: 1 }] }, 404],
        ['local inexistente', { sedeId: randomUUID(), items: [{ productId: empanada.id, cantidad: 1 }] }, 400],
        ['mayoristas no usa salidas', { unidadId: mayoristas, items: [{ productId: empanada.id, cantidad: 1 }] }, 400],
        ['fecha mal escrita', { fecha: '10/03/2031', items: [{ productId: empanada.id, cantidad: 1 }] }, 400],
      ]
      for (const [nombre, cambio, estado] of casos) {
        const r = await llamar('POST', '/api/dashboard/unidades/salidas', 'ordenes', { ...base, ...cambio })
        expect(r.statusCode, nombre).toBe(estado)
      }
      expect((await admin.query(`select count(*) from salidas_unidad where sede_id = $1`, [sede])).rows[0].count).toBe('0')
    })
  })

  // ——— reporte ———
  describe('reporte por día: valor a precio interno, pagos y saldo', () => {
    it('suma cantidades y valor por día, descuenta los pagos y arrastra el saldo; lo anulado no cuenta', async () => {
      await precio(calle, empanada.id, null, 3)
      await precio(calle, torta.id, torta.individualId, 8)
      await salida(D1, [{ productId: empanada.id, cantidad: 10 }, { productId: torta.id, productSizeId: torta.individualId, cantidad: 2 }], { confirmar: true }) // 30 + 16 = 46
      await salida(D1, [{ productId: empanada.id, cantidad: 5 }], { confirmar: true }) // 15  → D1 = 61
      await salida(D2, [{ productId: empanada.id, cantidad: 20 }], { confirmar: true }) // 60
      const devuelta = await salida(D2, [{ productId: empanada.id, cantidad: 10 }], { confirmar: true })
      await llamar('POST', `/api/dashboard/unidades/salidas/${devuelta}/devolucion`, 'ordenes', { items: [{ itemId: (await leerSalida(devuelta)).items[0].id, cantidadDevuelta: 4 }] }) // (10−4)×3 = 18 → D2 = 78
      const planificada = await salida(D2, [{ productId: empanada.id, cantidad: 99 }]) // no salió: no cuenta
      await llamar('POST', `/api/dashboard/unidades/salidas/${planificada}/anular`, 'ordenes', {})

      const pago = await llamar('POST', '/api/dashboard/unidades/pagos', 'admin', { unidadId: calle, fecha: D1, monto: 50, nota: 'Efectivo' })
      expect(pago.statusCode).toBe(201)
      const equivocado = j(await llamar('POST', '/api/dashboard/unidades/pagos', 'admin', { unidadId: calle, fecha: D2, monto: 1000 })).id
      expect((await llamar('POST', `/api/dashboard/unidades/pagos/${equivocado}/anular`, 'admin', {})).statusCode).toBe(200)
      await llamar('POST', '/api/dashboard/unidades/pagos', 'admin', { unidadId: calle, fecha: D2, monto: 40 })

      const r = await llamar('GET', `/api/dashboard/unidades/reporte?desde=${D1}&hasta=${D3}&unidadId=${calle}`, 'admin')
      expect(r.statusCode, r.body).toBe(200)
      const u = j(r).unidades[0]
      expect(u).toMatchObject({ codigo: 'calle', saldoAnterior: 0 })
      expect(u.dias).toEqual([
        { fecha: D1, cantidad: 17, valor: 61, lineasSinPrecio: 0, pagos: 50, saldoDia: 11, saldoAcumulado: 11 },
        { fecha: D2, cantidad: 26, valor: 78, lineasSinPrecio: 0, pagos: 40, saldoDia: 38, saldoAcumulado: 49 },
      ])
      expect(u.totales).toMatchObject({ cantidad: 43, valor: 139, pagos: 90, saldo: 49 })
      expect(u.saldoFinal).toBe(49)
      expect(u.pagos.filter((p: { anulado: boolean }) => p.anulado)).toHaveLength(1)
    })

    it('un rango que empieza después arrastra el saldo anterior', async () => {
      await precio(calle, empanada.id, null, 3)
      await salida(D1, [{ productId: empanada.id, cantidad: 10 }], { confirmar: true }) // 30
      await llamar('POST', '/api/dashboard/unidades/pagos', 'admin', { unidadId: calle, fecha: D1, monto: 10 })
      await salida(D3, [{ productId: empanada.id, cantidad: 2 }], { confirmar: true }) // 6
      const u = j(await llamar('GET', `/api/dashboard/unidades/reporte?desde=${D2}&hasta=${D3}&unidadId=${calle}`, 'admin')).unidades[0]
      expect(u.saldoAnterior).toBe(20)
      expect(u.dias).toEqual([{ fecha: D3, cantidad: 2, valor: 6, lineasSinPrecio: 0, pagos: 0, saldoDia: 6, saldoAcumulado: 26 }])
      expect(u.saldoFinal).toBe(26)
    })

    it('un producto SIN precio interno no se valora como 0 en silencio: se cuenta aparte', async () => {
      await precio(calle, empanada.id, null, 3)
      await salida(D1, [{ productId: empanada.id, cantidad: 10 }, { productId: torta.id, productSizeId: torta.individualId, cantidad: 2 }], { confirmar: true })
      const u = j(await llamar('GET', `/api/dashboard/unidades/reporte?desde=${D1}&hasta=${D1}&unidadId=${calle}`, 'admin')).unidades[0]
      expect(u.dias[0]).toMatchObject({ cantidad: 12, valor: 30, lineasSinPrecio: 1 })
      // al cargar el precio después, lo que salió sin precio se valora con el vigente
      await precio(calle, torta.id, torta.individualId, 8)
      const despues = j(await llamar('GET', `/api/dashboard/unidades/reporte?desde=${D1}&hasta=${D1}&unidadId=${calle}`, 'admin')).unidades[0]
      expect(despues.dias[0]).toMatchObject({ valor: 46, lineasSinPrecio: 0 })
    })

    it('las órdenes de mayoristas se valorizan al precio de la unidad Mayoristas (congelado al crear la línea) y no descuentan stock', async () => {
      await precio(mayoristas, empanada.id, null, 1)
      await ordenMayorista(D1, 300)
      await ordenMayorista(D1, 100, 'cancelled')
      await precio(mayoristas, empanada.id, null, 2) // un cambio posterior no reescribe lo ya creado
      const u = j(await llamar('GET', `/api/dashboard/unidades/reporte?desde=${D1}&hasta=${D1}&unidadId=${mayoristas}`, 'admin')).unidades[0]
      expect(u.dias[0]).toMatchObject({ cantidad: 300, valor: 300, lineasSinPrecio: 0 })
      expect(await stockDe(sede, empanada.id, null)).toBe(50)
      // y ninguna orden de mayoristas aparece en la unidad Calle
      const calleU = j(await llamar('GET', `/api/dashboard/unidades/reporte?desde=${D1}&hasta=${D1}&unidadId=${calle}`, 'admin')).unidades[0]
      expect(calleU.dias).toEqual([])
    })

    it('las órdenes de mayoristas sin precio cargado se cuentan como «sin precio» y se valoran cuando se carga', async () => {
      await ordenMayorista(D2, 50)
      const sin = j(await llamar('GET', `/api/dashboard/unidades/reporte?desde=${D2}&hasta=${D2}&unidadId=${mayoristas}`, 'admin')).unidades[0]
      expect(sin.dias[0]).toMatchObject({ cantidad: 50, valor: 0, lineasSinPrecio: 1 })
      await precio(mayoristas, empanada.id, null, 1)
      const con = j(await llamar('GET', `/api/dashboard/unidades/reporte?desde=${D2}&hasta=${D2}&unidadId=${mayoristas}`, 'admin')).unidades[0]
      expect(con.dias[0]).toMatchObject({ valor: 50, lineasSinPrecio: 0 })
    })

    it('rango inválido y unidad inexistente', async () => {
      expect((await llamar('GET', `/api/dashboard/unidades/reporte?desde=${D3}&hasta=${D1}`, 'admin')).statusCode).toBe(400)
      expect((await llamar('GET', `/api/dashboard/unidades/reporte?desde=${D1}&hasta=${D3}&unidadId=${randomUUID()}`, 'admin')).statusCode).toBe(404)
      expect((await llamar('POST', '/api/dashboard/unidades/pagos', 'admin', { unidadId: calle, fecha: D1, monto: 0 })).statusCode).toBe(400)
    })
  })

  // ——— Métricas ———
  it('Métricas no cuenta las órdenes de mayoristas como venta al público', async () => {
    const hoy = new Date().toISOString().slice(0, 10)
    await ordenMayorista(hoy, 100)
    const cliente = (await admin.query(`insert into customers (tenant_id, nombre, telefono) values ($1, 'Cliente público', '+51944000999') on conflict do nothing returning id`, [tenantId])).rows[0]
    if (cliente) clientes.push(cliente.id)
    const c = cliente?.id ?? (await admin.query(`select id from customers where telefono = '+51944000999'`)).rows[0].id
    await admin.query(
      `insert into orders (tenant_id, numero, customer_id, canal, estado, tipo_entrega, sede_id, fecha_entrega, horario_entrega, metodo_pago, subtotal, total)
       values ($1, $2, $3, 'whatsapp', 'confirmed', 'tienda', $4, $5, '4pm', 'yape', 50, 50)`,
      [tenantId, `UNI-${randomUUID().slice(0, 8)}`, c, sede, hoy]
    )
    const db = await admin.connect()
    try {
      await db.query('begin')
      await db.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [JSON.stringify({ sub: admId, role: 'authenticated' }), admId])
      const kpis = (await db.query(`select * from metricas_kpis(current_date - 1, current_date + 1, $1)`, [sede])).rows[0]
      expect(Number(kpis.pedidos)).toBe(1)
      expect(Number(kpis.ingresos)).toBe(50)
      const tendencia = (await db.query(`select sum(pedidos) as n from metricas_tendencia_diaria(current_date - 1, current_date + 1, $1)`, [sede])).rows[0]
      expect(Number(tendencia.n)).toBe(1)
      const vendidos = (await db.query(`select * from metricas_productos_vendidos(current_date - 1, current_date + 1, $1)`, [sede])).rows
      expect(vendidos.some((v) => Number(v.cantidad) === 100)).toBe(false)
      await db.query('rollback')
    } finally {
      db.release()
    }
  })
})

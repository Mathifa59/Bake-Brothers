// Porcionado (migración 0057): resta enteras y suma porciones en Stock, en una sola transacción, según la regla del
// producto. Se mockea SOLO la verificación del JWT (fija `req.operador` con lo que digan las cabeceras: perfiles, local y
// si es Encargado); todo lo demás —reglas reales de la migración, stock, transacciones y bloqueos— es la base real.
//
// Con DATABASE_URL de un rol miembro de app_api se comprueban además los permisos reales de la API;
// DATABASE_URL_ADMIN es una conexión de superusuario solo para preparar y limpiar (si falta, se usa la misma).
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
      esEncargado: req.headers['x-test-encargado'] === '1',
    }
  },
}))

const { buildApp } = await import('../src/app.js')

let ip = 0
const otraIp = () => `10.${(ip >> 16) & 255}.${(ip >> 8) & 255}.${++ip & 255}`

describe.skipIf(!hayBaseDeDatosReal)('Porcionado de Stock', () => {
  const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL })
  let app: Awaited<ReturnType<typeof buildApp>>
  let sedeA: string
  let sedeB: string
  let usuarioId: string
  let admId: string
  let regla: { id: string; productId: string; enteroId: string; porcionId: string; porciones: number }
  let reglaCrema: { id: string; porciones: number }

  const sedesCreadas: string[] = []
  const usuariosCreados: string[] = []

  const crearSede = async (nombre: string) => {
    const id = (await admin.query(`insert into sedes (nombre) values ($1) returning id`, [`${nombre} ${randomUUID().slice(0, 6)}`])).rows[0].id as string
    sedesCreadas.push(id)
    return id
  }
  const crearUsuario = async (nombre: string, perfiles: string[]) => {
    const id = randomUUID()
    await admin.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${randomUUID().slice(0, 8)}@prueba.test`])
    await admin.query(`insert into usuarios_dashboard (id, rol, perfiles, nombre) values ($1, $2, $3, $4)`, [id, perfiles.includes('administracion') ? 'admin' : 'operador', perfiles, nombre])
    usuariosCreados.push(id)
    return id
  }

  /** Deja el stock de la regla en un estado conocido (null = sin fila; { cantidad: null } = fila sin conteo). */
  const poner = async (sede: string, enteros: number | null | 'sinfila', porciones: number | null | 'sinfila') => {
    await admin.query(`delete from stock where sede_id = $1 and product_id = $2`, [sede, regla.productId])
    if (enteros !== 'sinfila')
      await admin.query(`insert into stock (sede_id, product_id, product_size_id, disponible, cantidad) values ($1,$2,$3,true,$4)`, [sede, regla.productId, regla.enteroId, enteros])
    if (porciones !== 'sinfila')
      await admin.query(`insert into stock (sede_id, product_id, product_size_id, disponible, cantidad) values ($1,$2,$3,true,$4)`, [sede, regla.productId, regla.porcionId, porciones])
  }
  const leer = async (sede: string) => {
    const { rows } = await admin.query(`select product_size_id, cantidad, disponible from stock where sede_id = $1 and product_id = $2`, [sede, regla.productId])
    const por = (id: string) => rows.find((r) => r.product_size_id === id)
    return { entero: por(regla.enteroId)?.cantidad ?? undefined, porcion: por(regla.porcionId)?.cantidad ?? undefined, porcionDisponible: por(regla.porcionId)?.disponible }
  }

  const llamar = (
    metodo: 'GET' | 'POST',
    url: string,
    { perfiles, sede, encargado, actor, payload }: { perfiles?: string[]; sede?: string; encargado?: boolean; actor?: string; payload?: unknown } = {}
  ) =>
    app.inject({
      method: metodo,
      url,
      remoteAddress: otraIp(),
      headers: {
        ...(perfiles ? { 'x-test-perfiles': perfiles.join(',') } : {}),
        ...(sede ? { 'x-test-sede': sede } : {}),
        ...(encargado ? { 'x-test-encargado': '1' } : {}),
        ...(actor ? { 'x-test-actor': actor } : {}),
      },
      ...(payload === undefined ? {} : { payload: payload as object }),
    })
  const cuerpo = (r: { body: string }) => JSON.parse(r.body)

  const porcionarComo = (quien: 'admin' | 'encargada' | 'caja', sede: string, enteras: number, reglaId = regla.id, extra: Record<string, unknown> = {}) =>
    llamar('POST', '/api/dashboard/stock/porcionar', {
      perfiles: quien === 'admin' ? ['administracion'] : ['caja'],
      sede: quien === 'admin' ? undefined : sede,
      encargado: quien === 'encargada',
      actor: quien === 'admin' ? admId : usuarioId,
      payload: { reglaId, enteras, ...(quien === 'admin' ? { sedeId: sede } : {}), ...extra },
    })

  beforeAll(async () => {
    app = await buildApp()
    sedeA = await crearSede('Porcionado A')
    sedeB = await crearSede('Porcionado B')
    usuarioId = await crearUsuario('Encargada de prueba', ['caja'])
    admId = await crearUsuario('Admin de prueba', ['administracion'])
    const r = (
      await admin.query(
        `select r.id, r.product_id, r.size_entero_id, r.size_porcion_id, r.porciones
           from porcionado_reglas r join products p on p.id = r.product_id where p.slug = 'torta-carrot-cake'`
      )
    ).rows[0]
    regla = { id: r.id, productId: r.product_id, enteroId: r.size_entero_id, porcionId: r.size_porcion_id, porciones: r.porciones }
    const c = (await admin.query(`select r.id, r.porciones from porcionado_reglas r join products p on p.id = r.product_id where p.slug = 'crema-volteada'`)).rows[0]
    reglaCrema = { id: c.id, porciones: c.porciones }
  })

  beforeEach(async () => {
    // El historial es inmutable a propósito; en la base de pruebas se apaga el bloqueo solo para dejarla limpia entre casos.
    await admin.query(`alter table porcionados disable trigger porcionados_inmutable`)
    try {
      await admin.query(`delete from porcionados where sede_id = any($1::uuid[])`, [sedesCreadas])
    } finally {
      await admin.query(`alter table porcionados enable trigger porcionados_inmutable`)
    }
    await poner(sedeA, 5, 6)
    await poner(sedeB, 5, 6)
  })

  afterAll(async () => {
    await admin.query(`alter table porcionados disable trigger porcionados_inmutable`)
    try {
      await admin.query(`delete from porcionados where sede_id = any($1::uuid[])`, [sedesCreadas])
      await admin.query(`delete from stock where sede_id = any($1::uuid[])`, [sedesCreadas])
      await admin.query(`delete from sedes where id = any($1::uuid[])`, [sedesCreadas])
      await admin.query(`alter table equipo_auditoria disable trigger equipo_auditoria_inmutable`)
      await admin.query(`delete from equipo_auditoria where objetivo_id = any($1::uuid[])`, [usuariosCreados])
      await admin.query(`alter table equipo_auditoria enable trigger equipo_auditoria_inmutable`)
      await admin.query(`delete from auth.users where id = any($1::uuid[])`, [usuariosCreados])
    } finally {
      await admin.query(`alter table porcionados enable trigger porcionados_inmutable`)
      await admin.end()
    }
  })

  // ——— los datos que dio el dueño ———
  describe('reglas iniciales (migración)', () => {
    it('Familiar → Individual: 12 porciones para chocolate, carrot, red velvet y los dos pies; 10 para la crema volteada', async () => {
      const { rows } = await admin.query(
        `select p.slug, se.tamano as entero, sp.tamano as porcion, r.porciones, r.activo
           from porcionado_reglas r
           join products p on p.id = r.product_id
           join product_sizes se on se.id = r.size_entero_id
           join product_sizes sp on sp.id = r.size_porcion_id
          where p.slug = any($1::text[]) order by p.slug`,
        [['torta-chocolate-manjar', 'torta-carrot-cake', 'torta-red-velvet', 'pie-manzana', 'pie-limon', 'crema-volteada']]
      )
      expect(rows.map((r) => [r.slug, r.porciones])).toEqual([
        ['crema-volteada', 10],
        ['pie-limon', 12],
        ['pie-manzana', 12],
        ['torta-carrot-cake', 12],
        ['torta-chocolate-manjar', 12],
        ['torta-red-velvet', 12],
      ])
      expect(rows.every((r) => /^Familiar/.test(r.entero) && r.porcion === 'Individual' && r.activo)).toBe(true)
    })

    it('las tortas mini NO llevan regla: ninguna regla parte de un tamaño Mini', async () => {
      const { rows } = await admin.query(`select 1 from porcionado_reglas r join product_sizes ps on ps.id = r.size_entero_id where ps.tamano ilike 'Mini%'`)
      expect(rows).toHaveLength(0)
    })

    it('la base no deja una regla con tamaños de otro producto, iguales, ni con 0 porciones', async () => {
      const otro = (await admin.query(`select ps.id from product_sizes ps join products p on p.id = ps.product_id where p.slug = 'pie-limon' limit 1`)).rows[0].id
      await expect(admin.query(`insert into porcionado_reglas (product_id, size_entero_id, size_porcion_id, porciones) values ($1,$2,$3,5)`, [regla.productId, otro, regla.porcionId])).rejects.toThrow(/no es de ese producto/)
      await expect(admin.query(`insert into porcionado_reglas (product_id, size_entero_id, size_porcion_id, porciones) values ($1,$2,$2,5)`, [regla.productId, regla.enteroId])).rejects.toThrow()
      const mini = (await admin.query(`select id from product_sizes where product_id = $1 and tamano ilike 'Mini%'`, [regla.productId])).rows[0].id
      await expect(admin.query(`insert into porcionado_reglas (product_id, size_entero_id, size_porcion_id, porciones) values ($1,$2,$3,0)`, [regla.productId, mini, regla.porcionId])).rejects.toThrow()
    })
  })

  // ——— quién puede ———
  describe('autorización', () => {
    it('sin sesión 401; ventas, órdenes y producción 403 aunque sean encargados', async () => {
      expect((await llamar('POST', '/api/dashboard/stock/porcionar', { payload: {} })).statusCode).toBe(401)
      for (const perfil of PERFILES.filter((p) => !['administracion', 'caja', 'empleado_temporal'].includes(p))) {
        const r = await llamar('POST', '/api/dashboard/stock/porcionar', { perfiles: [perfil], sede: sedeA, encargado: true, payload: { reglaId: regla.id, enteras: 1 } })
        expect(r.statusCode, perfil).toBe(403)
      }
      expect(await leer(sedeA)).toMatchObject({ entero: 5, porcion: 6 })
    })

    it('Caja sin «Encargado» no puede; Caja encargada sí; el empleado transitorio encargado sí', async () => {
      const sin = await porcionarComo('caja', sedeA, 1)
      expect(sin.statusCode).toBe(403)
      expect(cuerpo(sin).error).toBe('SOLO_ENCARGADOS')
      expect(await leer(sedeA)).toMatchObject({ entero: 5, porcion: 6 })

      expect((await porcionarComo('encargada', sedeA, 1)).statusCode).toBe(201)
      const temp = await llamar('POST', '/api/dashboard/stock/porcionar', { perfiles: ['empleado_temporal'], sede: sedeA, encargado: true, actor: usuarioId, payload: { reglaId: regla.id, enteras: 1 } })
      expect(temp.statusCode).toBe(201)
    })

    it('Administración porciona sin ser Encargado, eligiendo el local; sin local da 400', async () => {
      expect((await porcionarComo('admin', sedeB, 1)).statusCode).toBe(201)
      expect(await leer(sedeB)).toMatchObject({ entero: 4, porcion: 6 + regla.porciones })
      const sinLocal = await llamar('POST', '/api/dashboard/stock/porcionar', { perfiles: ['administracion'], actor: admId, payload: { reglaId: regla.id, enteras: 1 } })
      expect(sinLocal.statusCode).toBe(400)
      expect(cuerpo(sinLocal).error).toBe('SEDE_REQUERIDA')
    })

    it('la encargada solo porciona en SU local, aunque mande otro en el cuerpo', async () => {
      const r = await porcionarComo('encargada', sedeA, 2, regla.id, { sedeId: sedeB })
      expect(r.statusCode).toBe(201)
      expect(await leer(sedeA)).toMatchObject({ entero: 3, porcion: 6 + 2 * regla.porciones })
      expect(await leer(sedeB)).toMatchObject({ entero: 5, porcion: 6 }) // intacto
    })

    it('historial y revertir: solo Administración (403 al resto, también a una encargada)', async () => {
      const hecho = await porcionarComo('encargada', sedeA, 1)
      const id = cuerpo(hecho).id
      for (const perfiles of [['caja'], ['empleado_temporal'], ['venta_digital'], ['ordenes'], ['produccion']]) {
        const lista = await llamar('GET', '/api/dashboard/porcionados', { perfiles, encargado: true, sede: sedeA })
        const rev = await llamar('POST', `/api/dashboard/porcionados/${id}/revertir`, { perfiles, encargado: true, sede: sedeA, payload: {} })
        expect(lista.statusCode, perfiles.join()).toBe(403)
        expect(cuerpo(lista).error).toBe('SOLO_ADMIN')
        expect(rev.statusCode, perfiles.join()).toBe(403)
      }
      expect(await leer(sedeA)).toMatchObject({ entero: 4 })
    })
  })

  // ——— lo que hace ———
  describe('porcionar', () => {
    it('resta las enteras, suma las porciones y deja registro de quién, cuándo y cuánto', async () => {
      const r = await porcionarComo('encargada', sedeA, 2)
      expect(r.statusCode).toBe(201)
      const d = cuerpo(r)
      expect(d).toMatchObject({ enteras: 2, porcionesGeneradas: 2 * regla.porciones, enterasQuedan: 3, porcionesQuedan: 6 + 2 * regla.porciones, tamanoPorcion: 'Individual' })
      expect(d.tamanoEntero).toMatch(/^Familiar/)
      expect(await leer(sedeA)).toMatchObject({ entero: 3, porcion: 6 + 2 * regla.porciones })

      const { rows } = await admin.query(`select * from porcionados where id = $1`, [d.id])
      expect(rows[0]).toMatchObject({ sede_id: sedeA, product_id: regla.productId, enteras: 2, rendimiento: regla.porciones, porciones_generadas: 2 * regla.porciones, hecho_por: usuarioId, revertido_en: null })
      expect(rows[0].producto_nombre).toBe('Carrot Cake')
      expect(new Date(rows[0].hecho_en).getTime()).toBeGreaterThan(Date.now() - 60_000)
    })

    it('si la fila de porciones no existe, se crea con lo porcionado y queda disponible', async () => {
      await poner(sedeA, 2, 'sinfila')
      expect((await porcionarComo('encargada', sedeA, 1)).statusCode).toBe(201)
      expect(await leer(sedeA)).toMatchObject({ entero: 1, porcion: regla.porciones, porcionDisponible: true })
    })

    it('porciones marcadas como agotadas vuelven a estar disponibles al llegar porciones', async () => {
      await admin.query(`update stock set disponible = false where sede_id = $1 and product_id = $2 and product_size_id = $3`, [sedeA, regla.productId, regla.porcionId])
      expect((await porcionarComo('encargada', sedeA, 1)).statusCode).toBe(201)
      expect((await leer(sedeA)).porcionDisponible).toBe(true)
    })

    it('la crema volteada rinde 10', async () => {
      const crema = (await admin.query(`select r.product_id, r.size_entero_id, r.size_porcion_id from porcionado_reglas r where r.id = $1`, [reglaCrema.id])).rows[0]
      await admin.query(`insert into stock (sede_id, product_id, product_size_id, disponible, cantidad) values ($1,$2,$3,true,3), ($1,$2,$4,true,0)`, [sedeA, crema.product_id, crema.size_entero_id, crema.size_porcion_id])
      const r = await porcionarComo('encargada', sedeA, 1, reglaCrema.id)
      expect(r.statusCode).toBe(201)
      expect(cuerpo(r)).toMatchObject({ porcionesGeneradas: 10, enterasQuedan: 2, porcionesQuedan: 10 })
    })

    it('rechaza lo que no se puede y NO toca el stock', async () => {
      const casos: Array<[string, () => Promise<void>, number, string]> = [
        ['más de las que hay', () => poner(sedeA, 2, 6), 409, 'STOCK_INSUFICIENTE'],
        ['enteras sin conteo', () => poner(sedeA, null, 6), 409, 'SIN_CONTEO_ENTERO'],
        ['enteras sin fila', () => poner(sedeA, 'sinfila', 6), 409, 'SIN_CONTEO_ENTERO'],
        ['porciones sin conteo', () => poner(sedeA, 5, null), 409, 'SIN_CONTEO_PORCION'],
      ]
      for (const [nombre, preparar, estado, codigo] of casos) {
        await preparar()
        const enteras = nombre === 'más de las que hay' ? 3 : 1
        const r = await porcionarComo('encargada', sedeA, enteras)
        expect(r.statusCode, nombre).toBe(estado)
        expect(cuerpo(r).error, nombre).toBe(codigo)
        const { rows } = await admin.query(`select count(*) from porcionados where sede_id = $1`, [sedeA])
        expect(Number(rows[0].count), nombre).toBe(0)
      }
    })

    it('cuerpo inválido y regla inexistente o apagada', async () => {
      expect((await porcionarComo('encargada', sedeA, 0)).statusCode).toBe(400)
      expect((await porcionarComo('encargada', sedeA, 1.5)).statusCode).toBe(400)
      expect((await porcionarComo('encargada', sedeA, 1, randomUUID())).statusCode).toBe(404)
      await admin.query(`update porcionado_reglas set activo = false where id = $1`, [regla.id])
      try {
        const r = await porcionarComo('encargada', sedeA, 1)
        expect(r.statusCode).toBe(404)
        expect(cuerpo(r).error).toBe('REGLA_NO_ENCONTRADA')
      } finally {
        await admin.query(`update porcionado_reglas set activo = true where id = $1`, [regla.id])
      }
      expect(await leer(sedeA)).toMatchObject({ entero: 5, porcion: 6 })
    })

    it('dos personas porcionando a la vez no se pisan: con 4 enteras y 3+3, solo una pasa', async () => {
      await poner(sedeA, 4, 0)
      const [a, b] = await Promise.all([porcionarComo('encargada', sedeA, 3), porcionarComo('admin', sedeA, 3)])
      expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409])
      expect(await leer(sedeA)).toMatchObject({ entero: 1, porcion: 3 * regla.porciones })
    })

    it('el aumento del rendimiento no cambia lo ya hecho: el historial guarda el rendimiento de ese momento', async () => {
      const r = await porcionarComo('encargada', sedeA, 1)
      await admin.query(`update porcionado_reglas set porciones = 8 where id = $1`, [regla.id])
      try {
        const { rows } = await admin.query(`select rendimiento, porciones_generadas from porcionados where id = $1`, [cuerpo(r).id])
        expect(rows[0]).toMatchObject({ rendimiento: regla.porciones, porciones_generadas: regla.porciones })
        // y el siguiente usa el rendimiento nuevo
        const r2 = await porcionarComo('encargada', sedeA, 1)
        expect(cuerpo(r2).porcionesGeneradas).toBe(8)
      } finally {
        await admin.query(`update porcionado_reglas set porciones = $2 where id = $1`, [regla.id, regla.porciones])
      }
    })
  })

  // ——— historial y reversión ———
  describe('historial y reversión (Administración)', () => {
    it('el historial dice quién porcionó, dónde y cuánto, más reciente primero', async () => {
      await porcionarComo('encargada', sedeA, 1)
      await porcionarComo('admin', sedeA, 1)
      const r = await llamar('GET', `/api/dashboard/porcionados?sedeId=${sedeA}`, { perfiles: ['administracion'], actor: admId })
      expect(r.statusCode).toBe(200)
      const lista = cuerpo(r).porcionados
      expect(lista).toHaveLength(2)
      expect(lista[0]).toMatchObject({ hechoPor: 'Admin de prueba', producto: 'Carrot Cake', enteras: 1, porcionesGeneradas: regla.porciones, revertidoEn: null })
      expect(lista[1].hechoPor).toBe('Encargada de prueba')
      expect(lista[0].sedeNombre).toMatch(/^Porcionado A/)
    })

    it('revertir devuelve las enteras, quita las porciones y registra quién y por qué', async () => {
      const hecho = cuerpo(await porcionarComo('encargada', sedeA, 2))
      const r = await llamar('POST', `/api/dashboard/porcionados/${hecho.id}/revertir`, { perfiles: ['administracion'], actor: admId, payload: { motivo: 'Se cortó mal' } })
      expect(r.statusCode).toBe(200)
      expect(cuerpo(r)).toMatchObject({ enterasQuedan: 5, porcionesQuedan: 6 })
      expect(await leer(sedeA)).toMatchObject({ entero: 5, porcion: 6 })
      const { rows } = await admin.query(`select revertido_por, revertido_en, motivo_reversion from porcionados where id = $1`, [hecho.id])
      expect(rows[0]).toMatchObject({ revertido_por: admId, motivo_reversion: 'Se cortó mal' })
      expect(rows[0].revertido_en).not.toBeNull()
    })

    it('no se revierte dos veces', async () => {
      const hecho = cuerpo(await porcionarComo('encargada', sedeA, 1))
      const url = `/api/dashboard/porcionados/${hecho.id}/revertir`
      expect((await llamar('POST', url, { perfiles: ['administracion'], actor: admId, payload: {} })).statusCode).toBe(200)
      const otra = await llamar('POST', url, { perfiles: ['administracion'], actor: admId, payload: {} })
      expect(otra.statusCode).toBe(409)
      expect(cuerpo(otra).error).toBe('YA_REVERTIDO')
      expect(await leer(sedeA)).toMatchObject({ entero: 5, porcion: 6 })
    })

    it('si las porciones ya no están, no revierte y dice cuántas faltan; el stock queda igual', async () => {
      const hecho = cuerpo(await porcionarComo('encargada', sedeA, 2))
      await admin.query(`update stock set cantidad = 10 where sede_id = $1 and product_id = $2 and product_size_id = $3`, [sedeA, regla.productId, regla.porcionId])
      const r = await llamar('POST', `/api/dashboard/porcionados/${hecho.id}/revertir`, { perfiles: ['administracion'], actor: admId, payload: {} })
      expect(r.statusCode).toBe(409)
      expect(cuerpo(r).error).toBe('PORCIONES_INSUFICIENTES')
      expect(cuerpo(r).detalle).toMatch(/faltan 14/)
      expect(await leer(sedeA)).toMatchObject({ entero: 3, porcion: 10 })
      const { rows } = await admin.query(`select revertido_en from porcionados where id = $1`, [hecho.id])
      expect(rows[0].revertido_en).toBeNull()
    })

    it('un porcionado que no existe da 404', async () => {
      expect((await llamar('POST', `/api/dashboard/porcionados/${randomUUID()}/revertir`, { perfiles: ['administracion'], actor: admId, payload: {} })).statusCode).toBe(404)
    })

    it('la base no deja editar ni borrar el historial (solo la reversión, una vez), ni siquiera a la API', async () => {
      const hecho = cuerpo(await porcionarComo('encargada', sedeA, 1))
      const api = new pg.Pool({ connectionString: process.env.DATABASE_URL })
      try {
        await expect(api.query(`update porcionados set enteras = 99, porciones_generadas = 99 * rendimiento where id = $1`, [hecho.id])).rejects.toThrow(/no se edita/)
        // La API ni siquiera tiene permiso de borrar (y, aunque lo tuviera, el trigger lo impide).
        await expect(api.query(`delete from porcionados where id = $1`, [hecho.id])).rejects.toThrow(/permission denied|no se borra/)
      } finally {
        await api.end()
      }
    })
  })
})

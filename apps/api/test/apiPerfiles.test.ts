// Perfiles del equipo en la API (migración 0054): cada ruta del panel solo la abre quien tiene el perfil que le toca.
// El JWT real se reemplaza por un mock que fija `req.operador` con los perfiles de la cabecera `x-test-perfiles`
// (lo que se prueba acá es la autorización de la ruta, no la firma de Supabase, que ya cubren otros tests).
//
// Para cada ruta se comprueba, con TODOS los perfiles, que el que corresponde pasa la barrera de perfil (no importa
// si después la ruta responde 400 por un cuerpo vacío o 404 por un id inventado) y que todos los demás reciben 403.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'
import { PERFILES, type Perfil } from '@bakebrothers/domain'

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
      id: '00000000-0000-0000-0000-0000000000bb',
      rol: lista.includes('administracion') ? 'admin' : 'operador',
      sedeId: req.headers['x-test-sede'] ?? null,
      perfiles: lista,
    }
  },
}))

const { buildApp } = await import('../src/app.js')

// El límite de 100 pedidos por minuto es por IP: cada llamada de prueba sale de una dirección distinta.
let ip = 0
const otraIp = () => `10.${(ip >> 16) & 255}.${(ip >> 8) & 255}.${++ip & 255}`

const UUID = '00000000-0000-0000-0000-000000000000'
const FECHA = '2031-05-12'

interface RutaPrueba {
  nombre: string
  metodo: 'GET' | 'POST'
  url: string
  /** Perfiles (sin Administración, que entra siempre salvo en las rutas «solo admin») que pasan la barrera. */
  permitidos: Perfil[]
  soloAdmin?: boolean
}

const RUTAS: RutaPrueba[] = [
  // Nuevo pedido
  { nombre: 'Nuevo pedido', metodo: 'POST', url: '/api/dashboard/orders', permitidos: ['venta_digital', 'empleado_temporal'] },
  { nombre: 'Comprobante del pedido', metodo: 'GET', url: '/api/dashboard/orders/BB-1/comprobante.pdf', permitidos: ['venta_digital', 'empleado_temporal'] },
  // Conversaciones
  { nombre: 'Responder una conversación', metodo: 'POST', url: `/api/dashboard/conversaciones/${UUID}/responder`, permitidos: ['venta_digital', 'empleado_temporal'] },
  { nombre: 'Plantillas de una conversación', metodo: 'GET', url: `/api/dashboard/conversaciones/${UUID}/plantillas`, permitidos: ['venta_digital', 'empleado_temporal'] },
  { nombre: 'Enviar una plantilla', metodo: 'POST', url: `/api/dashboard/conversaciones/${UUID}/plantilla`, permitidos: ['venta_digital', 'empleado_temporal'] },
  { nombre: 'Tomar una conversación', metodo: 'POST', url: `/api/dashboard/conversaciones/${UUID}/tomar`, permitidos: ['venta_digital', 'empleado_temporal'] },
  { nombre: 'Devolver al bot', metodo: 'POST', url: `/api/dashboard/conversaciones/${UUID}/devolver`, permitidos: ['venta_digital', 'empleado_temporal'] },
  { nombre: 'Cerrar una conversación', metodo: 'POST', url: `/api/dashboard/conversaciones/${UUID}/cerrar`, permitidos: ['venta_digital', 'empleado_temporal'] },
  { nombre: 'Cambiar el local de una conversación', metodo: 'POST', url: `/api/dashboard/conversaciones/${UUID}/sede`, permitidos: [], soloAdmin: true },
  // Órdenes
  { nombre: 'Orden de mayorista', metodo: 'POST', url: '/api/dashboard/ordenes/mayorista', permitidos: ['ordenes', 'empleado_temporal'] },
  { nombre: 'Repetir la última orden del mayorista', metodo: 'GET', url: `/api/dashboard/ordenes/mayorista/ultima?clienteId=${UUID}`, permitidos: ['ordenes', 'empleado_temporal'] },
  { nombre: 'Orden de Rappi', metodo: 'POST', url: '/api/dashboard/ordenes/rappi', permitidos: ['ordenes', 'empleado_temporal'] },
  // Hojas para imprimir: las imprimen Órdenes y Producción
  { nombre: 'Hoja del día', metodo: 'GET', url: `/api/dashboard/ordenes/hoja-del-dia.pdf?fecha=${FECHA}`, permitidos: ['ordenes', 'produccion', 'empleado_temporal'] },
  { nombre: 'Hoja de empaque de mayoristas', metodo: 'GET', url: `/api/dashboard/ordenes/empaque-mayorista.pdf?fecha=${FECHA}`, permitidos: ['ordenes', 'produccion', 'empleado_temporal'] },
  { nombre: 'Hoja de pedidos agendados', metodo: 'GET', url: `/api/dashboard/ordenes/agendados.pdf?fecha=${FECHA}`, permitidos: ['ordenes', 'produccion', 'empleado_temporal'] },
  // Producción
  { nombre: 'Plan del día', metodo: 'GET', url: `/api/dashboard/produccion/plan?fecha=${FECHA}`, permitidos: ['produccion', 'empleado_temporal'] },
  { nombre: 'Marcar producido', metodo: 'POST', url: '/api/dashboard/produccion/producido', permitidos: ['produccion', 'empleado_temporal'] },
  { nombre: 'Hoja de producción', metodo: 'GET', url: `/api/dashboard/produccion/hoja.pdf?fecha=${FECHA}`, permitidos: ['produccion', 'empleado_temporal'] },
  // Solo Administración
  { nombre: 'Códigos de Mifact', metodo: 'POST', url: '/api/dashboard/mifact/codigos', permitidos: [], soloAdmin: true },
  { nombre: 'Conectar WhatsApp', metodo: 'POST', url: '/api/dashboard/whatsapp/conexiones/manual', permitidos: [], soloAdmin: true },
  { nombre: 'Simulador del bot', metodo: 'POST', url: '/api/dashboard/simulador/mensaje', permitidos: [], soloAdmin: true },
  // De todo el personal (cada quien activa los avisos de su celular)
  { nombre: 'Clave de avisos del celular', metodo: 'GET', url: '/api/dashboard/push/clave', permitidos: [...PERFILES] },
]

const ERRORES_DE_PERFIL = ['SIN_PERFIL_PARA_ESTA_ACCION', 'SOLO_ADMIN']

describe.skipIf(!hayBaseDeDatosReal)('API: cada ruta del panel solo para el perfil que le toca', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let app: Awaited<ReturnType<typeof buildApp>>
  let sedeA: string

  beforeAll(async () => {
    sedeA = (await pool.query(`select id from sedes where activo order by nombre limit 1`)).rows[0].id
    app = await buildApp()
  })
  afterAll(async () => {
    await pool.end()
  })

  const llamar = async (ruta: RutaPrueba, perfiles: Perfil[], sede: string | null = null) => {
    const r = await app.inject({
      method: ruta.metodo,
      url: ruta.url,
      remoteAddress: otraIp(),
      headers: { 'x-test-perfiles': perfiles.join(','), ...(sede ? { 'x-test-sede': sede } : {}) },
      ...(ruta.metodo === 'POST' ? { payload: {} } : {}),
    })
    let error: string | undefined
    try {
      error = JSON.parse(r.body)?.error
    } catch {
      // un PDF o una respuesta sin JSON: no hay código de error
    }
    return { status: r.statusCode, error }
  }

  const rechazada = (r: { status: number; error?: string }) => r.status === 403 && ERRORES_DE_PERFIL.includes(r.error ?? '')

  for (const ruta of RUTAS) {
    it(`${ruta.nombre}: ${ruta.soloAdmin ? 'solo Administración' : ruta.permitidos.length === PERFILES.length ? 'todo el personal' : ruta.permitidos.join(' / ') + ' y Administración'}`, async () => {
      // Administración siempre pasa la barrera de perfil (salvo que la ruta se haya cerrado a un tercero, que no es el caso)
      expect(rechazada(await llamar(ruta, ['administracion']))).toBe(false)
      for (const perfil of PERFILES.filter((p) => p !== 'administracion')) {
        const r = await llamar(ruta, [perfil], sedeA)
        if (ruta.permitidos.includes(perfil)) expect(rechazada(r), `${perfil} debería pasar (${r.status} ${r.error})`).toBe(false)
        else expect(rechazada(r), `${perfil} debería recibir 403 (${r.status} ${r.error})`).toBe(true)
      }
    })
  }

  it('sin sesión: 401 en todas', async () => {
    for (const ruta of RUTAS) {
      const r = await app.inject({ method: ruta.metodo, url: ruta.url, remoteAddress: otraIp(), ...(ruta.metodo === 'POST' ? { payload: {} } : {}) })
      expect(r.statusCode, ruta.nombre).toBe(401)
    }
  })

  it('una cuenta con varios perfiles abre la unión de sus rutas (Venta digital + Órdenes)', async () => {
    const mixto: Perfil[] = ['venta_digital', 'ordenes']
    for (const nombre of ['Nuevo pedido', 'Responder una conversación', 'Orden de mayorista', 'Hoja del día']) {
      expect(rechazada(await llamar(RUTAS.find((r) => r.nombre === nombre)!, mixto)), nombre).toBe(false)
    }
    for (const nombre of ['Plan del día', 'Marcar producido', 'Conectar WhatsApp']) {
      expect(rechazada(await llamar(RUTAS.find((r) => r.nombre === nombre)!, mixto, sedeA)), nombre).toBe(true)
    }
  })

  // ——— alcance por local ———
  const hojaDelDia = RUTAS.find((r) => r.nombre === 'Hoja del día')!
  const plan = RUTAS.find((r) => r.nombre === 'Plan del día')!

  it('Órdenes no tiene local y aun así imprime la hoja del día de todos los locales (sin pedirle un local)', async () => {
    const r = await app.inject({ method: 'GET', url: hojaDelDia.url, remoteAddress: otraIp(), headers: { 'x-test-perfiles': 'ordenes' } })
    expect(r.statusCode).toBe(200)
    expect(r.headers['content-type']).toContain('application/pdf')
    expect(r.rawPayload.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('Producción trabaja en UN local: sin local asignado no puede ver el plan ni imprimir su hoja', async () => {
    const sinLocal = await app.inject({ method: 'GET', url: plan.url, remoteAddress: otraIp(), headers: { 'x-test-perfiles': 'produccion' } })
    expect(sinLocal.statusCode).toBe(403)
    expect(JSON.parse(sinLocal.body).error).toBe('SIN_SEDE_ASIGNADA')
    const hoja = await app.inject({ method: 'GET', url: hojaDelDia.url, remoteAddress: otraIp(), headers: { 'x-test-perfiles': 'produccion' } })
    expect(hoja.statusCode).toBe(403)
    expect(JSON.parse(hoja.body).error).toBe('SIN_SEDE_ASIGNADA')
    const conLocal = await app.inject({ method: 'GET', url: plan.url, remoteAddress: otraIp(), headers: { 'x-test-perfiles': 'produccion', 'x-test-sede': sedeA } })
    expect(conLocal.statusCode).toBe(200)
  })

  it('Producción no puede mirar otro local aunque lo pida: se queda en el suyo', async () => {
    const otro = (await pool.query(`select id from sedes where activo and id <> $1 limit 1`, [sedeA])).rows[0].id
    const r = await app.inject({ method: 'GET', url: `${plan.url}&sedeId=${otro}`, remoteAddress: otraIp(), headers: { 'x-test-perfiles': 'produccion', 'x-test-sede': sedeA } })
    expect(r.statusCode).toBe(200)
    expect(JSON.parse(r.body).sedeId ?? sedeA).toBe(sedeA)
  })
})

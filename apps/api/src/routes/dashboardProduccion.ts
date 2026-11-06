import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { withTenantTx } from '../db.js'
import { verificarJwtOperador, type OperadorAutenticado } from '../auth/verificarJwtOperador.js'
import {
  crearOrdenMayorista,
  crearOrdenRappi,
  ultimaOrdenMayorista,
  type ResultadoOrdenEquipo,
} from '../services/ordenesEquipo.js'
import { cargarEmpaqueMayorista, cargarPlanDelDia, marcarProducido } from '../services/planProduccionDia.js'
import { hojaEmpaqueMayoristaPdf, hojaProduccionPdf } from '../services/hojasPdf.js'

/**
 * Ciclo Órdenes → Producción → Stock (apps/admin): órdenes de mayoristas y de Rappi, el plan del día, «producido»
 * que deja el stock disponible, y las hojas para imprimir. Todas exigen el JWT real del panel (ver
 * auth/verificarJwtOperador.ts). Un empleado (rol `operador`) queda SIEMPRE forzado a su propia sede; solo el
 * admin elige sede o ve todas.
 */

const fechaISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha debe ser YYYY-MM-DD')
const uuid = z.string().uuid()

const ERROR_A_CODIGO_HTTP: Record<string, number> = {
  SIN_ITEMS: 400,
  FECHA_INVALIDA: 400,
  HORA_INVALIDA: 400,
  PRODUCTO_NO_ENCONTRADO: 400,
  NO_ES_EMPANADA: 400,
  TAMANO_NO_DISPONIBLE: 400,
  TAMANO_INVALIDO: 400,
  CLIENTE_REQUERIDO: 400,
  CLIENTE_NO_ENCONTRADO: 404,
  REFERENCIA_REQUERIDA: 400,
  TOTAL_INVALIDO: 400,
  ORDEN_RAPPI_DUPLICADA: 409,
  CANTIDAD_INVALIDA: 400,
  TAMANO_NO_ENCONTRADO: 400,
  NO_ESTA_EN_EL_PLAN: 409,
  TENANT_NO_ENCONTRADO: 404,
}

type Resolucion = { ok: true; sedeId: string | null } | { ok: false; codigo: number; error: string }

/** Sede con la que se trabaja: la del empleado (forzada), o la que pida el admin (null = todas, solo admin). */
function resolverSede(operador: OperadorAutenticado, solicitada: string | null | undefined): Resolucion {
  if (operador.rol === 'operador') {
    if (!operador.sedeId) return { ok: false, codigo: 403, error: 'SIN_SEDE_ASIGNADA' }
    return { ok: true, sedeId: operador.sedeId }
  }
  return { ok: true, sedeId: solicitada ?? null }
}

const responderOrden = (reply: FastifyReply, r: ResultadoOrdenEquipo) => {
  if (!r.ok) return reply.code(ERROR_A_CODIGO_HTTP[r.error] ?? 400).send({ error: r.error, detalle: r.detalle })
  return reply.code(201).send(r)
}

const empanadaSchema = z.object({
  productoId: uuid,
  tamano: z.enum(['Mediana', 'Grande']),
  cantidad: z.number().int().positive().max(9999),
})
const postreSchema = z.object({
  productoId: uuid,
  tamano: z.string().trim().min(1).nullish(),
  cantidad: z.number().int().positive().max(9999),
})
const mayoristaSchema = z.object({
  cliente: z.object({ id: uuid.nullish(), nombre: z.string().trim().min(1).nullish(), telefono: z.string().trim().nullish() }),
  sedeId: uuid.nullish(),
  fechaEntrega: fechaISO,
  hora: z.string().trim().min(1),
  empanadas: z.array(empanadaSchema).default([]),
  postres: z.array(postreSchema).default([]),
  nota: z.string().trim().nullish(),
})
const rappiSchema = z.object({
  referenciaExterna: z.string().trim().min(1).max(60),
  sedeId: uuid.nullish(),
  fechaEntrega: fechaISO,
  hora: z.string().trim().nullish(),
  items: z.array(z.object({ productoId: uuid, tamano: z.string().trim().min(1).nullish(), cantidad: z.number().int().positive().max(999) })).min(1),
  total: z.number().positive().max(100000),
  nota: z.string().trim().nullish(),
})

const consultaDia = z.object({ fecha: fechaISO, sedeId: uuid.optional() })

async function nombreDeSede(client: import('pg').PoolClient, sedeId: string | null): Promise<string> {
  if (!sedeId) return 'Todas las sedes'
  const { rows } = await client.query(`select nombre from sedes where id = $1`, [sedeId])
  return rows[0]?.nombre ?? 'Sede'
}

export function dashboardProduccionRoutes(app: FastifyInstance) {
  const pre = { preHandler: verificarJwtOperador }

  // ————————————————————————————————————————————————————————— plan del día ————
  app.get('/api/dashboard/produccion/plan', pre, async (req, reply) => {
    const q = consultaDia.parse(req.query)
    const sede = resolverSede(req.operador!, q.sedeId)
    if (!sede.ok) return reply.code(sede.codigo).send({ error: sede.error })
    return withTenantTx(req.tenantId, (client) => cargarPlanDelDia(client, req.tenantId, q.fecha, sede.sedeId))
  })

  app.post('/api/dashboard/produccion/producido', pre, async (req, reply) => {
    const body = z
      .object({
        fecha: fechaISO,
        sedeId: uuid.optional(),
        productId: uuid,
        tamano: z.string().trim().min(1).nullable(),
        cantidadProducida: z.number().int().min(0).max(99999),
      })
      .parse(req.body)
    const sede = resolverSede(req.operador!, body.sedeId)
    if (!sede.ok) return reply.code(sede.codigo).send({ error: sede.error })
    // Marcar producido toca el stock de UNA sede: el admin tiene que decir cuál.
    if (!sede.sedeId) return reply.code(400).send({ error: 'SEDE_REQUERIDA' })
    const r = await withTenantTx(req.tenantId, (client) =>
      marcarProducido(client, req.tenantId, {
        fechaISO: body.fecha,
        sedeId: sede.sedeId!,
        productId: body.productId,
        tamano: body.tamano,
        cantidadProducida: body.cantidadProducida,
        usuarioId: req.operador!.id,
      })
    )
    if (!r.ok) return reply.code(ERROR_A_CODIGO_HTTP[r.error] ?? 400).send({ error: r.error })
    return r
  })

  // ——————————————————————————————————————————————————————————— hojas PDF ————
  app.get('/api/dashboard/produccion/hoja.pdf', pre, async (req, reply) => {
    const q = consultaDia.parse(req.query)
    const sede = resolverSede(req.operador!, q.sedeId)
    if (!sede.ok) return reply.code(sede.codigo).send({ error: sede.error })
    const pdf = await withTenantTx(req.tenantId, async (client) => {
      const plan = await cargarPlanDelDia(client, req.tenantId, q.fecha, sede.sedeId)
      return hojaProduccionPdf(plan.hoja, {
        fecha: q.fecha,
        sede: await nombreDeSede(client, sede.sedeId),
        pagoPendiente: plan.pagoPendiente,
        sinAsignar: plan.sinAsignar,
      })
    })
    reply.header('Content-Type', 'application/pdf')
    reply.header('Content-Disposition', `inline; filename="hoja-produccion-${q.fecha}.pdf"`)
    return reply.send(pdf)
  })

  app.get('/api/dashboard/ordenes/empaque-mayorista.pdf', pre, async (req, reply) => {
    const q = consultaDia.parse(req.query)
    const sede = resolverSede(req.operador!, q.sedeId)
    if (!sede.ok) return reply.code(sede.codigo).send({ error: sede.error })
    const pdf = await withTenantTx(req.tenantId, async (client) => {
      const bloques = await cargarEmpaqueMayorista(client, req.tenantId, q.fecha, sede.sedeId)
      return hojaEmpaqueMayoristaPdf(bloques, { fecha: q.fecha, sede: await nombreDeSede(client, sede.sedeId) })
    })
    reply.header('Content-Type', 'application/pdf')
    reply.header('Content-Disposition', `inline; filename="empaque-mayorista-${q.fecha}.pdf"`)
    return reply.send(pdf)
  })

  // ———————————————————————————————————————————— órdenes de mayoristas y Rappi ————
  app.post('/api/dashboard/ordenes/mayorista', pre, async (req, reply) => {
    const body = mayoristaSchema.parse(req.body)
    const sede = resolverSede(req.operador!, body.sedeId)
    if (!sede.ok) return reply.code(sede.codigo).send({ error: sede.error })
    const r = await withTenantTx(req.tenantId, (client) =>
      crearOrdenMayorista(client, req.tenantId, {
        cliente: body.cliente,
        sedeId: sede.sedeId,
        fechaEntregaISO: body.fechaEntrega,
        hora: body.hora,
        empanadas: body.empanadas,
        postres: body.postres,
        nota: body.nota,
      })
    )
    return responderOrden(reply, r)
  })

  // «Repetir el anterior»: las líneas de la última orden de ese mayorista, para precargar el formulario.
  app.get('/api/dashboard/ordenes/mayorista/ultima', pre, async (req, reply) => {
    const { clienteId } = z.object({ clienteId: uuid }).parse(req.query)
    const r = await withTenantTx(req.tenantId, (client) => ultimaOrdenMayorista(client, req.tenantId, clienteId))
    if (!r) return reply.code(404).send({ error: 'SIN_ORDEN_ANTERIOR' })
    return r
  })

  app.post('/api/dashboard/ordenes/rappi', pre, async (req, reply) => {
    const body = rappiSchema.parse(req.body)
    const sede = resolverSede(req.operador!, body.sedeId)
    if (!sede.ok) return reply.code(sede.codigo).send({ error: sede.error })
    const r = await withTenantTx(req.tenantId, (client) =>
      crearOrdenRappi(client, req.tenantId, {
        referenciaExterna: body.referenciaExterna,
        sedeId: sede.sedeId,
        fechaEntregaISO: body.fechaEntrega,
        hora: body.hora,
        items: body.items,
        total: body.total,
        nota: body.nota,
      })
    )
    return responderOrden(reply, r)
  })
}

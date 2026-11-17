import type pg from 'pg'
import {
  ESTADOS_ANULABLES,
  desglosarLineas,
  entidadDeCobro,
  estadoComprobanteLegible,
  estadoDeCodigoMifact,
  fechaLimaISO,
  pedidoEsFacturable,
  resolverReceptor,
  totalesCoinciden,
  validarDni,
  type EntidadCobro,
  type DesgloseComprobante,
  type EstadoComprobante,
  type LineaVenta,
  type Receptor,
  type ReceptorEntrada,
  type TipoComprobante,
} from '@bakebrothers/domain'
import { leerConfigEmisor, type ConfigEmisorMifact } from '../mifact/config.js'
import {
  MifactApiError,
  MifactRedError,
  crearClienteMifact,
  esDocumentoInexistente,
  esNumeroYaUsado,
  type IdentificadorDocumento,
  type RespuestaMifact,
} from '../mifact/cliente.js'
import { construirDocumento } from '../mifact/construirDocumento.js'

/**
 * Comprobantes electrónicos (boleta / factura) de un pedido de Bake OS, emitidos con Mifact.
 *
 * Reglas que sostiene este servicio (y que prueban sus tests):
 *   · Se valida TODO antes de gastar un correlativo: pedido facturable, total que cuadra, receptor que SUNAT aceptaría.
 *   · El correlativo lo generamos nosotros (Mifact no lo hace), de forma atómica y sin reutilizar jamás un número que
 *     pudo haber llegado a Mifact. La fila queda guardada ANTES de llamar a Mifact (estado `pendiente_envio`), así una
 *     respuesta perdida no deja un comprobante fantasma: se consulta su estado y se adopta, o se reintenta el MISMO envío.
 *   · La llamada a Mifact se hace FUERA de cualquier transacción de base de datos.
 *   · Nada del token en la base, en los errores ni en los logs.
 */

export type CodigoErrorComprobante =
  | 'MIFACT_NO_CONFIGURADO'
  | 'PEDIDO_NO_ENCONTRADO'
  | 'PEDIDO_NO_FACTURABLE'
  | 'PEDIDO_TOTAL_PENDIENTE'
  | 'SIN_LINEAS_FACTURABLES'
  | 'TOTAL_NO_COINCIDE'
  | 'COMPROBANTE_YA_EMITIDO'
  | 'RECEPTOR_INVALIDO'
  | 'COMPROBANTE_NO_ENCONTRADO'
  | 'ESTADO_NO_PERMITE'
  | 'ENTORNO_NO_COINCIDE'
  | 'CORREO_INVALIDO'
  | 'MOTIVO_INVALIDO'
  | 'SIN_PDF'
  | 'NUMERO_NO_DISPONIBLE'
  | 'MIFACT_RECHAZO'
  | 'MIFACT_SIN_RESPUESTA'

export class ComprobanteError extends Error {
  constructor(
    readonly codigo: CodigoErrorComprobante,
    mensaje: string,
    readonly detalle?: unknown,
    /** Si el fallo dejó una fila guardada (p. ej. envío sin respuesta), su id, para poder consultarla o reintentar. */
    readonly comprobanteId?: string
  ) {
    super(mensaje)
    this.name = 'ComprobanteError'
  }
}

export interface Comprobante {
  id: string
  pedido: string
  tipo: TipoComprobante
  serie: string
  correlativo: number
  /** «B001-00000001». */
  numero: string
  emisor: EntidadCobro
  entorno: 'demo' | 'produccion'
  fechaEmision: string
  receptor: { tipoDoc: string; documento: string; nombre: string; direccion: string | null; correo: string | null }
  gravado: number
  igv: number
  total: number
  estado: EstadoComprobante
  estadoLegible: string
  estadoCodigo: number | null
  sunat: { codigo: string | null; descripcion: string | null; nota: string | null }
  hash: string | null
  urlPdf: string | null
  tienePdf: boolean
  motivoAnulacion: string | null
  correoEnviadoA: string | null
  ultimoError: string | null
  creadoEn: string
  consultadoEn: string | null
}

const COLUMNAS = `
  c.id, o.numero as pedido, c.tipo, c.serie, c.correlativo, c.emisor, c.entorno,
  to_char(c.fecha_emision, 'YYYY-MM-DD') as fecha_emision,
  c.receptor_tipo_doc, c.receptor_doc, c.receptor_nombre, c.receptor_direccion, c.receptor_correo,
  c.gravado::float8 as gravado, c.igv::float8 as igv, c.total::float8 as total,
  c.estado, c.estado_codigo, c.sunat_codigo, c.sunat_descripcion, c.sunat_nota, c.hash, c.url_pdf,
  (c.pdf is not null) as tiene_pdf, c.motivo_anulacion, c.correo_enviado_a, c.ultimo_error,
  c.creado_en, c.consultado_en, c.payload`
const DESDE = `from comprobantes c join orders o on o.id = c.order_id`

type Fila = Record<string, any>

const aComprobante = (r: Fila): Comprobante => ({
  id: r.id,
  pedido: r.pedido,
  tipo: r.tipo,
  serie: r.serie,
  correlativo: r.correlativo,
  numero: `${r.serie}-${String(r.correlativo).padStart(8, '0')}`,
  emisor: r.emisor,
  entorno: r.entorno,
  fechaEmision: r.fecha_emision,
  receptor: { tipoDoc: r.receptor_tipo_doc, documento: r.receptor_doc, nombre: r.receptor_nombre, direccion: r.receptor_direccion, correo: r.receptor_correo },
  gravado: r.gravado,
  igv: r.igv,
  total: r.total,
  estado: r.estado,
  estadoLegible: estadoComprobanteLegible(r.estado),
  estadoCodigo: r.estado_codigo,
  sunat: { codigo: r.sunat_codigo, descripcion: r.sunat_descripcion, nota: r.sunat_nota },
  hash: r.hash,
  urlPdf: r.url_pdf,
  tienePdf: r.tiene_pdf,
  motivoAnulacion: r.motivo_anulacion,
  correoEnviadoA: r.correo_enviado_a,
  ultimoError: r.ultimo_error,
  creadoEn: new Date(r.creado_en).toISOString(),
  consultadoEn: r.consultado_en ? new Date(r.consultado_en).toISOString() : null,
})

// ———————————————————————————————————————————————————————————————— lectura ————

export async function obtenerComprobante(pool: pg.Pool, tenantId: string, id: string): Promise<Comprobante> {
  const { rows } = await pool.query(`select ${COLUMNAS} ${DESDE} where c.id = $1 and c.tenant_id = $2`, [id, tenantId])
  if (!rows[0]) throw new ComprobanteError('COMPROBANTE_NO_ENCONTRADO', 'No existe ese comprobante')
  return aComprobante(rows[0])
}

export async function comprobantesDePedido(pool: pg.Pool, tenantId: string, numeroPedido: string): Promise<Comprobante[]> {
  const { rows } = await pool.query(`select ${COLUMNAS} ${DESDE} where o.numero = $1 and c.tenant_id = $2 order by c.creado_en`, [numeroPedido, tenantId])
  return rows.map(aComprobante)
}

// ———————————————————————————————————————————————————————————— configuración ————

function configDe(emisor: EntidadCobro): ConfigEmisorMifact {
  const r = leerConfigEmisor(emisor)
  if (!r.ok) {
    throw new ComprobanteError('MIFACT_NO_CONFIGURADO', `Mifact no está configurado para ${emisor}`, {
      faltan: r.faltan,
      invalidas: r.invalidas,
    })
  }
  return r.config
}

/** Comprobante ya guardado + la configuración del emisor que lo emitió + cómo identificarlo ante Mifact. */
async function contextoDe(pool: pg.Pool, tenantId: string, id: string) {
  const { rows } = await pool.query(`select ${COLUMNAS}, c.order_id ${DESDE} where c.id = $1 and c.tenant_id = $2`, [id, tenantId])
  const fila = rows[0] as Fila | undefined
  if (!fila) throw new ComprobanteError('COMPROBANTE_NO_ENCONTRADO', 'No existe ese comprobante')
  const config = configDe(fila.emisor)
  // Nunca se opera un documento del demo con la configuración de producción (ni al revés): los números no son de ahí.
  if (config.entorno !== fila.entorno)
    throw new ComprobanteError('ENTORNO_NO_COINCIDE', `El comprobante es de ${fila.entorno} y Mifact está configurado en ${config.entorno}`)
  const documento: IdentificadorDocumento = {
    ruc: String(fila.payload.NUM_NIF_EMIS),
    tipoCpe: String(fila.payload.COD_TIP_CPE),
    serie: fila.serie,
    correlativo: fila.correlativo,
    fechaEmision: fila.fecha_emision,
  }
  return { fila, config, documento, cliente: crearClienteMifact(config) }
}

// ——————————————————————————————————————————————————————————————— emisión ————

export interface EmitirEntrada {
  /** Número del pedido, p. ej. «BB-2500». */
  pedido: string
  tipo: TipoComprobante
  receptor?: ReceptorEntrada
  /** Usuario del panel que emite (queda en el comprobante). */
  usuarioId?: string | null
}

const MAX_COLISIONES = 5

interface PedidoParaComprobante {
  id: string
  numero: string
  estado: string
  tipoEntrega: string
  delivery: number
  total: number
  totalPendiente: boolean
  sedeNombre: string | null
  cliente: { nombre: string; dni: string | null; correo: string | null }
  lineas: LineaVenta[]
  codigos: string[]
}

async function cargarPedido(pool: pg.Pool, tenantId: string, numero: string): Promise<PedidoParaComprobante> {
  const { rows } = await pool.query(
    `select o.id, o.numero, o.estado, o.tipo_entrega, o.delivery::float8 as delivery, o.total::float8 as total, o.total_pendiente,
            s.nombre as sede_nombre, c.nombre as cliente_nombre, c.dni as cliente_dni, c.correo as cliente_correo
       from orders o
       join customers c on c.id = o.customer_id
       left join sedes s on s.id = o.sede_id
      where o.tenant_id = $1 and o.numero = $2`,
    [tenantId, numero]
  )
  const o = rows[0]
  if (!o) throw new ComprobanteError('PEDIDO_NO_ENCONTRADO', `No existe el pedido ${numero}`)
  const items = await pool.query(
    `select oi.nombre_producto, oi.tamano, oi.sabor, oi.extras, oi.precio_unitario::float8 as precio, oi.cantidad,
            p.slug, oi.combo_id, oi.catering_item_id
       from order_items oi left join products p on p.id = oi.product_id
      where oi.order_id = $1 order by oi.nombre_producto, oi.tamano`,
    [o.id]
  )
  const lineas: LineaVenta[] = []
  const codigos: string[] = []
  // Las líneas a precio 0 (la composición de un combo, un catering que se cotiza aparte) no se facturan: el total del
  // pedido ya las incluye en el precio del combo / se cobra por otro lado.
  for (const it of items.rows) {
    if (!(it.precio > 0)) continue
    const detalle = [it.tamano, it.sabor].filter(Boolean).join(', ')
    const extras = (it.extras as string[]).length > 0 ? ` + ${(it.extras as string[]).join(', ')}` : ''
    lineas.push({ descripcion: `${it.nombre_producto}${detalle ? ` (${detalle})` : ''}${extras}`, cantidad: it.cantidad, precioUnitarioConIgv: it.precio })
    codigos.push(it.slug ?? (it.combo_id ? 'COMBO' : it.catering_item_id ? 'CATERING' : 'ITEM'))
  }
  if (o.delivery > 0) {
    lineas.push({ descripcion: 'Servicio de delivery', cantidad: 1, precioUnitarioConIgv: o.delivery })
    codigos.push('DELIVERY')
  }
  return {
    id: o.id,
    numero: o.numero,
    estado: o.estado,
    tipoEntrega: o.tipo_entrega,
    delivery: o.delivery,
    total: o.total,
    totalPendiente: o.total_pendiente === true,
    sedeNombre: o.sede_nombre,
    cliente: { nombre: o.cliente_nombre, dni: o.cliente_dni, correo: o.cliente_correo },
    lineas,
    codigos,
  }
}

/** Reserva el siguiente correlativo y deja la fila guardada (`pendiente_envio`), todo en UNA transacción. */
async function reservarYRegistrar(
  pool: pg.Pool,
  tenantId: string,
  p: {
    pedido: PedidoParaComprobante
    tipo: TipoComprobante
    config: ConfigEmisorMifact
    fechaEmision: string
    receptor: Receptor
    desglose: DesgloseComprobante
    usuarioId: string | null
  }
): Promise<{ id: string; correlativo: number; documento: Record<string, unknown> }> {
  const serie = p.tipo === 'boleta' ? p.config.serieBoleta : p.config.serieFactura
  const client = await pool.connect()
  try {
    await client.query('begin')
    const n = await client.query(
      `insert into comprobantes_numeradores (tenant_id, emisor, entorno, serie, ultimo)
       values ($1, $2, $3, $4, $5)
       on conflict (tenant_id, emisor, entorno, serie) do update set ultimo = comprobantes_numeradores.ultimo + 1
       returning ultimo`,
      [tenantId, p.config.emisor, p.config.entorno, serie, p.config.correlativoInicial]
    )
    const correlativo: number = n.rows[0].ultimo
    const documento = construirDocumento({
      config: p.config,
      tipo: p.tipo,
      serie,
      correlativo,
      fechaEmision: p.fechaEmision,
      receptor: p.receptor,
      desglose: p.desglose,
      codigosItem: p.pedido.codigos,
      observacion: `Pedido ${p.pedido.numero}`,
      usuario: 'bakeos',
    })
    const ins = await client.query(
      `insert into comprobantes (tenant_id, order_id, emisor, entorno, tipo, serie, correlativo, fecha_emision,
                                 receptor_tipo_doc, receptor_doc, receptor_nombre, receptor_direccion, receptor_correo,
                                 gravado, igv, total, payload, intentos, creado_por)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,1,$18)
       returning id`,
      [
        tenantId, p.pedido.id, p.config.emisor, p.config.entorno, p.tipo, serie, correlativo, p.fechaEmision,
        p.receptor.tipoDoc, p.receptor.numeroDoc, p.receptor.nombre, p.receptor.direccion, p.receptor.correo,
        p.desglose.gravado, p.desglose.igv, p.desglose.total, JSON.stringify(documento), p.usuarioId,
      ]
    )
    await client.query('commit')
    return { id: ins.rows[0].id, correlativo, documento }
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/** Guarda lo que Mifact respondió a un envío (o a una consulta de un documento pendiente). */
async function guardarRespuesta(pool: pg.Pool, id: string, r: RespuestaMifact): Promise<void> {
  const e = estadoDeCodigoMifact(r.estadoDocumento)
  await pool.query(
    `update comprobantes
        set estado = $2, estado_codigo = $3, sunat_codigo = nullif($4,''), sunat_descripcion = nullif($5,''), sunat_nota = nullif($6,''),
            hash = coalesce(nullif($7,''), hash), cadena_qr = coalesce(nullif($8,''), cadena_qr),
            ultimo_error = $9, consultado_en = now(), actualizado_en = now()
      where id = $1`,
    [
      id,
      e?.estado ?? 'en_proceso',
      e?.codigo ?? null,
      r.sunatResponseCode,
      r.sunatDescription,
      r.sunatNote,
      r.hash,
      r.cadenaQr,
      // Sin estado reconocible no se inventa uno: queda «en proceso» y avisado.
      e ? null : 'Mifact no devolvió un estado reconocible: consulta el estado del comprobante',
    ]
  )
}

const marcarError = (pool: pg.Pool, id: string, mensaje: string) =>
  pool.query(`update comprobantes set estado = 'error', ultimo_error = $2, actualizado_en = now() where id = $1`, [id, mensaje.slice(0, 1000)])
const anotarError = (pool: pg.Pool, id: string, mensaje: string) =>
  pool.query(`update comprobantes set ultimo_error = $2, actualizado_en = now() where id = $1`, [id, mensaje.slice(0, 1000)])

export async function emitirComprobante(pool: pg.Pool, tenantId: string, entrada: EmitirEntrada): Promise<Comprobante> {
  const pedido = await cargarPedido(pool, tenantId, entrada.pedido)

  // 1. Qué razón social factura este pedido y si hay Mifact configurado para ella.
  const emisor = entidadDeCobro({ tipoEntrega: pedido.tipoEntrega, sedeNombre: pedido.sedeNombre })
  const config = configDe(emisor)

  // 2. Reglas del pedido.
  if (!pedidoEsFacturable(pedido.estado))
    throw new ComprobanteError('PEDIDO_NO_FACTURABLE', `Un pedido en estado «${pedido.estado}» no se factura (tiene que ser una venta firme, no un borrador, un pago pendiente ni un pedido anulado)`)
  if (pedido.totalPendiente) throw new ComprobanteError('PEDIDO_TOTAL_PENDIENTE', 'El total del pedido todavía está por cotizar: no se puede facturar')
  if (pedido.lineas.length === 0) throw new ComprobanteError('SIN_LINEAS_FACTURABLES', 'El pedido no tiene líneas con precio para facturar')
  const desglose = desglosarLineas(pedido.lineas)
  if (!totalesCoinciden(desglose.total, pedido.total))
    throw new ComprobanteError('TOTAL_NO_COINCIDE', 'La suma de las líneas no coincide con el total del pedido: corrige el pedido antes de facturar', {
      totalPedido: pedido.total,
      totalLineas: desglose.total,
    })
  const { rows: vigentes } = await pool.query(
    `select serie, correlativo, estado from comprobantes where order_id = $1 and estado in ('pendiente_envio','en_proceso','aceptado','aceptado_con_observaciones')`,
    [pedido.id]
  )
  if (vigentes[0]) throw new ComprobanteError('COMPROBANTE_YA_EMITIDO', `El pedido ya tiene el comprobante ${vigentes[0].serie}-${String(vigentes[0].correlativo).padStart(8, '0')} (${vigentes[0].estado})`)

  // 3. Receptor. Boleta: si la petición no trae documento se usa el DNI del cliente registrado, si lo tiene.
  const pedida = entrada.receptor ?? {}
  const usarCliente = entrada.tipo === 'boleta' && !pedida.numeroDoc && !!pedido.cliente.dni && validarDni(pedido.cliente.dni)
  const r = resolverReceptor(
    entrada.tipo,
    {
      ...pedida,
      ...(usarCliente ? { numeroDoc: pedido.cliente.dni, tipoDoc: '1' as const, nombre: pedida.nombre ?? pedido.cliente.nombre } : {}),
      correo: pedida.correo ?? pedido.cliente.correo,
    },
    desglose.total
  )
  if (!r.ok) throw new ComprobanteError('RECEPTOR_INVALIDO', r.detalle, { error: r.error })

  // 4. Número + fila guardada, y recién entonces Mifact. Si el número ya existe allá (alguien lo usó), se pasa al siguiente.
  const fechaEmision = fechaLimaISO(new Date())
  const cliente = crearClienteMifact(config)
  for (let intento = 0; intento < MAX_COLISIONES; intento++) {
    const reserva = await reservarYRegistrar(pool, tenantId, {
      pedido, tipo: entrada.tipo, config, fechaEmision, receptor: r.receptor, desglose, usuarioId: entrada.usuarioId ?? null,
    }).catch((err: { code?: string; constraint?: string }) => {
      if (err.code === '23505' && err.constraint === 'comprobantes_uno_vigente_por_pedido')
        throw new ComprobanteError('COMPROBANTE_YA_EMITIDO', 'El pedido ya tiene un comprobante vigente')
      throw err
    })
    try {
      const respuesta = await cliente.enviar(reserva.documento)
      await guardarRespuesta(pool, reserva.id, respuesta)
      return obtenerComprobante(pool, tenantId, reserva.id)
    } catch (err) {
      if (esNumeroYaUsado(err)) {
        await marcarError(pool, reserva.id, 'Ese número ya existía en Mifact; se usó el siguiente')
        continue
      }
      if (err instanceof MifactApiError) {
        await marcarError(pool, reserva.id, err.message)
        throw new ComprobanteError('MIFACT_RECHAZO', err.message, undefined, reserva.id)
      }
      if (err instanceof MifactRedError) {
        // Respuesta dudosa: la fila queda `pendiente_envio` con su número reservado; se consulta o se reintenta.
        await anotarError(pool, reserva.id, err.message)
        throw new ComprobanteError('MIFACT_SIN_RESPUESTA', `${err.message}. El comprobante quedó pendiente: consulta su estado o reintenta el envío`, undefined, reserva.id)
      }
      throw err
    }
  }
  throw new ComprobanteError('NUMERO_NO_DISPONIBLE', `Mifact ya tiene registrados los siguientes ${MAX_COLISIONES} números de la serie: revisa la numeración`)
}

// ———————————————————————————————————————————————————————————————— estado ————

/** Un fallo de Mifact en una consulta/acción sobre un comprobante existente, como error de negocio. */
function falloMifact(err: unknown, id: string): never {
  if (err instanceof MifactRedError) throw new ComprobanteError('MIFACT_SIN_RESPUESTA', err.message, undefined, id)
  if (err instanceof MifactApiError) throw new ComprobanteError('MIFACT_RECHAZO', err.message, undefined, id)
  throw err
}

/** Pregunta a Mifact/SUNAT cómo está el comprobante y lo guarda en el pedido. */
export async function consultarEstado(pool: pg.Pool, tenantId: string, id: string): Promise<Comprobante> {
  const { fila, cliente, documento } = await contextoDe(pool, tenantId, id)
  try {
    const r = await cliente.estado(documento)
    const e = estadoDeCodigoMifact(r.estadoDocumento)
    if (e) await guardarRespuesta(pool, id, r)
    else await pool.query(`update comprobantes set consultado_en = now(), actualizado_en = now() where id = $1`, [id])
  } catch (err) {
    if (esDocumentoInexistente(err)) {
      await anotarError(
        pool,
        id,
        fila.estado === 'pendiente_envio'
          ? 'Mifact no tiene este comprobante: el envío no llegó a registrarse. Se puede reintentar el envío'
          : 'Mifact ya no encuentra este comprobante'
      )
      await pool.query(`update comprobantes set consultado_en = now() where id = $1`, [id])
    } else falloMifact(err, id)
  }
  return obtenerComprobante(pool, tenantId, id)
}

/**
 * Reintenta un envío que quedó sin respuesta (`pendiente_envio`): primero consulta (si Mifact ya lo tiene, lo adopta
 * sin volver a mandar nada) y solo si no existe vuelve a mandar EXACTAMENTE lo mismo, con el mismo número.
 */
export async function reintentarEnvio(pool: pg.Pool, tenantId: string, id: string): Promise<Comprobante> {
  const inicial = await obtenerComprobante(pool, tenantId, id)
  if (inicial.estado !== 'pendiente_envio') throw new ComprobanteError('ESTADO_NO_PERMITE', `Solo se reintenta un comprobante pendiente de envío (este está «${inicial.estadoLegible}»)`)
  const consultado = await consultarEstado(pool, tenantId, id)
  if (consultado.estado !== 'pendiente_envio') return consultado

  const { fila, cliente } = await contextoDe(pool, tenantId, id)
  await pool.query(`update comprobantes set intentos = intentos + 1, actualizado_en = now() where id = $1`, [id])
  try {
    const respuesta = await cliente.enviar(fila.payload)
    await guardarRespuesta(pool, id, respuesta)
  } catch (err) {
    if (err instanceof MifactApiError) await marcarError(pool, id, err.message)
    else if (err instanceof MifactRedError) await anotarError(pool, id, err.message)
    falloMifact(err, id)
  }
  return obtenerComprobante(pool, tenantId, id)
}

// ———————————————————————————————————————————————————————————————— PDF ————

/** El PDF del comprobante: el guardado en el pedido, o se baja de Mifact (y se guarda) si falta o se pide actualizar. */
export async function descargarPdf(
  pool: pg.Pool,
  tenantId: string,
  id: string,
  opciones: { actualizar?: boolean } = {}
): Promise<{ pdf: Buffer; url: string | null; nombreArchivo: string }> {
  const { fila, config, cliente, documento } = await contextoDe(pool, tenantId, id)
  const nombreArchivo = `${fila.serie}-${String(fila.correlativo).padStart(8, '0')}.pdf`
  if (fila.estado === 'pendiente_envio' || fila.estado === 'error')
    throw new ComprobanteError('ESTADO_NO_PERMITE', `El comprobante está «${estadoComprobanteLegible(fila.estado)}» y todavía no tiene PDF`)

  if (!opciones.actualizar && fila.tiene_pdf) {
    const { rows } = await pool.query(`select pdf, url_pdf from comprobantes where id = $1`, [id])
    return { pdf: rows[0].pdf as Buffer, url: rows[0].url_pdf, nombreArchivo }
  }
  let respuesta: RespuestaMifact
  try {
    respuesta = await cliente.descargarPdf(documento, config.formatoPdf)
  } catch (err) {
    falloMifact(err, id)
  }
  const pdf = respuesta.pdfBytes ? Buffer.from(respuesta.pdfBytes, 'base64') : null
  if (!pdf || pdf.subarray(0, 4).toString('latin1') !== '%PDF') throw new ComprobanteError('SIN_PDF', 'Mifact no devolvió un PDF válido para este comprobante', undefined, id)
  await pool.query(
    `update comprobantes set pdf = $2, url_pdf = coalesce(nullif($3,''), url_pdf), pdf_guardado_en = now(), actualizado_en = now() where id = $1`,
    [id, pdf, respuesta.url]
  )
  return { pdf, url: respuesta.url || fila.url_pdf, nombreArchivo }
}

// ————————————————————————————————————————————————————————————— anulación ————

export async function anularComprobante(
  pool: pg.Pool,
  tenantId: string,
  id: string,
  entrada: { motivo: string; usuarioId?: string | null }
): Promise<Comprobante> {
  const motivo = entrada.motivo.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (motivo.length < 3 || motivo.length > 100) throw new ComprobanteError('MOTIVO_INVALIDO', 'El motivo de la anulación debe tener entre 3 y 100 caracteres')
  const { fila, cliente, documento } = await contextoDe(pool, tenantId, id)
  if (!(ESTADOS_ANULABLES as readonly string[]).includes(fila.estado))
    throw new ComprobanteError('ESTADO_NO_PERMITE', `Un comprobante «${estadoComprobanteLegible(fila.estado)}» no se puede anular`)
  try {
    const r = await cliente.anular(documento, motivo, 'bakeos')
    const e = estadoDeCodigoMifact(r.estadoDocumento)
    await pool.query(
      `update comprobantes
          set estado = $2, estado_codigo = $3, motivo_anulacion = $4, anulacion_solicitada_en = now(), actualizado_en = now()
        where id = $1`,
      // Mifact responde 108 («anulación solicitada»); si no devuelve un estado reconocible se asume ese, que es el efecto de pedir la baja.
      [id, e?.estado ?? 'anulacion_solicitada', e?.codigo ?? 108, motivo]
    )
  } catch (err) {
    falloMifact(err, id)
  }
  return obtenerComprobante(pool, tenantId, id)
}

// ———————————————————————————————————————————————————————————————— correo ————

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function enviarCorreoComprobante(pool: pg.Pool, tenantId: string, id: string, correo: string): Promise<Comprobante> {
  const destino = correo.trim()
  if (!CORREO.test(destino) || destino.length > 100) throw new ComprobanteError('CORREO_INVALIDO', 'El correo no es válido')
  const { fila, cliente, documento } = await contextoDe(pool, tenantId, id)
  if (!(ESTADOS_ANULABLES as readonly string[]).includes(fila.estado))
    throw new ComprobanteError('ESTADO_NO_PERMITE', `Un comprobante «${estadoComprobanteLegible(fila.estado)}» no se envía por correo`)
  try {
    await cliente.enviarCorreo(documento, destino)
  } catch (err) {
    falloMifact(err, id)
  }
  await pool.query(`update comprobantes set correo_enviado_a = $2, correo_enviado_en = now(), actualizado_en = now() where id = $1`, [id, destino])
  return obtenerComprobante(pool, tenantId, id)
}

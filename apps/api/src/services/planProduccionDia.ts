import type pg from 'pg'
import {
  ESTADOS_EN_PLAN,
  armarAgendados,
  armarEmpaqueMayorista,
  armarHojaProduccion,
  armarHorasCriticas,
  armarPlanDelDia,
  minutosDelDia,
  type BloqueMayorista,
  type PedidoAgendado,
  type AreaProduccion,
  type HojaProduccion,
  type GrupoAgendado,
  type LineaCritica,
  type LineaDemanda,
  type LineaPlan,
  type LineaVitrina,
  type ModoProduccion,
  type ProducidoDia,
} from '@bakebrothers/domain'

/**
 * Junta los datos del día para el plan de producción (la suma la hace `armarPlanDelDia`, en el dominio):
 *  - por pedido: las líneas de los pedidos con entrega ese día (productos, catering y los combos de composición
 *    fija expandidos a sus productos — los combos que permiten cambios ya traen su selección como líneas de
 *    producto, no se vuelven a expandir);
 *  - para vitrina: el plan fijo de la sede (`plan_vitrina`);
 *  - lo ya marcado como producido (`produccion_dia`).
 * Con `sedeId` solo cuenta lo de esa sede; los pedidos todavía sin sede se avisan aparte (`sinAsignar`) porque
 * nadie los tomó. Sin `sedeId` (el admin viendo todo) suma todas las sedes.
 */
export interface PlanDelDia {
  fecha: string
  sedeId: string | null
  lineas: LineaPlan[]
  hoja: HojaProduccion
  /** «Pedidos con hora crítica: producir primero» (prioridad ALTA; sin mayoristas, que salen por su hoja de empaque). */
  criticos: LineaCritica[]
  /** Pedidos de ese día esperando pago: todavía no se producen. */
  pagoPendiente: number
  /** Pedidos de ese día sin sede (delivery que nadie tomó): no están en el plan de una sede concreta. */
  sinAsignar: number
  /** Combos que permiten cambios, vendidos sin detalle de qué eligió el cliente: no se pueden expandir. */
  combosSinDetalle: number
}

interface FilaDemanda {
  pedido: string
  hora: string | null
  canal: string | null
  cliente: string | null
  product_id: string | null
  nombre_producto: string
  tamano: string | null
  cantidad: number
  catering_item_id: string | null
  sabor: string | null
  combo_id: string | null
  area: AreaProduccion | null
  modo: ModoProduccion | null
  es_empanada: boolean | null
  catering_area: AreaProduccion | null
  catering_nombre: string | null
}

export async function cargarPlanDelDia(
  client: pg.PoolClient,
  tenantId: string,
  fechaISO: string,
  sedeId: string | null
): Promise<PlanDelDia> {
  const filtroSede = sedeId ? 'and o.sede_id = $4' : ''
  const params: unknown[] = [tenantId, fechaISO, ESTADOS_EN_PLAN]
  if (sedeId) params.push(sedeId)

  const { rows } = await client.query<FilaDemanda>(
    `select o.numero as pedido, o.horario_entrega as hora, o.canal, cu.nombre as cliente,
            oi.product_id, oi.nombre_producto, oi.tamano, oi.cantidad, oi.catering_item_id, oi.sabor, oi.combo_id,
            p.area_produccion as area, p.modo_produccion as modo, (c.nombre = 'Empanadas') as es_empanada,
            ci.area_produccion as catering_area, ci.nombre as catering_nombre
     from orders o
     join customers cu on cu.id = o.customer_id
     join order_items oi on oi.order_id = o.id
     left join products p on p.id = oi.product_id
     left join categories c on c.id = p.category_id
     left join catering_items ci on ci.id = oi.catering_item_id
     where o.tenant_id = $1 and o.fecha_entrega = $2 and o.estado = any($3) ${filtroSede}`,
    params
  )

  const demanda: LineaDemanda[] = []
  const combos: { fila: FilaDemanda }[] = []
  for (const r of rows) {
    if (r.catering_item_id) {
      demanda.push({
        origen: 'catering',
        cateringItemId: r.catering_item_id,
        nombre: r.catering_nombre ?? r.nombre_producto,
        tamano: null,
        sabor: r.sabor,
        cantidad: r.cantidad,
        hora: r.hora,
        canal: r.canal,
        pedido: r.pedido,
        cliente: r.cliente,
        area: r.catering_area,
      })
    } else if (r.product_id) {
      demanda.push({
        origen: 'producto',
        productId: r.product_id,
        nombre: r.nombre_producto,
        tamano: r.tamano,
        cantidad: r.cantidad,
        hora: r.hora,
        canal: r.canal,
        pedido: r.pedido,
        cliente: r.cliente,
        area: r.area,
        modo: r.modo,
        esEmpanada: r.es_empanada ?? false,
      })
    } else if (r.combo_id) {
      combos.push({ fila: r })
    }
  }

  // Combos: los de composición fija se expanden a sus productos. Los que permiten cambios ya traen su selección
  // como líneas de producto del mismo pedido (a precio 0); sin selección no hay nada que expandir.
  let combosSinDetalle = 0
  if (combos.length > 0) {
    const ids = [...new Set(combos.map((c) => c.fila.combo_id!))]
    const { rows: comps } = await client.query(
      `select cb.id as combo_id, cb.permite_cambios, cbi.cantidad, p.id as product_id, p.nombre, p.area_produccion as area,
              p.modo_produccion as modo, (c.nombre = 'Empanadas') as es_empanada, ps.tamano
       from combos cb
       left join combo_items cbi on cbi.combo_id = cb.id
       left join products p on p.id = cbi.product_id
       left join categories c on c.id = p.category_id
       left join product_sizes ps on ps.id = cbi.product_size_id
       where cb.id = any($1::uuid[])`,
      [ids]
    )
    for (const { fila } of combos) {
      const delCombo = comps.filter((x) => x.combo_id === fila.combo_id)
      if (delCombo[0]?.permite_cambios) {
        const tieneSeleccion = rows.some((x) => x.pedido === fila.pedido && x.product_id && x.combo_id === null)
        if (!tieneSeleccion) combosSinDetalle += 1
        continue
      }
      for (const x of delCombo) {
        if (!x.product_id) continue
        demanda.push({
          origen: 'producto',
          productId: x.product_id,
          nombre: x.nombre,
          tamano: x.tamano,
          cantidad: Number(x.cantidad) * fila.cantidad,
          hora: fila.hora,
          canal: fila.canal,
          pedido: fila.pedido,
          cliente: fila.cliente,
          area: x.area,
          modo: x.modo,
          esEmpanada: x.es_empanada ?? false,
        })
      }
    }
  }

  const paramsSede = sedeId ? [sedeId] : []
  const { rows: vit } = await client.query(
    `select pv.product_id, p.nombre, ps.tamano, pv.cantidad, pv.cantidad_domingo, p.area_produccion as area, (c.nombre = 'Empanadas') as es_empanada
     from plan_vitrina pv
     join products p on p.id = pv.product_id
     left join categories c on c.id = p.category_id
     left join product_sizes ps on ps.id = pv.product_size_id
     ${sedeId ? 'where pv.sede_id = $1' : ''}`,
    paramsSede
  )
  const vitrina: LineaVitrina[] = vit.map((v) => ({
    productId: v.product_id,
    nombre: v.nombre,
    tamano: v.tamano,
    cantidad: v.cantidad,
    cantidadDomingo: v.cantidad_domingo,
    area: v.area,
    esEmpanada: v.es_empanada ?? false,
  }))

  const { rows: prod } = await client.query(
    `select pd.product_id, ps.tamano, sum(pd.cantidad_producida)::int as producida
     from produccion_dia pd
     left join product_sizes ps on ps.id = pd.product_size_id
     where pd.fecha = $1 ${sedeId ? 'and pd.sede_id = $2' : ''}
     group by pd.product_id, ps.tamano`,
    sedeId ? [fechaISO, sedeId] : [fechaISO]
  )
  const producidos: ProducidoDia[] = prod.map((p) => ({ productId: p.product_id, tamano: p.tamano, cantidadProducida: p.producida }))

  const { rows: contadores } = await client.query(
    `select count(*) filter (where o.estado = 'payment_pending')::int as pago_pendiente,
            count(*) filter (where o.sede_id is null and o.estado = any($3))::int as sin_asignar
     from orders o
     where o.tenant_id = $1 and o.fecha_entrega = $2`,
    [tenantId, fechaISO, ESTADOS_EN_PLAN]
  )

  const lineas = armarPlanDelDia(fechaISO, demanda, vitrina, producidos)
  return {
    fecha: fechaISO,
    sedeId,
    lineas,
    hoja: armarHojaProduccion(lineas),
    criticos: armarHorasCriticas(demanda),
    pagoPendiente: contadores[0]?.pago_pendiente ?? 0,
    // Con una sede concreta, los pedidos sin sede son «de nadie» todavía; viendo todas las sedes ya están incluidos.
    sinAsignar: sedeId ? (contadores[0]?.sin_asignar ?? 0) : 0,
    combosSinDetalle,
  }
}

// ——————————————————————————————————————————————— producido → stock ————

export interface MarcarProducidoInput {
  fechaISO: string
  sedeId: string
  productId: string
  /** Etiqueta del tamaño tal como sale en el plan (null = sin tamaño). */
  tamano: string | null
  cantidadProducida: number
  usuarioId: string | null
}

export type ResultadoProducido =
  | {
      ok: true
      cantidadProducida: number
      /** Parte que va a la vitrina (producido − lo que ya está comprometido por pedido). */
      aVitrina: number
      /** true si se dejó el stock de la sede disponible. */
      stockActualizado: boolean
      /** Conteo del stock después de marcar (null = sin conteo exacto). */
      cantidadStock: number | null
    }
  | { ok: false; error: string }

/**
 * Marca un producto del plan como producido. Si el producto tiene vitrina ese día, el stock de la sede queda
 * DISPONIBLE y, si esa fila lleva conteo, se le suma lo que se hizo para vitrina. El conteo exacto sigue siendo
 * opcional: sin conteo solo se marca disponible. Marcar dos veces no duplica (se suma solo la diferencia contra lo
 * que ya se llevó a stock). Todo en la misma transacción que el registro de lo producido.
 */
export async function marcarProducido(client: pg.PoolClient, tenantId: string, input: MarcarProducidoInput): Promise<ResultadoProducido> {
  if (!Number.isInteger(input.cantidadProducida) || input.cantidadProducida < 0) return { ok: false, error: 'CANTIDAD_INVALIDA' }

  let sizeId: string | null = null
  if (input.tamano) {
    const { rows } = await client.query(`select id from product_sizes where product_id = $1 and tamano = $2`, [input.productId, input.tamano])
    if (!rows[0]) return { ok: false, error: 'TAMANO_NO_ENCONTRADO' }
    sizeId = rows[0].id
  } else {
    const { rows } = await client.query(`select 1 from products where id = $1 and tenant_id = $2`, [input.productId, tenantId])
    if (!rows[0]) return { ok: false, error: 'PRODUCTO_NO_ENCONTRADO' }
  }

  // Lo que esta sede tiene comprometido por pedido y planificado para vitrina de este producto, ese día.
  const plan = await cargarPlanDelDia(client, tenantId, input.fechaISO, input.sedeId)
  const linea = plan.lineas.find((l) => l.productId === input.productId && l.tamano === input.tamano)
  if (!linea) return { ok: false, error: 'NO_ESTA_EN_EL_PLAN' }

  const aVitrina = linea.vitrina > 0 ? Math.max(0, input.cantidadProducida - linea.porPedido) : 0

  const previo = await client.query(
    `select cantidad_a_stock from produccion_dia
     where fecha = $1 and sede_id = $2 and product_id = $3 and product_size_id is not distinct from $4`,
    [input.fechaISO, input.sedeId, input.productId, sizeId]
  )
  const yaEnStock: number = previo.rows[0]?.cantidad_a_stock ?? 0

  if (previo.rows[0]) {
    await client.query(
      `update produccion_dia set cantidad_producida = $5, cantidad_a_stock = $6, producido_por = $7, producido_en = now()
       where fecha = $1 and sede_id = $2 and product_id = $3 and product_size_id is not distinct from $4`,
      [input.fechaISO, input.sedeId, input.productId, sizeId, input.cantidadProducida, aVitrina, input.usuarioId]
    )
  } else {
    await client.query(
      `insert into produccion_dia (fecha, sede_id, product_id, product_size_id, cantidad_producida, cantidad_a_stock, producido_por)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [input.fechaISO, input.sedeId, input.productId, sizeId, input.cantidadProducida, aVitrina, input.usuarioId]
    )
  }

  // Stock: solo si el producto tiene vitrina ese día y se produjo algo.
  let stockActualizado = false
  let cantidadStock: number | null = null
  if (linea.vitrina > 0 && input.cantidadProducida > 0) {
    const { rows: stock } = await client.query(
      `select id, cantidad from stock where sede_id = $1 and product_id = $2 and product_size_id is not distinct from $3`,
      [input.sedeId, input.productId, sizeId]
    )
    if (stock[0]) {
      const conConteo = stock[0].cantidad !== null
      const nueva = conConteo ? Math.max(0, Number(stock[0].cantidad) + (aVitrina - yaEnStock)) : null
      await client.query(`update stock set disponible = true, cantidad = $2, actualizado_en = now() where id = $1`, [stock[0].id, nueva])
      cantidadStock = nueva
    } else {
      await client.query(`insert into stock (sede_id, product_id, product_size_id, disponible, cantidad) values ($1,$2,$3,true,null)`, [
        input.sedeId,
        input.productId,
        sizeId,
      ])
    }
    stockActualizado = true
  }

  return { ok: true, cantidadProducida: input.cantidadProducida, aVitrina, stockActualizado, cantidadStock }
}

// ————————————————————————————————————————— hoja de empaque mayorista ————

/** Los bloques de la hoja de empaque: un cliente por orden de mayorista del día (en el mismo conjunto de estados del plan). */
export async function cargarEmpaqueMayorista(
  client: pg.PoolClient,
  tenantId: string,
  fechaISO: string,
  sedeId: string | null
): Promise<BloqueMayorista[]> {
  const { rows } = await client.query(
    `select o.id, o.numero, o.horario_entrega as hora, o.fuera_de_corte, cu.nombre as cliente,
            oi.nombre_producto, oi.tamano, oi.cantidad, (c.nombre = 'Empanadas') as es_empanada
     from orders o
     join customers cu on cu.id = o.customer_id
     join order_items oi on oi.order_id = o.id
     left join products p on p.id = oi.product_id
     left join categories c on c.id = p.category_id
     where o.tenant_id = $1 and o.canal = 'mayorista' and o.fecha_entrega = $2 and o.estado = any($3)
       ${sedeId ? 'and o.sede_id = $4' : ''}
     order by o.horario_entrega, cu.nombre`,
    sedeId ? [tenantId, fechaISO, ESTADOS_EN_PLAN, sedeId] : [tenantId, fechaISO, ESTADOS_EN_PLAN]
  )
  interface OrdenParaHoja {
    pedido: string
    cliente: string
    hora: string | null
    fueraDeCorte: boolean
    lineas: { nombre: string; tamano: string | null; cantidad: number; esEmpanada: boolean }[]
  }
  const porOrden = new Map<string, OrdenParaHoja>()
  for (const r of rows) {
    const o: OrdenParaHoja = porOrden.get(r.id) ?? { pedido: r.numero, cliente: r.cliente, hora: r.hora, fueraDeCorte: r.fuera_de_corte, lineas: [] }
    o.lineas.push({ nombre: r.nombre_producto, tamano: r.tamano, cantidad: r.cantidad, esEmpanada: r.es_empanada ?? false })
    porOrden.set(r.id, o)
  }
  return armarEmpaqueMayorista([...porOrden.values()], minutosDelDia)
}

// ——————————————————————————————————————— pedidos agendados (venta digital) ————

/** Estados que NO aparecen en la hoja de agendados: un borrador no existe y un pedido anulado no se produce. */
const ESTADOS_FUERA_DE_AGENDADOS = ['draft', 'cancelled']
/** Canales que NO son venta digital: mayoristas y Rappi tienen su propia hoja / plan. */
const CANALES_FUERA_DE_AGENDADOS = ['mayorista', 'rappi']

/**
 * «Pedidos agendados – venta digital»: los pedidos con entrega ese día de WhatsApp, web, Instagram/Facebook y los
 * encargos tomados en tienda — una fila por producto, agrupadas bajo el cliente. Incluye los que esperan pago (el
 * equipo de venta digital tiene que verlos para cobrarlos); la hoja los muestra como «POR PAGAR».
 */
export async function cargarAgendados(
  client: pg.PoolClient,
  tenantId: string,
  fechaISO: string,
  sedeId: string | null
): Promise<GrupoAgendado[]> {
  const { rows } = await client.query(
    `select o.id, o.numero, o.tipo_entrega, o.horario_entrega as hora, o.estado, o.metodo_pago, o.nota,
            o.direccion, o.distrito, se.nombre as sede, cu.nombre as cliente,
            oi.nombre_producto, oi.tamano, oi.sabor, oi.cantidad,
            coalesce(p.area_produccion, ci.area_produccion) as area, (c.nombre = 'Empanadas') as es_empanada
     from orders o
     join customers cu on cu.id = o.customer_id
     join order_items oi on oi.order_id = o.id
     left join sedes se on se.id = o.sede_id
     left join products p on p.id = oi.product_id
     left join categories c on c.id = p.category_id
     left join catering_items ci on ci.id = oi.catering_item_id
     where o.tenant_id = $1 and o.fecha_entrega = $2
       and o.estado <> all($3) and o.canal <> all($4)
       ${sedeId ? 'and o.sede_id = $5' : ''}
     order by o.horario_entrega, cu.nombre, o.numero, oi.id`,
    sedeId
      ? [tenantId, fechaISO, ESTADOS_FUERA_DE_AGENDADOS, CANALES_FUERA_DE_AGENDADOS, sedeId]
      : [tenantId, fechaISO, ESTADOS_FUERA_DE_AGENDADOS, CANALES_FUERA_DE_AGENDADOS]
  )
  const porPedido = new Map<string, PedidoAgendado>()
  for (const r of rows) {
    let p = porPedido.get(r.id)
    if (!p) {
      const direccion = r.tipo_entrega === 'delivery' ? [r.direccion, r.distrito].filter(Boolean).join(' - ') : (r.sede ?? '')
      p = {
        pedido: r.numero,
        cliente: r.cliente,
        tipoEntrega: r.tipo_entrega,
        hora: r.hora,
        estado: r.estado,
        metodoPago: r.metodo_pago,
        direccion,
        observacion: r.nota,
        lineas: [],
      }
      porPedido.set(r.id, p)
    }
    const detalle = [r.tamano, r.sabor].filter(Boolean).join(' · ')
    p.lineas.push({
      cantidad: r.cantidad,
      producto: detalle ? `${r.nombre_producto} (${detalle})` : r.nombre_producto,
      area: r.area,
      esEmpanada: r.es_empanada,
    })
  }
  return armarAgendados([...porPedido.values()])
}

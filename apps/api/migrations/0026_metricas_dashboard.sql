-- ============================================================================
-- 0026_metricas_dashboard — panel de métricas para el dueño/admin
--
-- 1. order_items nunca recibió grant a `authenticated` cuando 0012/0013
--    cerraron el hueco de seguridad (esas migraciones solo re-otorgaron
--    orders/stock/sedes/products/usuarios_dashboard) — hoy un usuario
--    logueado del dashboard no puede leerla (`permission denied`), hace
--    falta para "productos más vendidos". Se habilita RLS (estaba
--    deshabilitada desde 0004) con el mismo criterio que orders/
--    conversaciones: `app_api` pasa libre (ya valida todo en TypeScript,
--    RLS es para el dashboard), `authenticated` se filtra por sede vía
--    join a orders (order_items no tiene sede_id propio).
--
-- 2. Tres funciones agregadas expuestas como RPC de Supabase — evitan traer
--    filas crudas al navegador (y el techo de 1000 filas de PostgREST que
--    ya usa Atribucion.jsx) calculando SUM/COUNT/GROUP BY en la base.
--    `security invoker` (el default, explícito acá) para que hereden el
--    RLS de quien llama — nunca se duplica el filtro de sede adentro de la
--    función, lo hace Postgres solo vía las políticas de arriba.
--
--    "Ingreso" = todo estado de pedido excepto 'cancelled' — ver
--    ESTADOS_QUE_CUENTAN_COMO_INGRESO en packages/domain/src/orderStatus.ts.
--    Esta función SQL no puede importar TS, así que la lista se duplica acá
--    a propósito — mismo criterio que ya existe entre domain y el trigger
--    de conversaciones (0017). Fecha de referencia: creado_en (no
--    fecha_entrega), mismo campo que ya usa Atribucion.jsx para su rango.
--
-- 3. GRANT EXECUTE explícito a `authenticated` en las 3 funciones — 0013
--    revocó el privilegio por defecto que Postgres le daba a funciones
--    nuevas, igual que a tablas/secuencias. Sin este grant, PostgREST
--    expone la función en el schema cache pero cualquier llamada real
--    devuelve permission denied — no alcanza con que la función exista.
-- ============================================================================

grant select on order_items to authenticated;

alter table order_items enable row level security;

create policy app_api_order_items on order_items
  for all to app_api
  using (true) with check (true);

create policy order_items_select_por_sede on order_items
  for select to authenticated
  using (
    exists (
      select 1 from orders o
      join usuarios_dashboard u on u.id = auth.uid()
      where o.id = order_items.order_id
        and (u.rol = 'admin' or u.sede_id = o.sede_id)
    )
  );


-- ============================================================================
-- metricas_kpis — pedidos, ingresos, ticket promedio del rango/sede pedidos
-- ============================================================================
create or replace function metricas_kpis(p_desde date, p_hasta date, p_sede_id uuid default null)
returns table(pedidos bigint, ingresos numeric, ticket_promedio numeric)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    count(*)::bigint as pedidos,
    coalesce(sum(o.total), 0)::numeric as ingresos,
    case when count(*) = 0 then 0::numeric else round(coalesce(sum(o.total), 0) / count(*), 2) end as ticket_promedio
  from orders o
  where o.creado_en >= p_desde::timestamptz
    and o.creado_en < (p_hasta + 1)::timestamptz
    and o.estado <> 'cancelled'
    and (p_sede_id is null or o.sede_id = p_sede_id)
$$;

grant execute on function metricas_kpis(date, date, uuid) to authenticated;


-- ============================================================================
-- metricas_productos_vendidos — todas las líneas de producto/combo
-- agrupadas por identidad (id real, no el nombre-snapshot, para no separar
-- en dos filas un producto que cambió de nombre a mitad del rango). Excluye
-- líneas de catering a propósito: precio_unitario siempre es 0 (se cotiza a
-- mano, ver 0019) — no aporta nada comparable a "ingresos" y ensuciaría el
-- top por cantidad. El front deriva el top-N por cantidad y el top-N por
-- ingresos con dos sorts — no se asume que coinciden.
-- ============================================================================
create or replace function metricas_productos_vendidos(p_desde date, p_hasta date, p_sede_id uuid default null)
returns table(id uuid, nombre text, cantidad bigint, ingresos numeric)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    coalesce(p.id, c.id) as id,
    coalesce(p.nombre, c.nombre, oi.nombre_producto) as nombre,
    sum(oi.cantidad)::bigint as cantidad,
    sum(oi.precio_unitario * oi.cantidad)::numeric as ingresos
  from order_items oi
  join orders o on o.id = oi.order_id
  left join products p on p.id = oi.product_id
  left join combos c on c.id = oi.combo_id
  where o.creado_en >= p_desde::timestamptz
    and o.creado_en < (p_hasta + 1)::timestamptz
    and o.estado <> 'cancelled'
    and (p_sede_id is null or o.sede_id = p_sede_id)
    and (oi.product_id is not null or oi.combo_id is not null)
  group by coalesce(p.id, c.id), coalesce(p.nombre, c.nombre, oi.nombre_producto)
$$;

grant execute on function metricas_productos_vendidos(date, date, uuid) to authenticated;


-- ============================================================================
-- metricas_tendencia_diaria — serie completa día por día (generate_series,
-- para no saltarse días sin pedidos — un gráfico con huecos silenciosos
-- mentiría sobre si un día tuvo 0 pedidos o simplemente no se calculó).
-- ============================================================================
create or replace function metricas_tendencia_diaria(p_desde date, p_hasta date, p_sede_id uuid default null)
returns table(fecha date, pedidos bigint, ingresos numeric)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    dias.fecha::date as fecha,
    coalesce(count(o.id), 0)::bigint as pedidos,
    coalesce(sum(o.total), 0)::numeric as ingresos
  from generate_series(p_desde::timestamp, p_hasta::timestamp, interval '1 day') as dias(fecha)
  left join orders o
    on o.creado_en >= dias.fecha::timestamptz
   and o.creado_en < (dias.fecha + interval '1 day')::timestamptz
   and o.estado <> 'cancelled'
   and (p_sede_id is null or o.sede_id = p_sede_id)
  group by dias.fecha
  order by dias.fecha
$$;

grant execute on function metricas_tendencia_diaria(date, date, uuid) to authenticated;

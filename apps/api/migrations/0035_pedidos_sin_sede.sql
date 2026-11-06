-- ============================================================================
-- 0035_pedidos_sin_sede — los pedidos de delivery del bot nacen SIN sede y los ven todas las sedes
--
-- Decisión del negocio (2026-10-30): ambas sedes despachan delivery. Un delivery del bot no tiene "local
-- de recojo", así que nace con orders.sede_id = null; hasta ahora (RLS 0011) un operador solo veía los
-- pedidos de SU sede, o sea que un pedido sin sede era invisible para él (solo el administrador lo veía).
-- Esta migración abre ÚNICAMENTE ese caso:
--
--   1. orders:      cualquier persona del personal VE un pedido sin sede.
--   2. orders:      y puede TOMARLO ("Me lo quedo"): un UPDATE que pasa sede_id de null a SU propia sede.
--                   Solo eso: no puede cambiarle el estado (ni nada más) sin tomarlo primero, no puede
--                   asignárselo a otra sede, y no puede quitarle la sede a uno que ya la tiene.
--                   Dos personas que lo toman a la vez: gana la primera; la segunda ya no lo encuentra
--                   sin sede (el UPDATE con `sede_id is null` no toca ninguna fila).
--   3. customers:   el cliente de un pedido sin sede es visible para todo el personal (si no, el pedido se
--                   vería sin nombre ni teléfono, que es justo lo que quien lo toma necesita).
--   4. order_items: las líneas de un pedido sin sede son visibles para todo el personal.
--
-- Los pedidos que YA tienen sede no cambian en nada: siguen siendo del administrador y de esa sede.
-- Idempotente (drop policy if exists + create).
-- ============================================================================

-- 1. orders: ver
drop policy if exists orders_select_por_sede on orders;
create policy orders_select_por_sede on orders
  for select to authenticated
  using (
    exists (
      select 1 from usuarios_dashboard u
      where u.id = (select auth.uid())
        and (u.rol = 'admin' or u.sede_id = orders.sede_id or orders.sede_id is null)
    )
  );

-- 2. orders: tomar un pedido sin sede. USING: la fila está sin sede (y quien actualiza es del personal).
--    WITH CHECK: la fila queda en SU sede (un administrador, que no tiene sede, puede asignarla a cualquiera).
drop policy if exists orders_tomar_sin_sede on orders;
create policy orders_tomar_sin_sede on orders
  for update to authenticated
  using (
    orders.sede_id is null
    and exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()))
  )
  with check (
    exists (
      select 1 from usuarios_dashboard u
      where u.id = (select auth.uid()) and (u.rol = 'admin' or u.sede_id = orders.sede_id)
    )
  );

-- 3. customers: ver al cliente de un pedido sin sede
drop policy if exists customers_select_por_sede on customers;
create policy customers_select_por_sede on customers
  for select to authenticated
  using (
    exists (
      select 1 from usuarios_dashboard u
      where u.id = (select auth.uid()) and (
        u.rol = 'admin'
        or exists (
          select 1 from orders o
          where o.customer_id = customers.id and (o.sede_id = u.sede_id or o.sede_id is null)
        )
      )
    )
  );

-- 4. order_items: ver las líneas de un pedido sin sede
drop policy if exists order_items_select_por_sede on order_items;
create policy order_items_select_por_sede on order_items
  for select to authenticated
  using (
    exists (
      select 1 from orders o
      join usuarios_dashboard u on u.id = (select auth.uid())
      where o.id = order_items.order_id
        and (u.rol = 'admin' or u.sede_id = o.sede_id or o.sede_id is null)
    )
  );

-- 5. Métricas: los pedidos sin sede NO se suman a ninguna sede. Las 3 funciones de 0026/0027 ya filtran por
--    `o.sede_id = p_sede_id` cuando se pide una sede (así que un pedido sin sede no entra en ninguna), y sin
--    filtro suman todo (el total del negocio). Esta función da el aparte "Sin asignar" que el panel muestra
--    mientras nadie tome el pedido. Misma definición de ingreso (todo menos cancelled) y misma frontera de día
--    en Lima que 0027. `security invoker`: hereda la RLS de quien llama.
create or replace function metricas_sin_asignar(p_desde date, p_hasta date)
returns table(pedidos bigint, ingresos numeric)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    count(*)::bigint as pedidos,
    coalesce(sum(o.total), 0)::numeric as ingresos
  from orders o
  where o.creado_en >= (p_desde::timestamp at time zone 'America/Lima')
    and o.creado_en < ((p_hasta + 1)::timestamp at time zone 'America/Lima')
    and o.estado <> 'cancelled'
    and o.sede_id is null
$$;

revoke all on function metricas_sin_asignar(date, date) from public;
grant execute on function metricas_sin_asignar(date, date) to authenticated;

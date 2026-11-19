-- ============================================================================
-- 0054_perfiles_del_equipo
--
-- Perfiles de la gente del equipo en Bake OS (lista del cliente, 2026-11-19). Una cuenta tiene uno o varios perfiles
-- y su acceso es la unión de ellos:
--   administracion    todo
--   caja              Pedidos (del día) y Stock, de su local
--   venta_digital     Conversaciones, Pedidos, Nuevo pedido y Clientes reducido — SIN filtro de local
--   ordenes           Órdenes (registrar e imprimir la hoja del día) — SIN filtro de local
--   produccion        Producción y sus hojas, de su local
--   empleado_temporal TRANSITORIO: el acceso de «empleado» que ya tenían adminalameda y adminsantamaria (rol
--                     'operador'); se retira con esas cuentas cuando las nuevas estén probadas.
--
-- `usuarios_dashboard.rol` NO se quita: queda DERIVADO ('admin' si y solo si tiene el perfil administracion). Así las
-- políticas de admin y el código que ya lee `rol` siguen valiendo, y una API desplegada antes de esta migración
-- sigue funcionando.
--
-- Qué se cierra en los datos (no solo en el menú):
--   - conversaciones (y respuestas rápidas): solo administracion y venta_digital (y el transitorio, en su local)
--   - stock: caja (su local) y administracion
--   - plan de vitrina / producción del día: produccion (su local) y administracion
--   - pedidos y sus líneas: venta_digital y ordenes de TODOS los locales (incluido el delivery sin local); caja y
--     produccion de su local y de los que aún no tienen local
--   - clientes: lo mismo que los pedidos, y el perfil ordenes además lee a TODOS los mayoristas (antes un empleado no
--     veía a los 83 mayoristas importados porque no tienen pedidos todavía)
--   - avisos de la campana: cada tipo llega a quien corresponde (ver usuario_recibe_aviso)
-- Reglas de local: «sin filtro» = ve todos los locales y los pedidos/conversaciones sin local. Los perfiles de local
-- ven su local y lo que aún no tiene local (igual que antes: es lo que después «toman»).
-- ============================================================================

-- ——— 1. columnas ———
alter table usuarios_dashboard
  add column if not exists perfiles text[] not null default '{}',
  add column if not exists avisa_ordenes boolean not null default false,
  add column if not exists avisa_pagos boolean not null default false;

comment on column usuarios_dashboard.perfiles is
  'Perfiles de la cuenta (administracion, caja, venta_digital, ordenes, produccion, empleado_temporal). El acceso es la unión. rol se deriva de aquí.';
comment on column usuarios_dashboard.avisa_ordenes is
  'Recibe el aviso de «orden nueva» (órdenes registradas por el equipo y pedidos del bot para hoy), campana y push.';
comment on column usuarios_dashboard.avisa_pagos is
  'Recibe el aviso de «pago reportado» (el bot leyó una captura de pago y una persona tiene que confirmarla).';

-- Cuentas que ya existen: el admin pasa a administracion; los empleados conservan su acceso de hoy (empleado_temporal)
-- y siguen recibiendo los avisos de pedido nuevo que ya recibían.
update usuarios_dashboard set perfiles = array['administracion'] where rol = 'admin' and cardinality(perfiles) = 0;
update usuarios_dashboard set perfiles = array['empleado_temporal'], avisa_ordenes = true where rol = 'operador' and cardinality(perfiles) = 0;

-- ——— 2. el rol se deriva de los perfiles (y los perfiles de un rol viejo) ———
create or replace function usuarios_dashboard_normaliza_perfiles()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Código que todavía escribe solo `rol` (o un UPDATE de rol sin tocar los perfiles): se deriva el perfil.
  if new.perfiles is null or cardinality(new.perfiles) = 0
     or (tg_op = 'UPDATE' and new.rol is distinct from old.rol and new.perfiles is not distinct from old.perfiles) then
    new.perfiles := case when new.rol = 'admin' then array['administracion'] else array['empleado_temporal'] end;
  else
    new.perfiles := (select array_agg(distinct p order by p) from unnest(new.perfiles) as p);
    new.rol := case when 'administracion' = any (new.perfiles) then 'admin' else 'operador' end;
  end if;
  return new;
end
$$;

drop trigger if exists usuarios_dashboard_perfiles on usuarios_dashboard;
create trigger usuarios_dashboard_perfiles
  before insert or update on usuarios_dashboard
  for each row execute function usuarios_dashboard_normaliza_perfiles();

alter table usuarios_dashboard drop constraint if exists usuarios_dashboard_perfiles_validos;
alter table usuarios_dashboard add constraint usuarios_dashboard_perfiles_validos
  check (
    cardinality(perfiles) > 0
    and perfiles <@ array['administracion', 'caja', 'venta_digital', 'ordenes', 'produccion', 'empleado_temporal']::text[]
    and ((rol = 'admin') = ('administracion' = any (perfiles)))
  );

-- ——— 3. funciones de acceso (una sola definición para todas las políticas) ———
-- SECURITY DEFINER para leer usuarios_dashboard sin pasar por su propia RLS (evita recursión y es más barato).

-- ¿La cuenta tiene alguno de estos perfiles? (administracion cuenta siempre)
create or replace function tiene_perfil_panel(p_perfiles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from usuarios_dashboard u
    where u.id = (select auth.uid())
      and (u.rol = 'admin' or u.perfiles && p_perfiles)
  )
$$;

-- ¿Puede la cuenta trabajar con una fila de ESTE local?
--   p_globales: perfiles que ven todos los locales (y lo que no tiene local)
--   p_locales:  perfiles que solo ven su local (y, si p_incluye_sin_sede, lo que aún no tiene local)
create or replace function acceso_a_sede(p_sede uuid, p_globales text[], p_locales text[], p_incluye_sin_sede boolean default true)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from usuarios_dashboard u
    where u.id = (select auth.uid())
      and (
        u.rol = 'admin'
        or u.perfiles && p_globales
        or (
          u.perfiles && p_locales
          and ((p_sede is null and p_incluye_sin_sede) or (p_sede is not null and u.sede_id = p_sede))
        )
      )
  )
$$;

-- ¿Debe esta cuenta enterarse de un aviso (campana y push)? Una sola regla para las dos cosas.
--   mensaje_nuevo / esperando_persona : administración y venta digital (todos los locales); el transitorio, su local
--   pedido_nuevo / orden_nueva        : solo quien tiene avisa_ordenes, del local del aviso o sin local (venta
--                                       digital, órdenes y administración, de cualquier local)
--   pago_reportado                    : solo quien tiene avisa_pagos (y puede ver pedidos)
create or replace function usuario_recibe_aviso(p_usuario uuid, p_tipo text, p_sede uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from usuarios_dashboard u
    where u.id = p_usuario
      and case p_tipo
        when 'mensaje_nuevo' then
          u.rol = 'admin' or u.perfiles && array['venta_digital']
          or (u.perfiles && array['empleado_temporal'] and (p_sede is null or u.sede_id = p_sede))
        when 'esperando_persona' then
          u.rol = 'admin' or u.perfiles && array['venta_digital']
          or (u.perfiles && array['empleado_temporal'] and (p_sede is null or u.sede_id = p_sede))
        when 'pedido_nuevo' then
          u.avisa_ordenes and (u.rol = 'admin' or u.perfiles && array['venta_digital', 'ordenes'] or p_sede is null or u.sede_id = p_sede)
        when 'orden_nueva' then
          u.avisa_ordenes and (u.rol = 'admin' or u.perfiles && array['venta_digital', 'ordenes'] or p_sede is null or u.sede_id = p_sede)
        when 'pago_reportado' then
          u.avisa_pagos and (u.rol = 'admin' or u.perfiles && array['caja', 'venta_digital', 'empleado_temporal'])
        else false
      end
  )
$$;

revoke all on function tiene_perfil_panel(text[]) from public;
revoke all on function acceso_a_sede(uuid, text[], text[], boolean) from public;
revoke all on function usuario_recibe_aviso(uuid, text, uuid) from public;
grant execute on function tiene_perfil_panel(text[]) to authenticated, app_api;
grant execute on function acceso_a_sede(uuid, text[], text[], boolean) to authenticated, app_api;
-- usuario_recibe_aviso recibe el id del usuario como parámetro: la usa la API para elegir destinatarios del push.
-- A un usuario del panel no se le da (podría preguntar por otra cuenta); su campana usa el envoltorio de abajo.
grant execute on function usuario_recibe_aviso(uuid, text, uuid) to app_api;

-- Lo mismo, pero SOLO para la cuenta de la sesión (lo usa la política de la campana).
create or replace function puedo_ver_aviso(p_tipo text, p_sede uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select usuario_recibe_aviso((select auth.uid()), p_tipo, p_sede)
$$;
revoke all on function puedo_ver_aviso(text, uuid) from public;
grant execute on function puedo_ver_aviso(text, uuid) to authenticated, app_api;

-- ——— 4. avisos: tipos nuevos y quién los ve ———
alter table avisos drop constraint if exists avisos_tipo_check;
alter table avisos add constraint avisos_tipo_check
  check (tipo in ('mensaje_nuevo', 'esperando_persona', 'pedido_nuevo', 'orden_nueva', 'pago_reportado'));

-- La política consulta por la cuenta de la sesión, nunca por un id que mande el cliente.
drop policy if exists avisos_select_por_sede on avisos;
create policy avisos_select_por_sede on avisos
  for select to authenticated
  using (puedo_ver_aviso(avisos.tipo, avisos.sede_id));

-- ——— 5. pedidos ———
drop policy if exists orders_select_por_sede on orders;
create policy orders_select_por_sede on orders
  for select to authenticated
  using (acceso_a_sede(orders.sede_id, array['venta_digital', 'ordenes'], array['caja', 'produccion', 'empleado_temporal'], true));

-- Cambiar estado / pago: venta digital (todos los locales y sin local) y, en su local, caja, producción y el transitorio.
-- Un perfil de local NO toca un pedido sin local si no lo toma antes (orders_tomar_sin_sede, 0035).
drop policy if exists orders_update_por_sede on orders;
create policy orders_update_por_sede on orders
  for update to authenticated
  using (acceso_a_sede(orders.sede_id, array['venta_digital'], array['caja', 'produccion', 'empleado_temporal'], false))
  with check (acceso_a_sede(orders.sede_id, array['venta_digital'], array['caja', 'produccion', 'empleado_temporal'], false));

drop policy if exists order_items_select_por_sede on order_items;
create policy order_items_select_por_sede on order_items
  for select to authenticated
  using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and acceso_a_sede(o.sede_id, array['venta_digital', 'ordenes'], array['caja', 'produccion', 'empleado_temporal'], true)
    )
  );

-- ——— 6. clientes ———
-- Un cliente se ve si tiene un pedido que la cuenta puede ver. El perfil «ordenes» (y administración) además ve a
-- todos los mayoristas, tengan o no pedidos. Los contactos importados de la agenda (sin pedidos) siguen siendo solo
-- de administración.
drop policy if exists customers_select_por_sede on customers;
create policy customers_select_por_sede on customers
  for select to authenticated
  using (
    tiene_perfil_panel(array[]::text[])
    or (customers.es_mayorista and tiene_perfil_panel(array['ordenes']))
    or exists (
      select 1 from orders o
      where o.customer_id = customers.id
        and acceso_a_sede(o.sede_id, array['venta_digital', 'ordenes'], array['caja', 'produccion', 'empleado_temporal'], true)
    )
  );

-- ——— 7. conversaciones y respuestas rápidas: venta digital (y el transitorio, en su local) ———
drop policy if exists conversaciones_select_por_sede on conversaciones;
create policy conversaciones_select_por_sede on conversaciones
  for select to authenticated
  using (acceso_a_sede(conversaciones.sede_id, array['venta_digital'], array['empleado_temporal'], true));

drop policy if exists conversaciones_update_por_sede on conversaciones;
create policy conversaciones_update_por_sede on conversaciones
  for update to authenticated
  using (acceso_a_sede(conversaciones.sede_id, array['venta_digital'], array['empleado_temporal'], true))
  with check (acceso_a_sede(conversaciones.sede_id, array['venta_digital'], array['empleado_temporal'], true));

drop policy if exists personal_lee_respuestas_rapidas on respuestas_rapidas;
create policy personal_lee_respuestas_rapidas on respuestas_rapidas
  for select to authenticated
  using (tiene_perfil_panel(array['venta_digital', 'empleado_temporal']));

-- ——— 8. stock: caja (su local) ———
drop policy if exists stock_select_por_sede on stock;
create policy stock_select_por_sede on stock
  for select to authenticated
  using (acceso_a_sede(stock.sede_id, array[]::text[], array['caja', 'empleado_temporal'], false));

drop policy if exists stock_insert_por_sede on stock;
create policy stock_insert_por_sede on stock
  for insert to authenticated
  with check (acceso_a_sede(stock.sede_id, array[]::text[], array['caja', 'empleado_temporal'], false));

drop policy if exists stock_update_por_sede on stock;
create policy stock_update_por_sede on stock
  for update to authenticated
  using (acceso_a_sede(stock.sede_id, array[]::text[], array['caja', 'empleado_temporal'], false))
  with check (acceso_a_sede(stock.sede_id, array[]::text[], array['caja', 'empleado_temporal'], false));

-- ——— 9. producción del día y plan de vitrina (lectura): producción, en su local ———
drop policy if exists produccion_dia_select_por_sede on produccion_dia;
create policy produccion_dia_select_por_sede on produccion_dia
  for select to authenticated
  using (acceso_a_sede(produccion_dia.sede_id, array[]::text[], array['produccion', 'empleado_temporal'], false));

drop policy if exists plan_vitrina_select_por_sede on plan_vitrina;
create policy plan_vitrina_select_por_sede on plan_vitrina
  for select to authenticated
  using (acceso_a_sede(plan_vitrina.sede_id, array[]::text[], array['produccion', 'empleado_temporal'], false));

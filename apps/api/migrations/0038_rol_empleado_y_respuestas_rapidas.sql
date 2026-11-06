-- ============================================================================
-- 0038_rol_empleado_y_respuestas_rapidas
--
-- 1. Rol «empleado» (temporal, hasta tener la lista del equipo). En la base sigue siendo rol = 'operador'
--    (no se cambia el CHECK ni las 3 cuentas que ya existen); en pantalla se llama Empleado. Un empleado ve solo
--    Pedidos (con Nuevo pedido), Órdenes, Conversaciones y Stock, de su sede (packages/domain/permisosPanel.ts).
--    El resto del panel es de dirección y se bloquea TAMBIÉN en los datos, no solo en el menú:
--      a) las 4 funciones de métricas (RPC de Supabase) ahora exigen rol admin: un empleado que las llame
--         directo con su JWT recibe «permission denied» (42501);
--      b) mifact_codigos (los códigos de Mifact) solo se lee por admin.
--    Lo que NO se puede cerrar a nivel de datos sin romper el trabajo del empleado: sus propios pedidos y los
--    clientes de esos pedidos (los necesita Pedidos y Conversaciones). Esos ya están filtrados por sede (RLS).
--
-- 2. respuestas_rapidas: frases de la bandeja de Conversaciones que edita el admin y usa todo el equipo.
-- ============================================================================

-- 1a. Métricas: solo admin. Misma lógica y misma frontera de día en Lima que 0027/0035; lo nuevo es el chequeo.
create or replace function metricas_kpis(p_desde date, p_hasta date, p_sede_id uuid default null)
returns table(pedidos bigint, ingresos numeric, ticket_promedio numeric)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin') then
    raise exception 'Las métricas son solo para dirección' using errcode = '42501';
  end if;
  return query
  select
    count(*)::bigint,
    coalesce(sum(o.total), 0)::numeric,
    case when count(*) = 0 then 0::numeric else round(coalesce(sum(o.total), 0) / count(*), 2) end
  from orders o
  where o.creado_en >= (p_desde::timestamp at time zone 'America/Lima')
    and o.creado_en < ((p_hasta + 1)::timestamp at time zone 'America/Lima')
    and o.estado <> 'cancelled'
    and (p_sede_id is null or o.sede_id = p_sede_id);
end
$$;

create or replace function metricas_productos_vendidos(p_desde date, p_hasta date, p_sede_id uuid default null)
returns table(id uuid, nombre text, cantidad bigint, ingresos numeric)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin') then
    raise exception 'Las métricas son solo para dirección' using errcode = '42501';
  end if;
  return query
  select
    coalesce(p.id, c.id),
    coalesce(p.nombre, c.nombre, oi.nombre_producto),
    sum(oi.cantidad)::bigint,
    sum(oi.precio_unitario * oi.cantidad)::numeric
  from order_items oi
  join orders o on o.id = oi.order_id
  left join products p on p.id = oi.product_id
  left join combos c on c.id = oi.combo_id
  where o.creado_en >= (p_desde::timestamp at time zone 'America/Lima')
    and o.creado_en < ((p_hasta + 1)::timestamp at time zone 'America/Lima')
    and o.estado <> 'cancelled'
    and (p_sede_id is null or o.sede_id = p_sede_id)
    and (oi.product_id is not null or oi.combo_id is not null)
  group by coalesce(p.id, c.id), coalesce(p.nombre, c.nombre, oi.nombre_producto);
end
$$;

create or replace function metricas_tendencia_diaria(p_desde date, p_hasta date, p_sede_id uuid default null)
returns table(fecha date, pedidos bigint, ingresos numeric)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin') then
    raise exception 'Las métricas son solo para dirección' using errcode = '42501';
  end if;
  return query
  select
    dias.fecha::date,
    coalesce(count(o.id), 0)::bigint,
    coalesce(sum(o.total), 0)::numeric
  from generate_series(p_desde::timestamp, p_hasta::timestamp, interval '1 day') as dias(fecha)
  left join orders o
    on o.creado_en >= (dias.fecha at time zone 'America/Lima')
   and o.creado_en < ((dias.fecha + interval '1 day') at time zone 'America/Lima')
   and o.estado <> 'cancelled'
   and (p_sede_id is null or o.sede_id = p_sede_id)
  group by dias.fecha
  order by dias.fecha;
end
$$;

create or replace function metricas_sin_asignar(p_desde date, p_hasta date)
returns table(pedidos bigint, ingresos numeric)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin') then
    raise exception 'Las métricas son solo para dirección' using errcode = '42501';
  end if;
  return query
  select count(*)::bigint, coalesce(sum(o.total), 0)::numeric
  from orders o
  where o.creado_en >= (p_desde::timestamp at time zone 'America/Lima')
    and o.creado_en < ((p_hasta + 1)::timestamp at time zone 'America/Lima')
    and o.estado <> 'cancelled'
    and o.sede_id is null;
end
$$;

-- «create or replace» conserva los permisos de 0026/0035, pero se repiten por si la función se recreó.
revoke all on function metricas_kpis(date, date, uuid) from public;
revoke all on function metricas_productos_vendidos(date, date, uuid) from public;
revoke all on function metricas_tendencia_diaria(date, date, uuid) from public;
revoke all on function metricas_sin_asignar(date, date) from public;
grant execute on function metricas_kpis(date, date, uuid) to authenticated;
grant execute on function metricas_productos_vendidos(date, date, uuid) to authenticated;
grant execute on function metricas_tendencia_diaria(date, date, uuid) to authenticated;
grant execute on function metricas_sin_asignar(date, date) to authenticated;

-- 1b. mifact_codigos: lectura solo para admin (antes, todo el personal).
drop policy if exists personal_lee_mifact_codigos on mifact_codigos;
create policy admin_lee_mifact_codigos on mifact_codigos
  for select to authenticated
  using (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin'));

-- 2. Respuestas rápidas de la bandeja de Conversaciones.
create table if not exists respuestas_rapidas (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null check (length(btrim(titulo)) between 1 and 40),
  texto          text not null check (length(btrim(texto)) between 1 and 1000),
  orden          int  not null default 0,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

alter table respuestas_rapidas enable row level security;
-- 0013: las tablas nuevas nacen cerradas; cada permiso se da aquí, explícito.
grant select, insert, update, delete on respuestas_rapidas to authenticated;
grant select on respuestas_rapidas to app_api;

drop policy if exists personal_lee_respuestas_rapidas on respuestas_rapidas;
create policy personal_lee_respuestas_rapidas on respuestas_rapidas
  for select to authenticated
  using (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid())));

drop policy if exists admin_escribe_respuestas_rapidas on respuestas_rapidas;
create policy admin_escribe_respuestas_rapidas on respuestas_rapidas
  for all to authenticated
  using (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin'))
  with check (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin'));

-- Frases iniciales (sin datos del negocio que puedan cambiar: direcciones y horarios los da el bot desde `sedes`).
-- El admin las edita desde Conversaciones.
insert into respuestas_rapidas (titulo, texto, orden)
select v.titulo, v.texto, v.orden
from (values
  ('Saludo', 'Hola, gracias por escribir a Bake Brothers. ¿En qué te podemos ayudar?', 1),
  ('Un momento', 'Dame un momento, por favor, que reviso eso y te confirmo.', 2),
  ('Datos de pago', 'Para confirmar tu pedido necesitamos el pago por adelantado. Te paso los datos y, cuando hagas el pago, envíanos la captura por aquí.', 3),
  ('Pago recibido', 'Recibimos tu pago, gracias. Tu pedido ya está confirmado.', 4),
  ('Gracias', 'Gracias por tu compra. ¡Que lo disfrutes!', 5)
) as v(titulo, texto, orden)
where not exists (select 1 from respuestas_rapidas);

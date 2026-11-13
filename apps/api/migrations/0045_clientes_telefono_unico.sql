-- ============================================================================
-- 0045_clientes_telefono_unico — Etapa 4 (clientes)
--
-- 1) El teléfono del cliente se guarda SIEMPRE en E.164 («+51912944096») y es único por negocio: antes se
--    guardaba tal como lo escribía quien tomaba el pedido («912944096», «51 912 944 096»…) y findOrCreateCustomer
--    comparaba el texto exacto, así que la misma persona podía quedar duplicada.
-- 2) El teléfono es opcional: los mayoristas que vienen de la hoja DATOS de la plantilla no tienen teléfono todavía.
-- 3) customers.nombre_confirmado: un cliente creado automáticamente al escribir por WhatsApp lleva el nombre del
--    perfil de WhatsApp (o su número) hasta que un pedido le dé su nombre real.
-- 4) conversaciones.customer_id: la conversación queda enlazada al cliente (se busca por teléfono; si no existe se crea).
-- 5) Una persona del panel ve al cliente de una conversación que ella misma puede ver (aunque aún no tenga pedidos).
--
-- 6) customers.es_interno: «clientes» que son los propios locales (envíos a TIENDA CEDROS / TIENDA S. MARINA, que
--    la hoja de mayoristas trae como filas más). Son producción real (aparecen en Pedidos, Producción y alertas),
--    pero NO son ventas ni clientes: se excluyen de Métricas, Resumen, Origen de clientes y de los segmentos de Clientes.
--
-- Al aplicarla en el Supabase real: customers y conversaciones estaban vacías (0 filas), así que no hay datos que
-- normalizar; el UPDATE de abajo solo protege otras bases (por ejemplo, copias locales de prueba).
-- ============================================================================

alter table customers alter column telefono drop not null;
alter table customers add column nombre_confirmado boolean not null default true;

-- Normaliza lo que ya exista a E.164 (solo lo reconocible: celular peruano de 9 dígitos, con o sin 51).
update customers c
   set telefono = n.e164
  from (
    select id,
           case
             when d ~ '^9[0-9]{8}$'       then '+51' || d
             when d ~ '^519[0-9]{8}$'     then '+' || d
             when d ~ '^0[1-8][0-9]{7}$'  then '+51' || substr(d, 2)
           end as e164
      from (select id, regexp_replace(telefono, '\D', '', 'g') as d from customers where telefono is not null) x
  ) n
 where c.id = n.id and n.e164 is not null and c.telefono is distinct from n.e164;

-- NOT VALID: se exige para lo que se inserte o actualice de ahora en adelante; un dato viejo no reconocible no
-- bloquea la migración (habría que revisarlo a mano).
alter table customers
  add constraint customers_telefono_e164 check (telefono is null or telefono ~ '^\+[1-9][0-9]{7,14}$') not valid;

-- Sin duplicados: un teléfono, un cliente. (Si hubiera duplicados previos, esto falla a propósito: hay que unirlos.)
create unique index customers_tenant_telefono_unico on customers (tenant_id, telefono) where telefono is not null;
drop index if exists idx_customers_tenant_telefono;

alter table conversaciones add column customer_id uuid references customers(id) on delete set null;
create index idx_conversaciones_customer on conversaciones (customer_id);

-- Enlaza las conversaciones de WhatsApp que ya existan con su cliente (por teléfono exacto).
update conversaciones cv
   set customer_id = cu.id
  from customers cu
 where cv.canal = 'whatsapp' and cv.customer_id is null
   and cu.tenant_id = cv.tenant_id
   and cu.telefono = '+' || regexp_replace(cv.external_id, '\D', '', 'g');

-- Segunda política de lectura (se suma a la de pedidos: las de un mismo tipo se combinan con OR). La política de
-- conversaciones se aplica sola dentro del subselect, así que cada persona solo ve a los clientes de las
-- conversaciones que ya puede ver.
create policy customers_select_por_conversacion on customers
  for select to authenticated
  using (exists (select 1 from conversaciones c where c.customer_id = customers.id));

-- ————————————————————————————————————————————— clientes internos (envíos a un local propio) ————
alter table customers add column es_interno boolean not null default false;

-- Las 4 funciones de Métricas (solo administración) dejan fuera los pedidos de clientes internos. Mismas
-- definiciones que en la 0038 (hora de Lima, no anulados, exigen admin) con una condición más.
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
    and not exists (select 1 from customers cu where cu.id = o.customer_id and cu.es_interno)
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
    and not exists (select 1 from customers cu where cu.id = o.customer_id and cu.es_interno)
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
    and not exists (select 1 from customers cu where cu.id = o.customer_id and cu.es_interno)
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
    and not exists (select 1 from customers cu where cu.id = o.customer_id and cu.es_interno)
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

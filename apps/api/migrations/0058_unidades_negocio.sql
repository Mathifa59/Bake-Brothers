-- ============================================================================
-- 0058_unidades_negocio
--
-- Bake tiene tres unidades: Bake (tiendas y venta digital, lo que ya existe), la Venta en la calle (el dueño le compra a
-- Bake a un PRECIO INTERNO y revende) y los Mayoristas (se valorizan a un precio interno y quien los atiende gana la
-- diferencia). Objetivo: que todo lo que sale de producción quede registrado y contado, aunque no se facture.
--
--   unidades_negocio       Calle y Mayoristas (Bake es la proveedora y no necesita fila). `regresa_a_stock`: lo que no se
--                          vende en la calle regresa a la tienda (Calle = true); los mayoristas se producen contra su
--                          orden y no pasan por la vitrina (= false).
--   precios_internos       Lista por unidad, producto y tamaño. NACE VACÍA: los precios no están confirmados (se cargan
--                          desde Bake OS, solo Administración). Cada cambio queda en precios_internos_historial.
--   salidas_unidad (+items) «Salida a calle»: se registra el día anterior como `planificada` (entra a la hoja de
--                          producción) y se confirma como `salio` con las cantidades reales (descuenta el stock donde hay
--                          conteo y congela el precio interno de ese momento); después se anota lo que volvió.
--   pagos_unidad           Lo que cada unidad le pagó a Bake. El saldo es lo valorizado menos los pagos: NO hay porcentajes
--                          ni cálculo de sueldos, solo valor a precio interno, pagos y saldo por día.
--   order_items.precio_interno  Las órdenes de mayoristas se valorizan al precio interno de la unidad Mayoristas: lo fija
--                          un trigger al crear cada línea (sin precio cargado queda vacío y el reporte usa el vigente).
--
-- Seguridad (0013): todo nace cerrado. NADA para anon ni authenticated: solo la API (app_api), que decide quién puede
-- (Administración y Órdenes registran salidas; precios, pagos y reportes son de Administración).
--
-- Además, Métricas deja de contar las órdenes de mayoristas como venta al público: son transferencias internas.
-- ============================================================================

create table if not exists unidades_negocio (
  id               uuid primary key default gen_random_uuid(),
  codigo           text not null unique check (codigo ~ '^[a-z][a-z0-9_]{1,30}$'),
  nombre           text not null,
  activa           boolean not null default true,
  regresa_a_stock  boolean not null default false,
  creado_en        timestamptz not null default now()
);

insert into unidades_negocio (codigo, nombre, regresa_a_stock)
values ('calle', 'Venta en la calle', true), ('mayoristas', 'Mayoristas', false)
on conflict (codigo) do nothing;

-- ——— precios internos ———
create table if not exists precios_internos (
  id               uuid primary key default gen_random_uuid(),
  unidad_id        uuid not null references unidades_negocio(id),
  product_id       uuid not null references products(id),
  product_size_id  uuid references product_sizes(id),
  precio           numeric(10,2) not null check (precio >= 0),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  uuid
);
-- Igual que stock: NULL cuenta como distinto en un unique normal, así que dos índices parciales.
create unique index if not exists precios_internos_unico_con_tamano
  on precios_internos (unidad_id, product_id, product_size_id) where product_size_id is not null;
create unique index if not exists precios_internos_unico_sin_tamano
  on precios_internos (unidad_id, product_id) where product_size_id is null;

create table if not exists precios_internos_historial (
  id               bigint generated always as identity primary key,
  unidad_id        uuid not null,
  product_id       uuid not null,
  product_size_id  uuid,
  precio_antes     numeric(10,2),
  precio_despues   numeric(10,2),   -- null = se quitó el precio
  cambiado_por     uuid,
  cambiado_en      timestamptz not null default now()
);
create index if not exists idx_precios_historial on precios_internos_historial (unidad_id, product_id, cambiado_en desc);

-- Quién lo cambió: la API fija el actor con set_config('app.actor_id'); fuera de la API queda vacío.
create or replace function precios_internos_historial_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := equipo_actor();
begin
  if tg_op = 'DELETE' then
    insert into precios_internos_historial (unidad_id, product_id, product_size_id, precio_antes, precio_despues, cambiado_por)
    values (old.unidad_id, old.product_id, old.product_size_id, old.precio, null, v_actor);
    return old;
  end if;
  if tg_op = 'UPDATE' and new.precio = old.precio then
    return new;
  end if;
  insert into precios_internos_historial (unidad_id, product_id, product_size_id, precio_antes, precio_despues, cambiado_por)
  values (new.unidad_id, new.product_id, new.product_size_id, case when tg_op = 'UPDATE' then old.precio end, new.precio, v_actor);
  new.actualizado_en := now();
  new.actualizado_por := v_actor;
  return new;
end
$$;
revoke all on function precios_internos_historial_fn() from public;

drop trigger if exists precios_internos_historial_tr on precios_internos;
create trigger precios_internos_historial_tr
  before insert or update or delete on precios_internos
  for each row execute function precios_internos_historial_fn();

-- ——— salida a calle ———
create table if not exists salidas_unidad (
  id            uuid primary key default gen_random_uuid(),
  unidad_id     uuid not null references unidades_negocio(id),
  sede_id       uuid not null references sedes(id),      -- local de donde sale (el stock que se descuenta)
  fecha         date not null,                           -- el día en que sale
  estado        text not null default 'planificada' check (estado in ('planificada', 'salio', 'anulada')),
  nota          text,
  creado_por    uuid,
  creado_en     timestamptz not null default now(),
  salio_por     uuid,
  salio_en      timestamptz,
  anulado_por   uuid,
  anulado_en    timestamptz,
  constraint salidas_unidad_salio_completo check ((estado = 'salio') = (salio_en is not null)),
  constraint salidas_unidad_anulada_completa check ((estado = 'anulada') = (anulado_en is not null))
);
create index if not exists idx_salidas_unidad_fecha on salidas_unidad (fecha desc, unidad_id);
create index if not exists idx_salidas_unidad_sede on salidas_unidad (sede_id, fecha);

create table if not exists salidas_unidad_items (
  id                uuid primary key default gen_random_uuid(),
  salida_id         uuid not null references salidas_unidad(id) on delete cascade,
  product_id        uuid not null references products(id),
  product_size_id   uuid references product_sizes(id),
  nombre_producto   text not null,
  tamano            text,
  cantidad          integer not null check (cantidad > 0),   -- lo planificado (o lo pedido, si se registró directo)
  cantidad_salio    integer check (cantidad_salio >= 0),      -- lo que salió de verdad (null hasta confirmar)
  cantidad_devuelta integer check (cantidad_devuelta >= 0),   -- lo que volvió (null hasta anotarlo)
  precio_interno    numeric(10,2),                            -- congelado al confirmar; null = sin precio entonces
  constraint salidas_items_devuelta_cabe check (cantidad_devuelta is null or cantidad_salio is null or cantidad_devuelta <= cantidad_salio)
);
create index if not exists idx_salidas_items_salida on salidas_unidad_items (salida_id);

-- ——— pagos de cada unidad a Bake ———
create table if not exists pagos_unidad (
  id              uuid primary key default gen_random_uuid(),
  unidad_id       uuid not null references unidades_negocio(id),
  fecha           date not null,
  monto           numeric(10,2) not null check (monto > 0),
  nota            text,
  registrado_por  uuid,
  registrado_en   timestamptz not null default now(),
  anulado_por     uuid,
  anulado_en      timestamptz,
  constraint pagos_unidad_anulado_completo check ((anulado_por is null) = (anulado_en is null))
);
create index if not exists idx_pagos_unidad on pagos_unidad (unidad_id, fecha);

-- ——— permisos: solo la API ———
alter table unidades_negocio            enable row level security;
alter table precios_internos            enable row level security;
alter table precios_internos_historial  enable row level security;
alter table salidas_unidad              enable row level security;
alter table salidas_unidad_items        enable row level security;
alter table pagos_unidad                enable row level security;

grant select, update on unidades_negocio to app_api;
grant select, insert, update, delete on precios_internos to app_api;
grant select, insert on precios_internos_historial to app_api;
grant select, insert, update on salidas_unidad to app_api;
grant select, insert, update, delete on salidas_unidad_items to app_api;
grant select, insert, update on pagos_unidad to app_api;

create policy app_api_unidades_negocio on unidades_negocio for all to app_api using (true) with check (true);
create policy app_api_precios_internos on precios_internos for all to app_api using (true) with check (true);
create policy app_api_precios_historial on precios_internos_historial for all to app_api using (true) with check (true);
create policy app_api_salidas_unidad on salidas_unidad for all to app_api using (true) with check (true);
create policy app_api_salidas_items on salidas_unidad_items for all to app_api using (true) with check (true);
create policy app_api_pagos_unidad on pagos_unidad for all to app_api using (true) with check (true);

-- ——— valorización de las órdenes de mayoristas ———
alter table order_items add column if not exists precio_interno numeric(10,2);
comment on column order_items.precio_interno is
  'Solo órdenes de mayoristas: precio interno (unidad Mayoristas) congelado al crear la línea. Null = sin precio cargado entonces.';

create or replace function order_items_precio_interno_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.product_id is null or new.precio_interno is not null then
    return new;
  end if;
  if not exists (select 1 from orders o where o.id = new.order_id and o.canal = 'mayorista') then
    return new;
  end if;
  select pi.precio into new.precio_interno
    from precios_internos pi
    join unidades_negocio u on u.id = pi.unidad_id and u.codigo = 'mayoristas'
    left join product_sizes ps on ps.product_id = new.product_id and ps.tamano = new.tamano
   where pi.product_id = new.product_id
     and pi.product_size_id is not distinct from ps.id;
  return new;
end
$$;
revoke all on function order_items_precio_interno_fn() from public;

drop trigger if exists order_items_precio_interno on order_items;
create trigger order_items_precio_interno
  before insert on order_items
  for each row execute function order_items_precio_interno_fn();

-- ——— Métricas: las órdenes de mayoristas NO son venta al público ———
-- Mismas definiciones de la 0045 (hora de Lima, no anuladas, sin clientes internos, solo administración) con una
-- condición más: `o.canal <> 'mayorista'`. Su valor a precio interno se ve aparte, en Unidades.

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
    and o.canal <> 'mayorista'
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
    and o.canal <> 'mayorista'
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
    and o.canal <> 'mayorista'
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
    and o.canal <> 'mayorista'
    and not exists (select 1 from customers cu where cu.id = o.customer_id and cu.es_interno)
    and o.sede_id is null;
end
$$;

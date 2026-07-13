-- ============================================================================
-- 0001_init — Esquema multi-tenant de la plataforma (Fase 0)
--
-- Convenciones:
--  · Toda tabla de negocio lleva tenant_id (uuid) → tenants(id).
--  · `id` interno es uuid; `slug` es el identificador público que usa el front
--    (p.ej. 'torta-chocolate'), único por tenant.
--  · Aislamiento: RLS habilitado en toda tabla de negocio. La API se conecta
--    con el rol `app_api` (no dueño de las tablas → siempre sujeto a RLS) y
--    fija `app.tenant_id` por transacción. El dueño (postgres) bypassa RLS
--    solo para migraciones/seeds/administración — mismo modelo que usa
--    Supabase con service_role.
-- ============================================================================

create extension if not exists pgcrypto;

-- ————————————————————————————————————————————————————————————— tenants ————
create table tenants (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  nombre             text not null,
  codigo_prefijo     text not null,              -- 'BB' → números de pedido BB-2450
  telefono_whatsapp  text,
  direccion_tienda   text,
  creado_en          timestamptz not null default now()
);

-- ——————————————————————————————————————————————————————————— categories ———
create table categories (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  slug             text not null,
  nombre           text not null,
  tipo_producto    text not null,                -- agrupa products.tipo ('Tortas', …)
  emoji            text,
  foto_url         text,
  gradiente_desde  text,
  gradiente_hasta  text,
  descripcion      text,
  orden            int not null default 0,
  unique (tenant_id, slug)
);

-- ————————————————————————————————————————————————————————————— products ———
create table products (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  slug                text not null,
  category_id         uuid references categories(id),
  nombre              text not null,
  categoria_negocio   text not null check (categoria_negocio in ('dulces','salados','catering')),
  tipo                text not null,
  precio_base         numeric(10,2) not null check (precio_base > 0),
  precio_anterior     numeric(10,2),
  emoji               text,
  foto_url            text,
  gradiente_desde     text,
  gradiente_hasta     text,
  descripcion         text,
  porciones           text,
  -- Anticipación mínima POR PRODUCTO (el mock tiene 6 valores distintos; la
  -- regla "48h tortas / 24h bocaditos" queda cubierta por estos datos).
  anticipacion_horas  int not null check (anticipacion_horas >= 0),
  anticipacion_texto  text not null,             -- texto original para la UI
  corte_mismo_dia     time,                       -- "antes de las 12 pm"; no se valida en Fase 0
  conservacion        text,
  popular             boolean not null default false,
  mas_vendido         boolean not null default false,
  disponible          boolean not null default true,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),
  unique (tenant_id, slug)
);
create index idx_products_tenant_categoria  on products (tenant_id, categoria_negocio);
create index idx_products_tenant_disponible on products (tenant_id, disponible);

-- ——————————————————————————————————————————————————————— product_sizes ————
-- Un producto acepta tamaños si tiene filas aquí (reemplaza el bool `tamanos`).
create table product_sizes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  tamano      text not null check (tamano in ('Personal','Mediano','Grande')),
  factor      numeric(4,2) not null,             -- 1.00 / 1.35 / 1.70
  unique (product_id, tamano)
);
create index idx_product_sizes_tenant on product_sizes (tenant_id);

-- ————————————————————————————————————————————————————————————— extras —————
create table extras (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  slug       text not null,
  nombre     text not null,
  precio     numeric(10,2) not null default 8,
  activo     boolean not null default true,
  unique (tenant_id, slug)
);

-- ——————————————————————————————————————————————————————————— customers ————
create table customers (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  nombre     text not null,
  telefono   text not null,
  correo     text,
  dni        text,
  creado_en  timestamptz not null default now()
);
create index idx_customers_tenant_telefono on customers (tenant_id, telefono);
create index idx_customers_tenant_correo   on customers (tenant_id, correo);

-- ———————————————————————————————————————————————————————— delivery_zones ——
create table delivery_zones (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  nombre           text not null,
  activo           boolean not null default true,
  tarifa_delivery  numeric(10,2),                -- null = tarifa global del dominio (S/12)
  orden            int not null default 0,
  unique (tenant_id, nombre)
);

-- ————————————————————————————————————————————————————————————— coupons ————
create table coupons (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  codigo        text not null,                   -- siempre en mayúsculas
  tipo          text not null default 'porcentaje' check (tipo in ('porcentaje','monto_fijo')),
  valor         numeric(10,2) not null,
  activo        boolean not null default true,
  valido_desde  timestamptz,
  valido_hasta  timestamptz,
  unique (tenant_id, codigo)
);

-- ————————————————————————————————————————————————— production_capacity ————
-- Cupo de producción por día y categoría. Sin fila = sin límite configurado.
-- `bloqueado` permite cerrar un día completo desde el futuro dashboard.
create table production_capacity (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  category_id  uuid not null references categories(id) on delete cascade,
  fecha        date not null,
  cupo_maximo  int not null check (cupo_maximo >= 0),
  bloqueado    boolean not null default false,
  creado_en    timestamptz not null default now(),
  unique (tenant_id, category_id, fecha)
);
create index idx_capacity_tenant_fecha on production_capacity (tenant_id, fecha);

-- ———————————————————————————————————————————————————————— order_sequences ——
create table order_sequences (
  tenant_id      uuid primary key references tenants(id) on delete cascade,
  ultimo_numero  int not null default 2449
);

-- —————————————————————————————————————————————————————————————— orders ————
create table orders (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  numero           text not null,
  customer_id      uuid not null references customers(id),
  canal            text not null default 'web' check (canal in ('web','whatsapp')),
  estado           text not null default 'draft' check (estado in (
                     'draft','confirmed','payment_pending','paid',
                     'in_production','out_for_delivery','delivered','cancelled')),
  tipo_entrega     text not null check (tipo_entrega in ('tienda','delivery')),
  direccion        text,
  distrito         text,
  referencia       text,
  fecha_entrega    date not null,
  horario_entrega  text not null,
  nota             text,
  metodo_pago      text not null check (metodo_pago in
                     ('yape','plin','transferencia','tarjeta','contraentrega')),
  cupon_codigo     text,
  subtotal         numeric(10,2) not null,
  descuento_cupon  numeric(10,2) not null default 0,
  delivery         numeric(10,2) not null default 0,
  total            numeric(10,2) not null,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  unique (tenant_id, numero)
);
create index idx_orders_tenant_estado on orders (tenant_id, estado);
create index idx_orders_tenant_fecha  on orders (tenant_id, fecha_entrega);

-- ————————————————————————————————————————————————————————— order_items ————
create table order_items (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  order_id         uuid not null references orders(id) on delete cascade,
  product_id       uuid not null references products(id),
  nombre_producto  text not null,                -- snapshot: los pedidos viejos no cambian
  tamano           text,
  extras           text[] not null default '{}',
  precio_unitario  numeric(10,2) not null,       -- precio congelado al momento del pedido
  cantidad         int not null check (cantidad > 0)
);
create index idx_order_items_order  on order_items (order_id);
create index idx_order_items_tenant on order_items (tenant_id);

-- ============================================================================
-- RLS — aislamiento por tenant
-- ============================================================================

alter table tenants             enable row level security;
alter table categories          enable row level security;
alter table products            enable row level security;
alter table product_sizes       enable row level security;
alter table extras              enable row level security;
alter table customers           enable row level security;
alter table delivery_zones      enable row level security;
alter table coupons             enable row level security;
alter table production_capacity enable row level security;
alter table order_sequences     enable row level security;
alter table orders              enable row level security;
alter table order_items         enable row level security;

-- tenants: solo lectura (necesaria para resolver slug → id al inicio del request)
create policy tenants_read on tenants for select using (true);

-- Resto: aislamiento estricto por app.tenant_id (GUC transaccional)
create policy tenant_isolation on categories          for all using (tenant_id = current_setting('app.tenant_id', true)::uuid) with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create policy tenant_isolation on products            for all using (tenant_id = current_setting('app.tenant_id', true)::uuid) with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create policy tenant_isolation on product_sizes       for all using (tenant_id = current_setting('app.tenant_id', true)::uuid) with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create policy tenant_isolation on extras              for all using (tenant_id = current_setting('app.tenant_id', true)::uuid) with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create policy tenant_isolation on customers           for all using (tenant_id = current_setting('app.tenant_id', true)::uuid) with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create policy tenant_isolation on delivery_zones      for all using (tenant_id = current_setting('app.tenant_id', true)::uuid) with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create policy tenant_isolation on coupons             for all using (tenant_id = current_setting('app.tenant_id', true)::uuid) with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create policy tenant_isolation on production_capacity for all using (tenant_id = current_setting('app.tenant_id', true)::uuid) with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create policy tenant_isolation on order_sequences     for all using (tenant_id = current_setting('app.tenant_id', true)::uuid) with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create policy tenant_isolation on orders              for all using (tenant_id = current_setting('app.tenant_id', true)::uuid) with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create policy tenant_isolation on order_items         for all using (tenant_id = current_setting('app.tenant_id', true)::uuid) with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ============================================================================
-- Rol de conexión de la API (no dueño de tablas → siempre sujeto a RLS).
-- El password se asigna fuera de esta migración (nunca en el repo).
-- ============================================================================

do $$
begin
  if not exists (select from pg_roles where rolname = 'app_api') then
    create role app_api nologin;
  end if;
end $$;

grant usage on schema public to app_api;
grant select, insert, update on all tables in schema public to app_api;
revoke insert, update on tenants from app_api;  -- tenants: solo lectura para la API

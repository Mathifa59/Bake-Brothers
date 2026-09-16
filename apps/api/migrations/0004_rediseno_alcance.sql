-- ============================================================================
-- 0004_rediseno_alcance — Semana 1 del alcance renegociado
--
-- El proyecto deja de ser una plataforma multi-tenant vendible a cualquier
-- pastelería y pasa a ser EXCLUSIVO de Bake Brothers (3 piezas: landing,
-- bot omnicanal, dashboard/CRM). Ver CLAUDE.md y DOCUMENTO-MAESTRO.md.
--
-- Cambios de esta migración:
--   1. Se quita el aislamiento multi-tenant (RLS de tenant_isolation).
--      Se conserva `tenant_id` en cada tabla y la fila única de `tenants`
--      para no tocar cada FK/repositorio en cascada (decisión explícita:
--      "usa tu criterio sobre cuál implica menos cambios en cascada").
--   2. `sedes`: los 2+ locales físicos de Bake Brothers.
--   3. `stock`: disponibilidad/cantidad por sede y por SKU (producto + tamaño).
--   4. `orders`: canal 'facebook'/'instagram', sede_id, atribución de
--      marketing (campana, ctwa_clid), semáforo de catering.
--   5. `coupons` → `combos`: paquetes de precio fijo, no descuentos genéricos.
--   6. `reglas_catering`: insumo para el semáforo verde/amarillo/rojo (la
--      función que lo calcula se construye en Semana 3 — aquí solo el modelo).
--   7. `usuarios_dashboard`: roles por sede, con RLS futura ya redactada
--      (comentada) para activarse en Semana 3 junto con el login real.
-- ============================================================================


-- ============================================================================
-- 1. Fin del aislamiento multi-tenant
-- ============================================================================
-- Bake Brothers es el único negocio de este proyecto — no hay nada que
-- aislar. Se retiran las políticas `tenant_isolation` (y con ellas, toda
-- lógica de "aislar un negocio de otro"). `tenant_id` se conserva en cada
-- tabla: ninguna consulta ni repositorio de apps/api necesita tocarse, solo
-- dejan de estar sujetas a RLS. La tabla `tenants` se mantiene con su única
-- fila (Bake Brothers) como referencia de configuración del negocio.

drop policy if exists tenant_isolation on categories;
drop policy if exists tenant_isolation on products;
drop policy if exists tenant_isolation on product_sizes;
drop policy if exists tenant_isolation on extras;
drop policy if exists tenant_isolation on customers;
drop policy if exists tenant_isolation on delivery_zones;
drop policy if exists tenant_isolation on production_capacity;
drop policy if exists tenant_isolation on order_sequences;
drop policy if exists tenant_isolation on orders;
drop policy if exists tenant_isolation on order_items;

alter table categories          disable row level security;
alter table products            disable row level security;
alter table product_sizes       disable row level security;
alter table extras              disable row level security;
alter table customers           disable row level security;
alter table delivery_zones      disable row level security;
alter table production_capacity disable row level security;
alter table order_sequences     disable row level security;
alter table orders              disable row level security;
alter table order_items         disable row level security;

-- El GUC app.tenant_id ya no filtra nada (no queda RLS que lo lea); se deja
-- de fijarlo en apps/api/src/db.ts (withTenantTx) como parte de este cambio.


-- ============================================================================
-- 2. sedes — los locales físicos de Bake Brothers
-- ============================================================================
create table sedes (
  id                        uuid primary key default gen_random_uuid(),
  nombre                    text not null,
  -- ID que manda Meta en cada webhook entrante: identifica a qué número de
  -- WhatsApp de la sede llegó el mensaje (Semana 2).
  whatsapp_phone_number_id  text unique,
  direccion                 text,
  activo                    boolean not null default true,
  creado_en                 timestamptz not null default now()
);


-- ============================================================================
-- 3. stock — disponibilidad y cantidad por sede y por SKU
-- ============================================================================
-- SKU = producto, o producto + tamaño cuando aplica. `disponible` es la
-- fuente mínima (nunca null); `cantidad` es opcional — si es null, el
-- operador solo marca disponible/agotado sin llevar conteo exacto.
create table stock (
  id               uuid primary key default gen_random_uuid(),
  sede_id          uuid not null references sedes(id) on delete cascade,
  product_id       uuid not null references products(id) on delete cascade,
  product_size_id  uuid references product_sizes(id) on delete cascade,
  disponible       boolean not null default true,
  cantidad         int,
  actualizado_en   timestamptz not null default now()
);

-- Un producto SIN tamaño (product_size_id null) debe tener una sola fila de
-- stock por sede. `unique(sede_id, product_id, product_size_id)` NO alcanza
-- para eso: Postgres trata cada NULL como distinto y permitiría duplicados.
-- Dos índices parciales cubren ambos casos correctamente.
create unique index stock_unico_con_tamano
  on stock (sede_id, product_id, product_size_id)
  where product_size_id is not null;
create unique index stock_unico_sin_tamano
  on stock (sede_id, product_id)
  where product_size_id is null;

create index idx_stock_sede on stock (sede_id);


-- ============================================================================
-- 4. orders — canales nuevos, sede, atribución de marketing, semáforo
-- ============================================================================
-- El CHECK de `canal` se definió sin nombre explícito en 0001_init.sql, así
-- que Postgres lo nombró solo — normalmente sigue la convención
-- {tabla}_{columna}_check, pero esto NO se verificó contra ningún Postgres
-- real (sin acceso a Supabase en la sesión que escribió esta migración). En
-- vez de asumir el nombre a ciegas, este bloque lo busca en pg_constraint
-- por la columna que realmente restringe y lo borra por su nombre real,
-- sea cual sea.
do $$
declare
  nombre_constraint text;
begin
  select con.conname into nombre_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_attribute att
    on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
  where rel.relname = 'orders'
    and con.contype = 'c'          -- check constraint
    and att.attname = 'canal'
    and array_length(con.conkey, 1) = 1;  -- solo la del canal, no un check compuesto

  if nombre_constraint is not null then
    execute format('alter table orders drop constraint %I', nombre_constraint);
  else
    raise notice 'No se encontró un CHECK existente sobre orders.canal — se crea uno nuevo sin borrar nada.';
  end if;
end $$;

alter table orders add constraint orders_canal_check
  check (canal in ('web', 'whatsapp', 'facebook', 'instagram'));

alter table orders add column sede_id uuid references sedes(id);

-- Atribución de marketing (Meta Ads, Semana 4). No se usan todavía; solo
-- deben existir en el modelo para no volver a migrar cuando se activen.
alter table orders add column campana text;
alter table orders add column ctwa_clid text;

-- Semáforo de catering: separado del estado del pedido (orders.estado).
-- La función que lo calcula (a partir de reglas_catering) se construye en
-- Semana 3; aquí solo se deja el campo listo.
alter table orders add column estado_catering text
  check (estado_catering in ('verde', 'amarillo', 'rojo'));


-- ============================================================================
-- 5. coupons → combos
-- ============================================================================
-- El negocio real vende paquetes de precio fijo con reglas propias
-- (sustituciones, canal permitido), no códigos de descuento genéricos.
create table combos (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  precio_normal     numeric(10,2),
  precio_promo      numeric(10,2) not null check (precio_promo > 0),
  canal_permitido   text not null default 'ambos'
                      check (canal_permitido in ('presencial', 'whatsapp', 'ambos')),
  permite_cambios   boolean not null default false,
  -- Regla de sustitución/stock en texto libre, ej. "puede elegir entre
  -- carrot cake, chocolate o red velvet". No se modela como estructura
  -- rígida a propósito: cada combo tiene condiciones distintas.
  condicion_texto   text,
  activo            boolean not null default true,
  creado_en         timestamptz not null default now()
);

create table combo_items (
  id          uuid primary key default gen_random_uuid(),
  combo_id    uuid not null references combos(id) on delete cascade,
  product_id  uuid not null references products(id),
  cantidad    int not null default 1 check (cantidad > 0)
);
create index idx_combo_items_combo on combo_items (combo_id);

-- BAKE10 (el cupón de la Fase 0 anterior) ya no aplica: el modelo de
-- descuentos por código se retira junto con la tabla.
drop table coupons;


-- ============================================================================
-- 6. reglas_catering — insumo del semáforo verde/amarillo/rojo
-- ============================================================================
-- Solo el modelo de datos. La función que evalúa el semáforo y escribe
-- orders.estado_catering se construye en Semana 3.
create table reglas_catering (
  id                          uuid primary key default gen_random_uuid(),
  product_id                  uuid not null references products(id) on delete cascade,
  unidades_minimas            int not null default 1 check (unidades_minimas > 0),
  sale_mismo_dia              boolean not null default false,
  anticipacion_horas          int not null default 0 check (anticipacion_horas >= 0),
  requiere_auto_obligatorio   boolean not null default false,
  consultar_domingo           boolean not null default true,
  creado_en                   timestamptz not null default now(),
  unique (product_id)
);


-- ============================================================================
-- 7. usuarios_dashboard — roles por sede
-- ============================================================================
-- `id` referencia auth.users de Supabase Auth (login real llega en Semana 3).
create table usuarios_dashboard (
  id         uuid primary key references auth.users(id) on delete cascade,
  rol        text not null check (rol in ('admin', 'operador')),
  sede_id    uuid references sedes(id),  -- null si es admin (ve todas las sedes)
  creado_en  timestamptz not null default now()
);

-- TODO (Semana 3): activar junto con el login real del dashboard. Un admin
-- ve todo; un operador solo los pedidos/stock de su sede.
--
-- alter table orders enable row level security;
-- create policy orders_por_sede on orders for select using (
--   exists (
--     select 1 from usuarios_dashboard u
--     where u.id = auth.uid() and (u.rol = 'admin' or u.sede_id = orders.sede_id)
--   )
-- );
--
-- alter table stock enable row level security;
-- create policy stock_por_sede on stock for select using (
--   exists (
--     select 1 from usuarios_dashboard u
--     where u.id = auth.uid() and (u.rol = 'admin' or u.sede_id = stock.sede_id)
--   )
-- );


-- ============================================================================
-- Permisos del rol de conexión de la API sobre las tablas nuevas
-- ============================================================================
-- 0001_init.sql otorgó privilegios sobre "all tables in schema public" en el
-- momento en que corrió — no alcanza a las tablas creadas después. Sin este
-- grant, app_api no podría leer ni escribir sedes/stock/combos/reglas.
grant select, insert, update on sedes, stock, combos, combo_items, reglas_catering to app_api;

-- usuarios_dashboard: lo gestiona Supabase Auth/el propio dashboard con el
-- rol del usuario autenticado, no la API con app_api. Sin grant por ahora.

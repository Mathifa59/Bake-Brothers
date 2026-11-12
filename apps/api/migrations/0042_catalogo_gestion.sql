-- ============================================================================
-- 0042_catalogo_gestion — gestión completa del catálogo desde el panel (solo Administración)
--
-- Requiere la 0039 (products.area_produccion y modo_produccion).
--
-- Qué cambia:
--  1. Activo / oculto. NO se agrega una columna nueva: `products.disponible` pasa a significar «activo» (oculto =
--     false). Es lo que ya filtran el bot, «Nuevo pedido» y Stock; la API lo filtra ahora también en las búsquedas.
--     Los tamaños ganan `activo` propio (ocultar solo «Mini 16 cm»). Combos y catering ya tenían `activo`.
--  2. Sabores como variantes (jugos): `product_sizes.clase` = 'tamano' | 'sabor'. Un sabor es una fila más de
--     product_sizes (con su precio y su activo), así el bot, los pedidos y el stock lo tratan igual que un tamaño.
--  3. De la plantilla de operaciones: `products.familia_operativa` (PASTELERIA, EMPANADA, BEBIDAS…) y `products.sabor`
--     (código de sabor de las empanadas, para el resumen de producción). El área es la `area_produccion` de la 0039.
--  4. Orden: `product_sizes.orden`, `combos.orden`, `catering_items.orden` (products.orden ya existía).
--  5. Fotos: tabla `product_photos` (varias por producto, una principal; `products.foto_url` queda como espejo de la
--     principal, así el bot y la web no cambian), `catering_items.foto_url` (combos ya la tenía) y el bucket público
--     `catalogo` de Supabase Storage (máx. 1 MB por archivo, solo imágenes; solo Administración escribe).
--  6. Permisos: solo el administrador escribe el catálogo desde el panel (RLS). 0013: cada permiso es explícito.
--     No se da DELETE sobre products, combos ni catering_items (los pedidos los referencian: se ocultan, no se borran).
-- ============================================================================

-- ————————————————————————————————— 1–4. columnas ————
alter table products
  add column if not exists familia_operativa text,
  add column if not exists sabor text;

alter table product_sizes
  add column if not exists activo boolean not null default true,
  add column if not exists orden  int     not null default 0,
  add column if not exists clase  text    not null default 'tamano' check (clase in ('tamano', 'sabor'));

-- Orden inicial de los tamaños de cada producto: del más barato al más caro (como se muestran hoy).
update product_sizes ps set orden = x.n
  from (select id, row_number() over (partition by product_id order by precio nulls last, tamano) as n from product_sizes) x
 where x.id = ps.id and ps.orden = 0;

alter table combos         add column if not exists orden int not null default 0;
alter table catering_items add column if not exists orden int not null default 0,
                           add column if not exists foto_url text;

-- ————————————————————————————————————— 5. fotos ————
create table if not exists product_photos (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  -- URL pública completa (nunca una ruta relativa: el panel y la web viven en dominios distintos).
  url        text not null,
  -- Ruta dentro del bucket `catalogo`, para poder borrar el archivo.
  ruta       text not null,
  principal  boolean not null default false,
  orden      int not null default 0,
  creado_en  timestamptz not null default now()
);
create unique index if not exists product_photos_una_principal on product_photos (product_id) where principal;
create index if not exists idx_product_photos_producto on product_photos (product_id, orden);

-- La primera foto de un producto es la principal; products.foto_url siempre refleja la principal.
create or replace function product_photos_sincronizar() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' and not exists (select 1 from product_photos where product_id = new.product_id) then
    new.principal := true;
  end if;
  return coalesce(new, old);
end $$;

create or replace function product_photos_espejo() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  pid uuid := coalesce(new.product_id, old.product_id);
begin
  -- Si se borró la principal y quedan otras, la primera pasa a ser la principal (solo al borrar: cambiar de principal
  -- son dos UPDATE seguidos y en medio no debe promocionarse otra).
  if tg_op = 'DELETE' and not exists (select 1 from product_photos where product_id = pid and principal)
     and exists (select 1 from product_photos where product_id = pid) then
    update product_photos set principal = true
     where id = (select id from product_photos where product_id = pid order by orden, creado_en limit 1);
  end if;
  update products set foto_url = (select url from product_photos where product_id = pid and principal) where id = pid;
  return null;
end $$;

drop trigger if exists product_photos_antes on product_photos;
create trigger product_photos_antes before insert on product_photos
  for each row execute function product_photos_sincronizar();
drop trigger if exists product_photos_despues on product_photos;
create trigger product_photos_despues after insert or update of principal, url or delete on product_photos
  for each row execute function product_photos_espejo();

-- ——————————————————————————————— 6. permisos y RLS ————
alter table product_photos enable row level security;
grant select, insert, update, delete on product_photos to authenticated;
grant select on product_photos to app_api;
create policy app_api_product_photos on product_photos for select to app_api using (true);
create policy personal_lee_product_photos on product_photos
  for select to authenticated
  using (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid())));
create policy admin_escribe_product_photos on product_photos
  for all to authenticated
  using (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin'))
  with check (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin'));

-- Escritura del catálogo (solo administrador). La lectura para el personal ya existe (0032).
grant insert, update on products, combos, catering_items to authenticated;
grant insert, update, delete on product_sizes, combo_items to authenticated;

create policy admin_escribe_products on products
  for all to authenticated
  using (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin'))
  with check (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin'));
create policy admin_escribe_product_sizes on product_sizes
  for all to authenticated
  using (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin'))
  with check (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin'));
create policy admin_escribe_combos on combos
  for all to authenticated
  using (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin'))
  with check (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin'));
create policy admin_escribe_combo_items on combo_items
  for all to authenticated
  using (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin'))
  with check (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin'));
create policy admin_escribe_catering_items on catering_items
  for all to authenticated
  using (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin'))
  with check (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin'));

-- ———————————————————— bucket de fotos (solo en Supabase: en un Postgres común no existe `storage`) ————
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('catalogo', 'catalogo', true, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
    on conflict (id) do update
      set public = true, file_size_limit = 1048576, allowed_mime_types = excluded.allowed_mime_types;

    execute 'drop policy if exists catalogo_admin_escribe on storage.objects';
    execute $p$
      create policy catalogo_admin_escribe on storage.objects
        for all to authenticated
        using (bucket_id = 'catalogo'
               and exists (select 1 from public.usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin'))
        with check (bucket_id = 'catalogo'
               and exists (select 1 from public.usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin'))
    $p$;
  end if;
end $$;

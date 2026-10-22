-- ============================================================================
-- 0033_codigo_mifact — códigos de producto de Mifact (facturación) en nuestro catálogo
--
-- El importador de catálogo del dashboard (solo admin) cruza el Excel de productos
-- que exporta Mifact con nuestro catálogo POR NOMBRE y guarda los códigos de Mifact
-- de cada producto que coincide, para poder enlazar ventas y comprobantes después.
--
-- Por qué una TABLA y no una columna en products: el export real de Mifact (verificado
-- con el archivo del cliente, 347 filas) trae UNA FILA POR PRODUCTO POR ALMACÉN
-- ("CENTRAL", "santa marina", "TODOS"), cada una con su propio CODIGO — el mismo
-- "Mini Carrot cake" tiene hasta 3 códigos, y a veces precios distintos. Una unidad
-- vendible nuestra (un producto sin tamaños, o un tamaño de un producto) puede tener
-- entonces varios códigos: uno por almacén.
--
--  - Un código de Mifact es único (índice único sobre `codigo`): no puede apuntar a dos
--    cosas nuestras, ni a un producto y a un tamaño a la vez.
--  - (unidad, almacén) también es único: un almacén no puede tener dos códigos para lo
--    mismo — un cruce equivocado nunca pisa uno anterior (la ruta lo rechaza).
--  - `almacen` se guarda tal cual lo escribe Mifact, en minúsculas ('central', 'santa
--    marina', 'todos'). Qué sede nuestra es cada almacén se decide después.
--
-- Permisos (0013: nada nace abierto): `authenticated` solo SELECT y solo el personal del
-- panel (como 0032); `app_api` escribe — la ruta de admin de apps/api es lo único que
-- guarda códigos. RLS activa desde el día uno.
-- Nunca se toca un precio: esta migración no cambia ningún dato existente.
-- ============================================================================

create table mifact_codigos (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid references products(id) on delete cascade,
  product_size_id uuid references product_sizes(id) on delete cascade,
  almacen         text not null,
  codigo          text not null,
  codigo_barras   text,
  creado_en       timestamptz not null default now(),
  constraint mifact_codigos_un_solo_destino
    check ((product_id is not null)::int + (product_size_id is not null)::int = 1)
);

create unique index mifact_codigos_codigo_uniq on mifact_codigos (codigo);
create unique index mifact_codigos_producto_almacen_uniq
  on mifact_codigos (product_id, almacen) where product_id is not null;
create unique index mifact_codigos_tamano_almacen_uniq
  on mifact_codigos (product_size_id, almacen) where product_size_id is not null;

grant select on mifact_codigos to authenticated;
grant select, insert, update, delete on mifact_codigos to app_api;

alter table mifact_codigos enable row level security;

create policy app_api_mifact_codigos on mifact_codigos
  for all to app_api using (true) with check (true);

create policy personal_lee_mifact_codigos on mifact_codigos
  for select to authenticated
  using (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid())));

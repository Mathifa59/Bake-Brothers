-- ============================================================================
-- 0039_ciclo_ordenes_produccion_stock — cierra el ciclo Órdenes → Producción → Stock
--
-- Lo que se pide define lo que se produce, lo que se produce define el stock, y solo se vende lo que hay.
--
-- 1. Clasificación de cada producto: «por pedido», «para vitrina», «ambos» (se vende todos los días en tienda y
--    también por pedido, p. ej. empanadas y cajas de alfajores) o «no se produce» (bebidas), y su área
--    (pastelería, empanadería, cocina, empaque). La clasificación que se siembra aquí es una PROPUESTA hasta que
--    el cliente la confirme: son columnas normales, se corrigen con un UPDATE sin tocar código.
-- 2. Empanada MEDIANA: un tamaño oculto «Mediana» en los 10 sabores (product_sizes.visible_publico = false: ni la
--    web ni el bot lo ven). Sin precio hasta que el cliente lo confirme. «Grande» es la empanada tal cual (sin
--    tamaño); la «mini» ya existe como el ítem de catering «Mini empanadas (todos los sabores)», no se crea otro.
-- 3. Órdenes de mayoristas y de Rappi: orders.canal gana 'mayorista' y 'rappi'; el cliente mayorista guarda su
--    tamaño y hora habituales; orders guarda el número de orden de Rappi, si el total quedó pendiente de cotizar y
--    si se registró pasado el corte de las 10:30 p. m.
-- 4. Plan fijo de vitrina por sede y producto (editable solo por el admin; una cantidad distinta para el domingo).
-- 5. Registro de lo producido del día: al marcarlo, la API deja el stock de esa sede disponible (y suma el conteo
--    si se lleva). Este registro guarda cuánto ya se llevó a stock para que marcar dos veces no duplique.
--
-- Todas las tablas nuevas nacen cerradas (0013): cada permiso se da aquí, explícito.
-- ============================================================================

-- ————————————————————————————————————————————— 1. clasificación ————
alter table products
  add column modo_produccion text not null default 'por_pedido'
    check (modo_produccion in ('por_pedido', 'vitrina', 'ambos', 'no_produce')),
  add column area_produccion text
    check (area_produccion in ('pasteleria', 'empanaderia', 'cocina', 'empaque'));

-- Un tamaño puede tener otro modo que su producto (el individual de una torta es de vitrina; la torta entera, por
-- pedido). null = hereda el del producto.
alter table product_sizes
  add column modo_produccion text
    check (modo_produccion in ('por_pedido', 'vitrina', 'ambos', 'no_produce')),
  add column visible_publico boolean not null default true;

alter table catering_items
  add column area_produccion text
    check (area_produccion in ('pasteleria', 'empanaderia', 'cocina', 'empaque'));

-- Propuesta de clasificación (por categoría real del catálogo).
update products p set modo_produccion = 'no_produce', area_produccion = null
  from categories c where c.id = p.category_id and c.nombre = 'Bebidas';
update products p set modo_produccion = 'ambos', area_produccion = 'empanaderia'
  from categories c where c.id = p.category_id and c.nombre = 'Empanadas';
update products p set modo_produccion = 'vitrina', area_produccion = 'cocina'
  from categories c where c.id = p.category_id and c.nombre = 'Sándwiches';
update products p set modo_produccion = 'ambos', area_produccion = 'pasteleria'
  from categories c where c.id = p.category_id and c.nombre = 'Alfajores';
update products p set modo_produccion = 'por_pedido', area_produccion = 'pasteleria'
  from categories c where c.id = p.category_id and c.nombre in ('Tortas y Kekes', 'Postres', 'Postres en Caja', 'Cajitas Dulces');

-- Lo que se vende suelto todos los días en tienda: de vitrina.
update products set modo_produccion = 'vitrina'
  where nombre in ('Cupcakes Artesanal', 'Tartaleta de Frutas', 'Cuchareable', 'Tres Leches de Chocolate');
-- El tamaño individual de tortas y postres se hace para la vitrina; el resto de tamaños, por pedido.
update product_sizes set modo_produccion = 'vitrina' where tamano = 'Individual';

-- Catering: área de cada ítem (propuesta).
update catering_items set area_produccion = 'empanaderia' where nombre like 'Mini empanadas%';
update catering_items set area_produccion = 'pasteleria'
  where nombre like 'Dulces de stock%' or nombre like 'Dulces frágiles%';
update catering_items set area_produccion = 'cocina' where area_produccion is null;

-- ————————————————————————————— 2. empanada MEDIANA (oculta, sin precio) ————
insert into product_sizes (tenant_id, product_id, tamano, factor, precio, modo_produccion, visible_publico)
select p.tenant_id, p.id, 'Mediana', null, null, 'por_pedido', false
from products p join categories c on c.id = p.category_id
where c.nombre = 'Empanadas'
  and not exists (select 1 from product_sizes ps where ps.product_id = p.id and ps.tamano = 'Mediana');

-- ——————————————————————————————————— 3. mayoristas, Rappi y encargos ————
alter table customers
  add column es_mayorista boolean not null default false,
  add column tamano_habitual text check (tamano_habitual in ('Mediana', 'Grande')),
  add column hora_habitual text;

alter table orders drop constraint orders_canal_check;
alter table orders add constraint orders_canal_check
  check (canal in ('web', 'whatsapp', 'facebook', 'instagram', 'presencial', 'mayorista', 'rappi'));

alter table orders
  -- Número de orden de la tablet de Rappi (u otra referencia externa). Único por canal.
  add column referencia_externa text,
  -- Mayorista: las cantidades se registran y el total se cotiza después (mismo criterio que catering).
  add column total_pendiente boolean not null default false,
  -- Se registró pasado el corte de las 10:30 p. m. del día anterior: avisa, no bloquea.
  add column fuera_de_corte boolean not null default false;

create unique index orders_canal_referencia_externa
  on orders (canal, referencia_externa) where referencia_externa is not null;

-- Sabor de una línea que no es un producto con sabor propio: hoy, la mini empanada de catering ("todos los sabores").
alter table order_items add column sabor text;

-- ——————————————————————————————————————— 4. plan fijo de vitrina ————
create table plan_vitrina (
  id               uuid primary key default gen_random_uuid(),
  sede_id          uuid not null references sedes(id) on delete cascade,
  product_id       uuid not null references products(id) on delete cascade,
  product_size_id  uuid references product_sizes(id) on delete cascade,
  -- Cantidad fija por día. `cantidad_domingo` null = igual que los demás días; 0 = no se produce el domingo.
  cantidad         int not null check (cantidad >= 0),
  cantidad_domingo int check (cantidad_domingo >= 0),
  actualizado_en   timestamptz not null default now()
);
-- Igual que stock: dos índices parciales porque NULL cuenta como distinto en un unique normal.
create unique index plan_vitrina_unico_con_tamano
  on plan_vitrina (sede_id, product_id, product_size_id) where product_size_id is not null;
create unique index plan_vitrina_unico_sin_tamano
  on plan_vitrina (sede_id, product_id) where product_size_id is null;

alter table plan_vitrina enable row level security;
grant select, insert, update, delete on plan_vitrina to authenticated;
grant select on plan_vitrina to app_api;

-- Lo ve el personal de esa sede (y el admin); solo el admin lo edita.
create policy plan_vitrina_select_por_sede on plan_vitrina
  for select to authenticated
  using (exists (
    select 1 from usuarios_dashboard u
    where u.id = (select auth.uid()) and (u.rol = 'admin' or u.sede_id = plan_vitrina.sede_id)
  ));
create policy plan_vitrina_admin_escribe on plan_vitrina
  for all to authenticated
  using (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin'))
  with check (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin'));
create policy plan_vitrina_app_api on plan_vitrina for select to app_api using (true);

-- ——————————————————————————————————————— 5. producido del día ————
create table produccion_dia (
  id               uuid primary key default gen_random_uuid(),
  fecha            date not null,
  sede_id          uuid not null references sedes(id) on delete cascade,
  product_id       uuid not null references products(id) on delete cascade,
  product_size_id  uuid references product_sizes(id) on delete cascade,
  -- Unidades que el equipo dice haber producido hoy para este producto (por pedido + vitrina).
  cantidad_producida int not null check (cantidad_producida >= 0),
  -- Parte de lo producido que ya se llevó a stock (solo si se lleva conteo): marcar dos veces no duplica.
  cantidad_a_stock   int not null default 0 check (cantidad_a_stock >= 0),
  producido_por    uuid,
  producido_en     timestamptz not null default now()
);
create unique index produccion_dia_unico_con_tamano
  on produccion_dia (fecha, sede_id, product_id, product_size_id) where product_size_id is not null;
create unique index produccion_dia_unico_sin_tamano
  on produccion_dia (fecha, sede_id, product_id) where product_size_id is null;
create index idx_produccion_dia_fecha on produccion_dia (fecha, sede_id);

alter table produccion_dia enable row level security;
-- El personal solo LEE; marcar «producido» pasa por la API (que también toca el stock en la misma transacción).
grant select on produccion_dia to authenticated;
grant select, insert, update on produccion_dia to app_api;

create policy produccion_dia_select_por_sede on produccion_dia
  for select to authenticated
  using (exists (
    select 1 from usuarios_dashboard u
    where u.id = (select auth.uid()) and (u.rol = 'admin' or u.sede_id = produccion_dia.sede_id)
  ));
create policy produccion_dia_app_api on produccion_dia for all to app_api using (true) with check (true);

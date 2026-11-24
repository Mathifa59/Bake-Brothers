-- ============================================================================
-- 0057_porcionado
--
-- Porcionado (transformación de productos): una torta o pie ENTERO (tamaño Familiar) se corta en porciones
-- individuales. En Stock se resta la cantidad de enteras y se suman las porciones que rinde cada una, según una REGLA por
-- producto (ej. Familiar → Individual = 12 porciones). La acción la hace la API en una sola transacción; esta migración
-- pone las tablas y deja la regla inicial que dio el dueño.
--
--   porcionado_reglas   Qué tamaño se porciona, a qué tamaño y cuántas porciones rinde. Las edita solo Administración
--                       (desde Catálogo); la leen Administración y quien tiene acceso a Stock. Nunca se borran: una regla
--                       se apaga (activo = false). Las tortas mini se venden siempre enteras: NO llevan regla.
--   porcionados         Historial: quién, cuándo, dónde y cuánto (con una copia de los nombres y del rendimiento de ese
--                       momento, para que un cambio posterior de la regla no altere lo ya hecho), y si se revirtió, por
--                       quién y cuándo. Solo la API lo lee y escribe (Administración lo ve por ahí). No se borra, y lo
--                       único que cambia después de creado es la reversión.
--
-- Solo se descuenta stock donde hay conteo: eso lo decide la API (lógica pura en packages/domain/src/porcionado.ts).
-- «Encargado» (usuarios_dashboard.es_encargado, 0056) decide quién puede porcionar; Administración puede sin serlo.
-- ============================================================================

create table if not exists porcionado_reglas (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references products(id) on delete cascade,
  size_entero_id  uuid not null references product_sizes(id) on delete cascade,
  size_porcion_id uuid not null references product_sizes(id) on delete cascade,
  porciones       integer not null check (porciones between 1 and 200),
  activo          boolean not null default true,
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid,
  constraint porcionado_reglas_tamanos_distintos check (size_entero_id <> size_porcion_id),
  constraint porcionado_reglas_unica unique (product_id, size_entero_id)
);

comment on table porcionado_reglas is
  'Reglas de porcionado: de qué tamaño entero se porciona, a qué tamaño y cuántas porciones rinde. Solo Administración las edita.';

-- Los dos tamaños tienen que ser del producto de la regla (la FK sola no lo garantiza).
create or replace function porcionado_reglas_valida()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from product_sizes where id = new.size_entero_id and product_id = new.product_id) then
    raise exception 'El tamaño entero no es de ese producto' using errcode = '23514';
  end if;
  if not exists (select 1 from product_sizes where id = new.size_porcion_id and product_id = new.product_id) then
    raise exception 'El tamaño de las porciones no es de ese producto' using errcode = '23514';
  end if;
  new.actualizado_en := now();
  new.actualizado_por := (select auth.uid());
  return new;
end
$$;

drop trigger if exists porcionado_reglas_valida on porcionado_reglas;
create trigger porcionado_reglas_valida
  before insert or update on porcionado_reglas
  for each row execute function porcionado_reglas_valida();

alter table porcionado_reglas enable row level security;
-- Sin delete: una regla no se borra, se apaga.
grant select, insert, update on porcionado_reglas to authenticated;
grant select on porcionado_reglas to app_api;

create policy app_api_porcionado_reglas on porcionado_reglas for select to app_api using (true);
-- La ven Administración y quien trabaja con Stock (Caja y el empleado transitorio; Administración entra siempre).
create policy stock_lee_porcionado_reglas on porcionado_reglas
  for select to authenticated
  using (tiene_perfil_panel(array['caja', 'empleado_temporal']));
create policy admin_escribe_porcionado_reglas on porcionado_reglas
  for all to authenticated
  using (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin'))
  with check (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin'));

-- ——— historial de porcionados ———
create table if not exists porcionados (
  id                uuid primary key default gen_random_uuid(),
  sede_id           uuid not null references sedes(id),
  product_id        uuid not null references products(id),
  size_entero_id    uuid not null references product_sizes(id),
  size_porcion_id   uuid not null references product_sizes(id),
  -- Copia de lo que se leía en pantalla en ese momento (un cambio posterior del catálogo no altera el historial).
  producto_nombre   text not null,
  tamano_entero     text not null,
  tamano_porcion    text not null,
  enteras           integer not null check (enteras > 0),
  rendimiento       integer not null check (rendimiento > 0),
  porciones_generadas integer not null check (porciones_generadas > 0),
  hecho_por         uuid not null,
  hecho_en          timestamptz not null default now(),
  revertido_por     uuid,
  revertido_en      timestamptz,
  motivo_reversion  text,
  constraint porcionados_cuentas_cuadran check (porciones_generadas = enteras * rendimiento),
  constraint porcionados_reversion_completa check ((revertido_por is null) = (revertido_en is null))
);
create index if not exists idx_porcionados_sede_fecha on porcionados (sede_id, hecho_en desc);
create index if not exists idx_porcionados_hecho_en on porcionados (hecho_en desc);

comment on table porcionados is
  'Historial de porcionados: quién, cuándo, dónde y cuánto. Solo la API lo lee y escribe; solo la reversión cambia una fila.';

-- Lo único que puede cambiar en una fila ya creada es la reversión (una sola vez); nunca se borra.
create or replace function porcionados_inmutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'El historial de porcionados no se borra' using errcode = 'P0001';
  end if;
  if (new.id, new.sede_id, new.product_id, new.size_entero_id, new.size_porcion_id, new.producto_nombre, new.tamano_entero,
      new.tamano_porcion, new.enteras, new.rendimiento, new.porciones_generadas, new.hecho_por, new.hecho_en)
     is distinct from
     (old.id, old.sede_id, old.product_id, old.size_entero_id, old.size_porcion_id, old.producto_nombre, old.tamano_entero,
      old.tamano_porcion, old.enteras, old.rendimiento, old.porciones_generadas, old.hecho_por, old.hecho_en) then
    raise exception 'Un porcionado hecho no se edita; solo se puede revertir' using errcode = 'P0001';
  end if;
  if old.revertido_en is not null then
    raise exception 'Este porcionado ya fue revertido' using errcode = 'P0001';
  end if;
  return new;
end
$$;

drop trigger if exists porcionados_inmutable on porcionados;
create trigger porcionados_inmutable
  before update or delete on porcionados
  for each row execute function porcionados_inmutable();

alter table porcionados enable row level security;
-- Sin ningún permiso para el panel: lo lee y escribe la API (Administración lo ve por ahí).
grant select, insert, update on porcionados to app_api;
create policy app_api_porcionados_select on porcionados for select to app_api using (true);
create policy app_api_porcionados_insert on porcionados for insert to app_api with check (true);
create policy app_api_porcionados_update on porcionados for update to app_api using (true) with check (true);

-- ——— datos iniciales: los rendimientos que dio el dueño (2026-11-24) ———
-- Familiar → Individual. Torta de chocolate, Carrot Cake, Red Velvet, Pie de manzana y Pie de limón = 12 porciones;
-- Crema volteada = 10. Las minis NO llevan regla. Si algún producto no tuviera su tamaño Familiar o Individual, la
-- migración se detiene con un error claro (no inventa tamaños). En una base sin el catálogo real no hace nada.
do $$
declare
  r record;
  v_producto uuid;
  v_entero uuid;
  v_porcion uuid;
  v_n int;
begin
  for r in
    select * from (values
      ('torta-chocolate-manjar', 12),
      ('torta-carrot-cake', 12),
      ('torta-red-velvet', 12),
      ('pie-manzana', 12),
      ('pie-limon', 12),
      ('crema-volteada', 10)
    ) as t(slug, porciones)
  loop
    select id into v_producto from products where slug = r.slug;
    if v_producto is null then
      continue; -- base sin el catálogo real (pruebas): nada que cargar
    end if;

    select count(*), min(id::text)::uuid into v_n, v_entero from product_sizes where product_id = v_producto and tamano ilike 'Familiar%';
    if v_n <> 1 then
      raise exception 'Porcionado: «%» no tiene exactamente un tamaño Familiar (hay %)', r.slug, v_n;
    end if;
    select count(*), min(id::text)::uuid into v_n, v_porcion from product_sizes where product_id = v_producto and tamano = 'Individual';
    if v_n <> 1 then
      raise exception 'Porcionado: «%» no tiene exactamente un tamaño Individual (hay %)', r.slug, v_n;
    end if;

    insert into porcionado_reglas (product_id, size_entero_id, size_porcion_id, porciones)
    values (v_producto, v_entero, v_porcion, r.porciones)
    on conflict (product_id, size_entero_id) do nothing;
  end loop;
end
$$;

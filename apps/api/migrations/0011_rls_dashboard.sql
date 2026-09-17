-- ============================================================================
-- 0011_rls_dashboard — activa el aislamiento por sede para apps/admin (Semana 3)
--
-- 0004_rediseno_alcance.sql dejó redactadas (comentadas) políticas de SELECT
-- para orders/stock por sede, pensadas para activarse junto con el login
-- real. Esta migración las activa, con una corrección real sobre ese
-- borrador: solo cubría SELECT. Si se activa tal cual, `app_api` (el rol de
-- apps/api, sin relación con auth.uid()) dejaría de poder INSERT/UPDATE en
-- cuanto RLS se habilite — rompería POST /api/orders y el futuro escritor de
-- stock. Por eso cada tabla lleva DOS familias de política: una que le da a
-- `app_api` paso libre (ya valida todo en TypeScript; RLS es para el
-- dashboard, no para el servicio de confianza), y otra que filtra por sede
-- para `authenticated` (usuarios reales del dashboard, vía Supabase Auth).
--
-- Grants nuevos: sin esto RLS ni siquiera entra a jugar — Postgres deniega
-- por falta de privilegio ANTES de evaluar ninguna política.
-- ============================================================================


-- ============================================================================
-- 1. usuarios_dashboard — cada quien lee solo su propia fila
-- ============================================================================
-- Sin esto, cualquier operador logueado podría leer el rol y la sede de TODO
-- el personal (la misma consulta que necesitan las políticas de abajo). No
-- estaba pedido explícitamente, pero es la contraparte obligatoria de activar
-- RLS por sede: si esta tabla queda abierta, el resto pierde sentido.
grant select on usuarios_dashboard to authenticated;

alter table usuarios_dashboard enable row level security;

create policy usuarios_dashboard_propio on usuarios_dashboard
  for select to authenticated
  using (id = auth.uid());


-- ============================================================================
-- 2. orders — admin ve todo, operador solo su sede
-- ============================================================================
grant select, update on orders to authenticated;

alter table orders enable row level security;

create policy app_api_orders on orders
  for all to app_api
  using (true) with check (true);

create policy orders_select_por_sede on orders
  for select to authenticated
  using (
    exists (
      select 1 from usuarios_dashboard u
      where u.id = auth.uid() and (u.rol = 'admin' or u.sede_id = orders.sede_id)
    )
  );

create policy orders_update_por_sede on orders
  for update to authenticated
  using (
    exists (
      select 1 from usuarios_dashboard u
      where u.id = auth.uid() and (u.rol = 'admin' or u.sede_id = orders.sede_id)
    )
  )
  with check (
    exists (
      select 1 from usuarios_dashboard u
      where u.id = auth.uid() and (u.rol = 'admin' or u.sede_id = orders.sede_id)
    )
  );


-- ============================================================================
-- 3. stock — mismo criterio, con insert (alta de un SKU nuevo en el toggle)
-- ============================================================================
grant select, insert, update on stock to authenticated;

alter table stock enable row level security;

create policy app_api_stock on stock
  for all to app_api
  using (true) with check (true);

create policy stock_select_por_sede on stock
  for select to authenticated
  using (
    exists (
      select 1 from usuarios_dashboard u
      where u.id = auth.uid() and (u.rol = 'admin' or u.sede_id = stock.sede_id)
    )
  );

create policy stock_insert_por_sede on stock
  for insert to authenticated
  with check (
    exists (
      select 1 from usuarios_dashboard u
      where u.id = auth.uid() and (u.rol = 'admin' or u.sede_id = stock.sede_id)
    )
  );

create policy stock_update_por_sede on stock
  for update to authenticated
  using (
    exists (
      select 1 from usuarios_dashboard u
      where u.id = auth.uid() and (u.rol = 'admin' or u.sede_id = stock.sede_id)
    )
  )
  with check (
    exists (
      select 1 from usuarios_dashboard u
      where u.id = auth.uid() and (u.rol = 'admin' or u.sede_id = stock.sede_id)
    )
  );


-- ============================================================================
-- 4. Catálogo de referencia — el dashboard necesita leerlo (nombres de
--    producto/tamaño/sede), sin RLS: no son datos por sede, son catálogo
--    global, igual que ya los lee apps/api.
-- ============================================================================
grant select on sedes, products, product_sizes to authenticated;


-- ============================================================================
-- 5. Trigger — valida la transición de estado en cada UPDATE de orders.estado
--
-- RLS (arriba) controla QUIÉN puede tocar una fila; esto controla QUÉ valor
-- puede escribir, sin importar quién sea (app_api o un usuario autenticado
-- del dashboard) — ninguna de las dos políticas de arriba tiene opinión sobre
-- si "delivered → draft" es una transición válida, y no debería tenerla: es
-- una regla de negocio, no de acceso.
--
-- Mismo conjunto de transiciones que packages/domain/src/orderStatus.ts
-- (TRANSICIONES_VALIDAS) — Postgres no puede importar ese archivo, así que
-- se transcribe acá. Si ese archivo cambia, este trigger se tiene que
-- actualizar a mano — no hay forma de evitar esa duplicación puntual sin
-- meter un runtime de JS dentro de Postgres.
-- ============================================================================
create or replace function validar_transicion_estado_pedido()
returns trigger as $$
declare
  transiciones jsonb := '{
    "draft":            ["confirmed", "cancelled"],
    "confirmed":        ["payment_pending", "paid", "in_production", "cancelled"],
    "payment_pending":  ["paid", "cancelled"],
    "paid":             ["in_production", "cancelled"],
    "in_production":    ["out_for_delivery", "cancelled"],
    "out_for_delivery": ["delivered", "cancelled"],
    "delivered":        [],
    "cancelled":        []
  }'::jsonb;
begin
  if new.estado = old.estado then
    return new; -- no es una transición real (ej. un UPDATE que toca otra columna)
  end if;
  if not (transiciones -> old.estado) ? new.estado then
    raise exception 'Transición de pedido inválida: % → %', old.estado, new.estado
      using errcode = '23514';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger validar_transicion_estado_pedido_trigger
  before update of estado on orders
  for each row
  execute function validar_transicion_estado_pedido();

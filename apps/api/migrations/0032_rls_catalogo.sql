-- ============================================================================
-- 0032_rls_catalogo — RLS en las tablas de catálogo/sedes
--
-- El asesor de seguridad de Supabase marcaba "RLS Disabled in Public" (crítico)
-- en products, product_sizes, catering_items, combo_items, combos y sedes. No
-- era un hueco explotable hoy: `anon` no tiene ningún privilegio sobre ellas y
-- `authenticated` solo SELECT (0012/0013) — pero la protección dependía SOLO de
-- los grants, sin RLS detrás. Y `authenticated` es cualquier cuenta con sesión,
-- no solo el personal: si el registro público de Supabase Auth está abierto,
-- alguien que se registre podría leer catálogo, combos y los
-- `whatsapp_phone_number_id` de las sedes.
--
-- Mismo patrón que orders (0011): DOS familias de política por tabla.
--   1. `app_api` (apps/api y el bot) con paso libre — valida todo en TypeScript;
--      sin esta política, activar RLS le dejaría de devolver filas y rompería
--      el catálogo público, el bot y POST /api/orders.
--   2. `authenticated`: SOLO LECTURA, y solo para personal del panel (que exista
--      en usuarios_dashboard), no para cualquier sesión. Nadie escribe estas
--      tablas desde el navegador (authenticated no tiene INSERT/UPDATE/DELETE).
--
-- `(select auth.uid())` en vez de `auth.uid()` a secas: Postgres lo evalúa una
-- sola vez por consulta y no una vez por fila (aviso "Auth RLS Initialization
-- Plan" del asesor de rendimiento). La subconsulta a usuarios_dashboard pasa por
-- su propia RLS (usuarios_dashboard_propio: cada quien ve su fila), que es
-- justo lo que hace falta para saber si quien consulta es del personal.
--
-- `postgres`/`service_role` (migraciones, MCP) tienen BYPASSRLS: no se afectan.
-- Sin cambios de grants y sin cambios de datos: solo se activa RLS + políticas.
-- ============================================================================

-- products
alter table products enable row level security;
create policy app_api_products on products
  for all to app_api using (true) with check (true);
create policy personal_lee_products on products
  for select to authenticated
  using (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid())));

-- product_sizes
alter table product_sizes enable row level security;
create policy app_api_product_sizes on product_sizes
  for all to app_api using (true) with check (true);
create policy personal_lee_product_sizes on product_sizes
  for select to authenticated
  using (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid())));

-- catering_items
alter table catering_items enable row level security;
create policy app_api_catering_items on catering_items
  for all to app_api using (true) with check (true);
create policy personal_lee_catering_items on catering_items
  for select to authenticated
  using (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid())));

-- combo_items
alter table combo_items enable row level security;
create policy app_api_combo_items on combo_items
  for all to app_api using (true) with check (true);
create policy personal_lee_combo_items on combo_items
  for select to authenticated
  using (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid())));

-- combos
alter table combos enable row level security;
create policy app_api_combos on combos
  for all to app_api using (true) with check (true);
create policy personal_lee_combos on combos
  for select to authenticated
  using (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid())));

-- sedes
alter table sedes enable row level security;
create policy app_api_sedes on sedes
  for all to app_api using (true) with check (true);
create policy personal_lee_sedes on sedes
  for select to authenticated
  using (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid())));

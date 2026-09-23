-- ============================================================================
-- 0022_app_api_rls_usuarios_dashboard — el grant de 0021 no alcanzaba
--
-- Encontrado probando el puente real (no en la revisión de código): 0021
-- le dio a `app_api` el GRANT select en usuarios_dashboard, pero la tabla
-- tiene RLS habilitada desde 0011 con UNA sola política —
-- `usuarios_dashboard_propio`, `for select to authenticated using (id =
-- auth.uid())` — sin ninguna política de bypass para `app_api`, a
-- diferencia de orders/stock/customers/conversaciones (que sí la tienen
-- desde que se les activó RLS). El GRANT solo no alcanza: RLS es una
-- segunda puerta independiente, y sin política que mencione a `app_api`,
-- la tabla le sigue devolviendo 0 filas pase lo que pase el GRANT.
--
-- Se agrega la misma política de bypass que ya usan las demás tablas.
-- ============================================================================

create policy app_api_usuarios_dashboard on usuarios_dashboard
  for select to app_api
  using (true);

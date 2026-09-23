-- ============================================================================
-- 0021_app_api_lee_usuarios_dashboard — el puente admin→api necesita
-- resolver rol/sede_id reales del operador autenticado
--
-- Hasta ahora `app_api` no tenía grant en `usuarios_dashboard` a propósito
-- (CLAUDE.md §6: "esa tabla la gestiona Supabase Auth/el dashboard, no la
-- API"). Eso cambia con POST /api/dashboard/orders (Semana 3): apps/api
-- verifica la firma del JWT del operador (contra el JWKS público de
-- Supabase, sin secreto compartido) y necesita, con el `sub` ya verificado,
-- consultar el rol/sede_id REAL — nunca confiar en lo que mande el cliente.
--
-- Solo SELECT — app_api nunca escribe usuarios_dashboard, la sigue
-- gestionando el propio dashboard (altas/bajas de personal) vía su rol
-- `authenticated` normal, no esta ruta.
-- ============================================================================

grant select on usuarios_dashboard to app_api;

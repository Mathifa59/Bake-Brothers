-- ============================================================================
-- 0012_endurece_grants_publicos — cierra un hallazgo de seguridad preexistente
--
-- Al verificar los grants de 0011 (select on information_schema.role_table_grants
-- where grantee = 'authenticated'), aparecieron privilegios de SELECT/INSERT/
-- UPDATE/DELETE/TRUNCATE sobre TODAS las tablas de public — incluida
-- `customers` (PII: nombre, teléfono) — para `authenticated` Y para `anon`
-- (el rol SIN login, el que usa la anon key pública). Ninguna de esas tablas
-- tenía RLS (`relrowsecurity = false`), así que el grant era la única puerta
-- — y estaba abierta de par en par. No es algo que haya introducido esta
-- sesión: viene desde 0001/0004/0006/0007/0009/0010 (privilegios por defecto
-- que Supabase aplica a `anon`/`authenticated` sobre cada tabla nueva de
-- `public`, salvo que se revoquen explícitamente — cosa que ninguna
-- migración anterior hizo, porque hasta apps/admin nada de este proyecto
-- hablaba con Supabase directo vía anon key).
--
-- No era explotable "en la práctica" hasta ahora porque la anon key nunca
-- había viajado a ningún cliente público (apps/web solo habla con apps/api).
-- Deja de ser un riesgo latente en cuanto apps/admin se publique con esa
-- misma key en su bundle — cualquiera podría sacarla del bundle y pegarle
-- directo a /rest/v1/customers (o a cualquier otra tabla) sin loguearse.
--
-- `app_api` no se toca — no usa `anon`/`authenticated`, se conecta directo
-- por pg con su propio rol, ajeno a todo este sistema de grants.
-- ============================================================================

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

-- Re-otorga exactamente lo que 0011 ya había decidido que authenticated
-- necesita para el dashboard — nada más. anon queda sin ningún acceso
-- directo a datos: no hay ningún cliente público que lo necesite hoy
-- (apps/web nunca tocó Supabase directo, y no hay planeado ningún flujo sin
-- login para apps/admin).
grant select on usuarios_dashboard to authenticated;
grant select, update on orders to authenticated;
grant select, insert, update on stock to authenticated;
grant select on sedes, products, product_sizes to authenticated;

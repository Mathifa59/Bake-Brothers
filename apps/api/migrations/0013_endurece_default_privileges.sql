-- ============================================================================
-- 0013_endurece_default_privileges — cierra la causa raíz del hallazgo de 0012
--
-- 0012 revocó los privilegios de anon/authenticated SOLO sobre las tablas que
-- ya existían en ese momento. No tocó la causa real: confirmado vía
-- pg_default_acl que este proyecto tiene una regla
-- `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public` que le
-- otorga automáticamente TODO (tablas, secuencias, funciones) a
-- anon/authenticated/service_role en cada objeto nuevo — y `postgres` es
-- exactamente el rol con el que corren todas las migraciones de este
-- proyecto (current_user lo confirma). Sin tocar esta regla, cualquier
-- `create table` futuro reabre el mismo hueco en silencio, tabla por tabla,
-- para siempre — es justamente lo que le pasó sin darse cuenta a
-- conversaciones/contenido_rag (0009/0010) hasta que 0012 las alcanzó por
-- estar dentro del "all tables" de ese momento.
--
-- Esta migración revoca la regla por defecto para anon/authenticated —
-- vuelven a "nada por defecto" en cualquier tabla/secuencia/función nueva.
-- service_role NO se toca: es el rol interno de confianza de Supabase
-- (Studio, jobs internos), equivalente en espíritu a app_api — igual que
-- 0012 no tocó app_api.
--
-- De acá en adelante, toda tabla nueva que el dashboard necesite leer/
-- escribir requiere su propio `grant` explícito en la misma migración que
-- la crea — mismo patrón que ya usa 0011 para orders/stock/usuarios_dashboard/
-- sedes/products/product_sizes. Sin ese grant explícito, la tabla nueva
-- simplemente no es alcanzable por anon/authenticated — comportamiento
-- seguro por defecto, en vez de abierto por defecto.
-- ============================================================================

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;

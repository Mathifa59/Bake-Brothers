-- ============================================================================
-- 0031_usuarios_dashboard_nombre — nombre de la persona para el saludo de
-- Bake OS ("Buenos días, Javier").
--
-- `usuarios_dashboard` solo tenía rol y sede. El nombre es opcional (nullable):
-- las cuentas de sede NO tienen una persona única detrás (las usa el equipo
-- del local), así que quedan sin nombre y el saludo dice "Equipo Cedros" /
-- "Equipo Santa Marina". Solo la cuenta de dirección lleva nombre.
--
-- Numeración: 0030 ya está tomada por la rama feature/coexistencia
-- (whatsapp_conexiones). Esta migración no depende de ella ni al revés; se
-- aplican juntas en el deploy final, en orden 0030 → 0031.
--
-- Sin cambios de permisos: `authenticated` ya tiene SELECT a nivel de tabla
-- sobre usuarios_dashboard (0011/0012) y la política de RLS deja leer solo la
-- fila propia — la columna nueva queda cubierta por ese mismo SELECT. Nadie
-- puede escribirla desde el navegador (authenticated no tiene UPDATE, ver
-- CLAUDE.md §10: probado, no hay escalada de privilegios).
-- ============================================================================

alter table usuarios_dashboard add column nombre text;

update usuarios_dashboard u
set nombre = 'Javier'
from auth.users a
where a.id = u.id and a.email = 'adminbake@bake-brothers.com';

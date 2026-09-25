-- ============================================================================
-- 0029_realtime_conversaciones — la bandeja de Conversaciones se actualiza
-- sola cuando el bot escala algo, mismo patrón que orders (0016).
--
-- `replica identity full` es necesario ACÁ (orders no lo necesita): la UI
-- solo debe sonar cuando una conversación PASA a 'escalada' (una
-- transición real), no en cada actualización de una que ya está escalada
-- (ej. el cliente sigue escribiendo mientras espera — eso solo actualiza
-- `historial`, sin cambiar `estado`, y no debe volver a sonar). Para poder
-- distinguir esos dos casos en el cliente hace falta el valor ANTERIOR de
-- `estado` en el evento de UPDATE — con el replica identity por defecto
-- (solo la PK), Postgres no lo manda.
--
-- Realtime respeta RLS, igual que orders: cada operador solo recibe
-- eventos de las conversaciones que ya podría leer por la política de
-- 0017 (admin todas, operador solo la de su sede).
-- ============================================================================

alter table conversaciones replica identity full;
alter publication supabase_realtime add table conversaciones;

-- ============================================================================
-- 0016_realtime_orders — apps/admin recibe cambios de pedidos en vivo
--
-- Solo la parte de "tiempo real": la lista de Pedidos se actualiza sola
-- cuando alguien más cambia un estado (Supabase Realtime, postgres_changes
-- sobre orders). Un Kanban por columnas (arrastrar y soltar) es un rediseño
-- de UI más grande, deliberadamente fuera de esta vuelta — se hace después,
-- sin apurarlo.
--
-- Realtime respeta RLS: cada cliente solo recibe eventos de las filas que
-- ya podría leer por las políticas de 0011 (admin todo, operador su sede).
-- ============================================================================

alter publication supabase_realtime add table orders;

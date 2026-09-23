-- ============================================================================
-- 0023_dashboard_lee_catering_items — la pantalla "Nuevo pedido" necesita
-- listar los 14 ítems de catering reales para su buscador (igual que ya
-- puede listar products/combos) — `authenticated` no tenía grant acá
-- tampoco (mismo motivo histórico que combos: nadie lo había necesitado
-- hasta ahora).
-- ============================================================================

grant select on catering_items to authenticated;

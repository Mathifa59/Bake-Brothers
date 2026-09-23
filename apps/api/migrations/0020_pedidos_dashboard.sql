-- ============================================================================
-- 0020_pedidos_dashboard — soporte para pedidos armados a mano desde
-- apps/admin (POST /api/dashboard/orders)
--
-- 1. Combos como línea de pedido: order_items gana `combo_id` (nullable, FK
--    a combos) y el check de "un solo tipo de línea" pasa de dos vías
--    (product_id/catering_item_id, 0019) a tres (+ combo_id) — exactamente
--    una de las tres, nunca ninguna ni varias. El precio de una línea de
--    combo es combos.precio_promo tal cual (precio fijo de paquete, no se
--    recalcula por producto — ver services/pedidosCombos.ts).
--
-- 2. Grants: `authenticated` no tenía select en combos/combo_items (0012/13
--    los dejó en cero junto con todo lo demás) — el dashboard necesita
--    listarlos para el selector de la pantalla "Nuevo pedido".
--
-- 3. orders.canal gana 'presencial': el check original (0004) solo admitía
--    'web'/'whatsapp'/'facebook'/'instagram' — ninguno representa un pedido
--    armado a mano por un operador (por teléfono, en el mostrador, etc.).
--    'presencial' ya es el término que usa combos.canal_permitido para este
--    mismo caso — se reusa el mismo nombre en vez de inventar uno nuevo.
-- ============================================================================

alter table order_items
  add column combo_id uuid references combos(id);

alter table order_items
  drop constraint order_items_producto_o_catering;

alter table order_items
  add constraint order_items_un_solo_tipo check (
    (case when product_id is not null then 1 else 0 end) +
    (case when catering_item_id is not null then 1 else 0 end) +
    (case when combo_id is not null then 1 else 0 end) = 1
  );

grant select on combos, combo_items to authenticated;

alter table orders drop constraint orders_canal_check;
alter table orders add constraint orders_canal_check
  check (canal in ('web', 'whatsapp', 'facebook', 'instagram', 'presencial'));

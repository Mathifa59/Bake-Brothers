-- ============================================================================
-- 0019_order_items_catering — order_items admite líneas de catering
--
-- El bot necesita poder registrar un pedido real de catering (ver
-- apps/api/src/bot/tools.ts::crearPedido), no solo de tienda. Bloqueo real
-- con el esquema anterior: `product_id` era NOT NULL con FK a `products`, y
-- los catering_items están deliberadamente separados de `products` desde
-- 0007 (casi ningún ítem de catering corresponde 1 a 1 con un producto de
-- tienda) — no había forma de insertar una línea de catering en order_items.
--
-- `product_id` pasa a nullable y se agrega `catering_item_id` (nullable, FK
-- a catering_items), con un check que exige exactamente uno de los dos —
-- nunca ambos, nunca ninguno. `nombre_producto` sigue sirviendo como
-- snapshot del nombre para ambos casos (ya era un campo de texto libre, no
-- une a products).
--
-- Precio: catering_items no tiene NINGÚN precio en el catálogo — la fuente
-- real dice que el flujo es "Validar → Cotizar → Cobrar", el operador
-- siempre pone el precio a mano, nunca hay un precio de catálogo que
-- recalcular (ver Guía de Agendamiento, sección 10). Por eso `precio_unitario`
-- se deja en 0 para líneas de catering al crearlas — mismo patrón que ya
-- usa `delivery` en orders (0 al crear, lo completa el operador desde el
-- dashboard) — no se vuelve nullable, sigue NOT NULL.
-- ============================================================================

alter table order_items
  alter column product_id drop not null;

alter table order_items
  add column catering_item_id uuid references catering_items(id);

alter table order_items
  add constraint order_items_producto_o_catering check (
    (product_id is not null and catering_item_id is null) or
    (product_id is null and catering_item_id is not null)
  );

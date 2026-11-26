-- 0059 — «Efectivo» como medio de pago (Nuevo pedido del panel).
--
-- Hasta hoy `orders.metodo_pago` solo admitía yape, plin, transferencia, tarjeta y contraentrega. Quien registra un pedido
-- en el local y cobra en efectivo no tenía cómo decirlo. Solo se amplía la lista de valores permitidos: ninguna fila
-- existente cambia (todas siguen cumpliendo la regla) y el resto del sistema (bot, tienda) no usa el valor nuevo.
-- Se reemplaza la regla (nada de borrar tablas): sale la vieja y entra la nueva dentro de la misma transacción.
begin;

alter table orders drop constraint orders_metodo_pago_check;
alter table orders add constraint orders_metodo_pago_check
  check (metodo_pago in ('yape', 'plin', 'transferencia', 'tarjeta', 'efectivo', 'contraentrega'));

commit;

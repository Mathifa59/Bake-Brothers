-- ============================================================================
-- 0049_precio_mediana_y_cuchareable — respuestas del cliente (2026-11-13)
--
-- 1) Empanada MEDIANA: «desde S/ 5.00». Es el tamaño oculto de las empanadas (`visible_publico = false`: la web y el bot
--    no lo ven; solo lo usan las órdenes de mayoristas, que van «por cotizar»). Solo se rellena donde no tenía precio.
-- 2) Cuchareable: no existe un sabor «manjar» aparte — lo que se llamaba así es el Cuchareable de ALFAJOR (que ya estaba
--    en la lista). Se quita «chocolate con manjar blanco» (duplicado) de la descripción y el alfajor queda primero.
--    Los precios son los de Cedros, iguales para los dos locales (los de Mifact de Santa Marina no se usan).
-- Idempotente: se puede correr de nuevo sin cambiar nada.
-- ============================================================================

update product_sizes
   set precio = 5.00
 where lower(tamano) = 'mediana' and precio is null;

update products
   set descripcion = 'Postre en vaso de 16oz. Sabores: alfajor, chocolate con manjar de lúcuma, chocolate con Nutella, chocolate Princesa.'
 where slug = 'cuchareable'
   and descripcion = 'Postre en vaso de 16oz. Sabores: chocolate con manjar blanco, chocolate con manjar de lúcuma, chocolate con Nutella, chocolate Princesa, alfajor.';

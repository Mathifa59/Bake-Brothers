-- ============================================================================
-- 0043_catalogo_clasificacion — área, familia y sabor de cada producto, de la plantilla de operaciones del cliente
--
-- Generada del emparejado de la hoja DATOS de «Plantilla Maestra Pedidos Diarios v4.2» con el catálogo (se revisó a mano).
-- Solo UPDATE por nombre de producto; no crea ni borra nada. Requiere 0039 (area_produccion) y 0042 (familia_operativa, sabor).
-- Si un producto tiene filas de la plantilla con áreas distintas gana la más frecuente (conflictos listados abajo).
-- Es una PROPUESTA hasta que el cliente la confirme: son columnas normales, se corrigen desde la pantalla Catálogo.
--
-- Conflictos de área (misma plantilla, distintas filas del mismo producto):
--   Tres Leches de Vainilla: empaque, pasteleria
-- ============================================================================

update products set familia_operativa = 'BEBIDAS', area_produccion = 'empaque' where nombre = 'Agua mineral';
update products set familia_operativa = 'BEBIDAS', area_produccion = 'empaque' where nombre = 'Café americano';
update products set familia_operativa = 'BEBIDAS', area_produccion = 'empaque' where nombre = 'Coca-Cola';
update products set familia_operativa = 'BEBIDAS', area_produccion = 'empaque' where nombre = 'Inka Kola';
update products set familia_operativa = 'BEBIDAS', area_produccion = 'empaque' where nombre = 'Infusiones';
update products set familia_operativa = 'EMPANADA', area_produccion = 'empanaderia', sabor = 'CABAN' where nombre = 'Empanada Cabanozzi';
update products set familia_operativa = 'EMPANADA', area_produccion = 'empanaderia', sabor = 'CARNIV' where nombre = 'Empanada Carnívora';
update products set familia_operativa = 'EMPANADA', area_produccion = 'empanaderia', sabor = 'AJI' where nombre = 'Empanada de Ají de Gallina';
update products set familia_operativa = 'EMPANADA', area_produccion = 'empanaderia', sabor = 'CARNE' where nombre = 'Empanada de Carne';
update products set familia_operativa = 'EMPANADA', area_produccion = 'empanaderia', sabor = 'JQ' where nombre = 'Empanada de Jamón y Queso';
update products set familia_operativa = 'EMPANADA', area_produccion = 'empanaderia', sabor = 'LOMO' where nombre = 'Empanada de Lomo';
update products set familia_operativa = 'EMPANADA', area_produccion = 'empanaderia', sabor = 'CHAMP' where nombre = 'Empanada de Pollo con Champiñón';
update products set familia_operativa = 'EMPANADA', area_produccion = 'empanaderia', sabor = 'POLLO' where nombre = 'Empanada de Pollo';
update products set familia_operativa = 'EMPANADA', area_produccion = 'empanaderia', sabor = '3Q' where nombre = 'Empanada 3 Quesos';
update products set familia_operativa = 'EMPANADA', area_produccion = 'empanaderia', sabor = 'HAW' where nombre = 'Empanada Hawaiana';
update products set familia_operativa = 'JUGOS', area_produccion = 'empaque' where nombre = 'Jugo';
update products set familia_operativa = 'JUGOS', area_produccion = 'empaque' where nombre = 'Jugo surtido';
update products set familia_operativa = 'PASTELERIA', area_produccion = 'pasteleria' where nombre = 'Alfajor con Nutella';
update products set familia_operativa = 'PASTELERIA', area_produccion = 'pasteleria' where nombre = 'Chocoalfajor';
update products set familia_operativa = 'PASTELERIA', area_produccion = 'pasteleria' where nombre = 'Alfajor con Manjar';
update products set familia_operativa = 'PASTELERIA', area_produccion = 'empaque' where nombre = 'Alfajor con Pistacho';
update products set familia_operativa = 'PASTELERIA', area_produccion = 'empaque' where nombre = 'Alfajor Mix';
update products set familia_operativa = 'PASTELERIA', area_produccion = 'pasteleria' where nombre = 'Brownie (caja x16)';
update products set familia_operativa = 'PASTELERIA', area_produccion = 'pasteleria' where nombre = 'Pionono (caja x16)';
update products set familia_operativa = 'PASTELERIA', area_produccion = 'pasteleria' where nombre = 'Trufas';
update products set familia_operativa = 'PASTELERIA', area_produccion = 'pasteleria' where nombre = 'Carrot Cake';
update products set familia_operativa = 'PASTELERIA', area_produccion = 'pasteleria' where nombre = 'Cheesecake de Fresa';
update products set familia_operativa = 'PASTELERIA', area_produccion = 'pasteleria' where nombre = 'Cheesecake de Maracuyá';
update products set familia_operativa = 'PASTELERIA', area_produccion = 'pasteleria' where nombre = 'Cheesecake de Oreo';
update products set familia_operativa = 'PASTELERIA', area_produccion = 'pasteleria' where nombre = 'Crema Volteada';
update products set familia_operativa = 'PASTELERIA', area_produccion = 'pasteleria' where nombre = 'Cupcakes Artesanal';
update products set familia_operativa = 'PASTELERIA', area_produccion = 'pasteleria' where nombre = 'Mil Hojas';
update products set familia_operativa = 'PASTELERIA', area_produccion = 'pasteleria' where nombre = 'Pie de Limón';
update products set familia_operativa = 'PASTELERIA', area_produccion = 'pasteleria' where nombre = 'Pie de Manzana';
update products set familia_operativa = 'PASTELERIA', area_produccion = 'pasteleria' where nombre = 'Tres Leches de Vainilla';
update products set familia_operativa = 'PASTELERIA', area_produccion = 'pasteleria' where nombre = 'Torta Tres Leches Chocolate';
update products set familia_operativa = 'PASTELERIA', area_produccion = 'pasteleria' where nombre = 'Torta de Alfajor';
update products set familia_operativa = 'PASTELERIA', area_produccion = 'pasteleria' where nombre = 'Torta de Chocolate con Manjar';
update products set familia_operativa = 'PASTELERIA', area_produccion = 'pasteleria' where nombre = 'Red Velvet';
update products set familia_operativa = 'PASTELERIA', area_produccion = 'pasteleria' where nombre = 'Pionono Familiar';
update products set familia_operativa = 'PASTELERIA', area_produccion = 'pasteleria' where nombre = 'Tartaleta de Frutas';
update products set familia_operativa = 'PASTELERIA', area_produccion = 'pasteleria' where nombre = 'Torta Selva Negra';
update products set familia_operativa = 'SANDWICH', area_produccion = 'empaque' where nombre = 'Ciabatta con pollo';
update products set familia_operativa = 'SANDWICH', area_produccion = 'empaque' where nombre = 'Croissant con pollo';
update products set familia_operativa = 'TIENDA', area_produccion = 'empaque' where nombre = 'Tres Leches de Chocolate';
update products set familia_operativa = 'TIENDA', area_produccion = 'pasteleria' where nombre = 'Mix Lite';
update products set familia_operativa = 'TIENDA', area_produccion = 'cocina' where nombre = 'Triple de pollo, jamón y queso';

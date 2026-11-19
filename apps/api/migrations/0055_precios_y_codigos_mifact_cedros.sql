-- ============================================================================
-- 0055_precios_y_codigos_mifact_cedros
--
-- Precios y códigos de producto de MIFACT (Corporación Hermanos Loarte S.A.C., la del local de Cedros, RUC 20605451005;
-- archivo PRODUCTOS_MIFACT_20605451005.xlsx de 2026-11-19). Decisión del cliente: los precios de Mifact son los
-- OFICIALES, iguales para los dos locales. Esta migración:
--   1. empareja cada producto de Mifact con el de nuestro catálogo (por nombre y tamaño; ver la tabla de abajo);
--   2. deja el precio de cada producto o tamaño emparejado en el PRECIO UNITARIO (con IGV) de Mifact;
--   3. guarda el código de Mifact de cada uno en `mifact_codigos` (para emitir comprobantes);
--   4. deja en el precio de Mifact a los combos con el mismo nombre (los combos no tienen tabla de códigos).
-- NO crea ni oculta ningún producto: lo que está en Mifact y no aquí (o al revés) no se toca.
-- NO se emparejaron los dudosos (Trufas, Tres leches familiar, Mini Torta tres leches y Jugo): esperan respuesta del cliente.
--
-- Seguridad: si algún emparejamiento no encuentra EXACTAMENTE un producto/tamaño, o un código ya está guardado para
-- otro, la migración se cancela entera (no deja nada a medias). Es idempotente: repetirla no cambia nada.
-- El almacén se guarda tal cual lo escribe el archivo (TODOS; «Infusion» viene de CENTRAL). Cuando llegue el archivo
-- de Baker Brothers E.I.R.L. (Santa Marina) habrá que distinguir el emisor además del almacén (ver CLAUDE.md).
-- ============================================================================

do $migracion$
declare
  fallos int;
  cambios int;
begin
  create temp table _mf (
    codigo text not null, barras text, almacen text not null, precio numeric(10,2) not null,
    producto text not null, tamano text, nombre_mifact text not null
  ) on commit drop;

  insert into _mf (codigo, barras, almacen, precio, producto, tamano, nombre_mifact) values
    ('10', '9810085000106', 'TODOS', 13.9, 'Frappé', null, 'Frappe'),
    ('105', '9810085001059', 'TODOS', 15.9, 'Cuchareable', null, 'Cuchareable'),
    ('124', '9810085001240', 'TODOS', 12.9, 'Croissant mixto', null, 'Croissant mixto'),
    ('125', '9810085001257', 'TODOS', 12.9, 'Triple de palta, tomate y huevo', null, 'Triple de palta huevo y tomate'),
    ('128', '9810085001288', 'TODOS', 9.9, 'Ciabatta con pollo', null, 'Ciabatta con pollo'),
    ('129', '9810085001295', 'TODOS', 13.9, 'Croissant con pollo', null, 'Croissant con pollo'),
    ('14', '9810085000144', 'CENTRAL', 4.0, 'Infusiones', null, 'Infusion'),
    ('175', null, 'TODOS', 9.9, 'Refresher', null, 'Refresher'),
    ('186', null, 'TODOS', 15.9, 'Frappé de Oreo', null, 'Frappe Oreo'),
    ('40', '9810085000403', 'TODOS', 7.9, 'Mix Lite', null, 'Mix Lite'),
    ('5', '9810085000052', 'TODOS', 6.0, 'Café americano', null, 'Cafe americano'),
    ('96', '9810085000960', 'TODOS', 11.0, 'Jugo surtido', null, 'Jugo surtido'),
    ('126', '9810085001264', 'TODOS', 11.9, 'Triple de pollo, jamón y queso', null, 'Triple de jamon, queso y pollo (personal)'),
    ('127', '9810085001271', 'TODOS', 9.9, 'Mixto de jamón y queso', null, 'Mixto caliente de jamon y queso'),
    ('91', '9810085000915', 'TODOS', 12.0, 'Helado 2 bolas', null, 'Helado Artesanal 2 Bolas'),
    ('92', '9810085000922', 'TODOS', 7.0, 'Helado 1 bola', null, 'Helado Artesanal 1 Bola'),
    ('115', '9810085001158', 'TODOS', 8.9, 'Cupcakes Artesanal', null, 'Cupcake'),
    ('174', null, 'TODOS', 7.9, 'Tartaleta de Frutas', null, 'Tartaleta de frutas (personal)'),
    ('4', '9810085000045', 'TODOS', 4.0, 'Agua mineral', null, 'Agua mineral San Mateo sin gas 500ml'),
    ('8', '9810085000083', 'TODOS', 5.0, 'Coca-Cola', null, 'Coca Cola 500 ml'),
    ('12', '9810085000120', 'TODOS', 5.0, 'Inka Kola', null, 'Inca Kola 500 ml'),
    ('37', '9810085000373', 'TODOS', 11.9, 'Brownie (caja x16)', null, 'Caja de Brownies x 16'),
    ('38', '9810085000380', 'TODOS', 11.9, 'Pionono (caja x16)', null, 'Caja de Piononos x 16'),
    ('36', '9810085000366', 'TODOS', 9.9, 'Chocoalfajor', null, 'Caja Chocoalfajor x 8'),
    ('140', '9810085001400', 'TODOS', 39.9, 'Pionono Familiar', 'Familiar 20cm', 'Pionono familiar'),
    ('17', '9810085000175', 'TODOS', 7.9, 'Empanada de Carne', null, 'Empanada de carne'),
    ('18', '9810085000182', 'TODOS', 7.9, 'Empanada de Pollo', null, 'Empanada de pollo'),
    ('19', '9810085000199', 'TODOS', 8.9, 'Empanada de Jamón y Queso', null, 'Empanada de jamon y queso'),
    ('20', '9810085000205', 'TODOS', 8.9, 'Empanada de Pollo con Champiñón', null, 'Empanada de pollo con champiñon'),
    ('21', '9810085000212', 'TODOS', 8.9, 'Empanada Carnívora', null, 'Empanada carnivora'),
    ('22', '9810085000229', 'TODOS', 8.9, 'Empanada Cabanozzi', null, 'Empanada cabanossi'),
    ('23', '9810085000236', 'TODOS', 8.9, 'Empanada de Lomo', null, 'Empanada de lomo'),
    ('24', '9810085000243', 'TODOS', 8.9, 'Empanada de Ají de Gallina', null, 'Empanada de aji de gallina'),
    ('25', '9810085000250', 'TODOS', 8.9, 'Empanada 3 Quesos', null, 'Empanada tres quesos'),
    ('26', '9810085000267', 'TODOS', 8.9, 'Empanada Hawaiana', null, 'Empanada hawaiana'),
    ('187', null, 'TODOS', 12.9, 'Alfajor Mix', 'Caja x10', 'Caja Alfajor Mix  x 10'),
    ('33', '9810085000335', 'TODOS', 22.9, 'Alfajor Mix', 'Caja x18', 'Caja Alfajor Mix x 18'),
    ('27', '9810085000274', 'TODOS', 11.9, 'Alfajor con Lúcuma', 'Caja x10', 'Caja Alfajor con lucuma x 10'),
    ('28', '9810085000281', 'TODOS', 19.9, 'Alfajor con Lúcuma', 'Caja x18', 'Caja Alfajor con lucuma x 18'),
    ('29', '9810085000298', 'TODOS', 12.9, 'Alfajor con Nutella', 'Caja x10', 'Caja Alfajor con nutella x 10 ud.'),
    ('30', '9810085000304', 'TODOS', 22.9, 'Alfajor con Nutella', 'Caja x18', 'Caja Alfajor con nutella x 18'),
    ('31', '9810085000311', 'TODOS', 12.9, 'Alfajor con Pistacho', 'Caja x10', 'Caja Alfajor con pistacho x 10'),
    ('32', '9810085000328', 'TODOS', 22.9, 'Alfajor con Pistacho', 'Caja x18', 'Caja Alfajor con pistacho x 18'),
    ('34', '9810085000342', 'TODOS', 6.9, 'Alfajor con Manjar', 'Caja x10', 'Caja Alfajores con manjar x 10'),
    ('35', '9810085000359', 'TODOS', 11.9, 'Alfajor con Manjar', 'Caja x18', 'Caja Alfajores con manjar x 18'),
    ('110', '9810085001103', 'TODOS', 9.9, 'Red Velvet', 'Individual', 'Red velvet (porcion)'),
    ('141', '9810085001417', 'TODOS', 89.9, 'Red Velvet', 'Familiar 24cm', 'Red velvet familiar'),
    ('163', '9810085001639', 'TODOS', 49.9, 'Red Velvet', 'Mini 16cm', 'Mini Red Velvet'),
    ('120', '9810085001202', 'TODOS', 9.9, 'Carrot Cake', 'Individual', 'Carrot cake (porcion)'),
    ('131', '9810085001318', 'TODOS', 89.9, 'Carrot Cake', 'Familiar 24cm', 'Carrot cake familiar'),
    ('160', '9810085001608', 'TODOS', 49.9, 'Carrot Cake', 'Mini 16cm', 'Mini Carrot cake'),
    ('111', '9810085001110', 'TODOS', 6.9, 'Pie de Manzana', 'Individual', 'Pie de manzana (porción)'),
    ('139', '9810085001394', 'TODOS', 54.9, 'Pie de Manzana', 'Familiar 28cm', 'Pie de manzana familiar'),
    ('157', '9810085001578', 'TODOS', 35.9, 'Pie de Manzana', 'Mini 18cm', 'Mini Pie de Manzana'),
    ('112', '9810085001127', 'TODOS', 8.9, 'Pie de Limón', 'Individual', 'Pie de limon (porcion)'),
    ('138', '9810085001387', 'TODOS', 79.9, 'Pie de Limón', 'Familiar 28cm', 'Pie de limon familiar'),
    ('156', '9810085001561', 'TODOS', 49.9, 'Pie de Limón', 'Mini 18cm', 'Mini Pie de Limon'),
    ('116', '9810085001165', 'TODOS', 9.9, 'Crema Volteada', 'Individual', 'Crema volteada (porcion)'),
    ('135', '9810085001356', 'TODOS', 69.9, 'Crema Volteada', 'Familiar 26cm', 'Crema volteada familiar'),
    ('154', '9810085001547', 'TODOS', 39.9, 'Crema Volteada', 'Mini 20cm', 'Mini Crema Volteada'),
    ('117', '9810085001172', 'TODOS', 10.9, 'Cheesecake de Oreo', 'Individual', 'Cheesecake de oreo (porcion)'),
    ('132', '9810085001325', 'TODOS', 99.9, 'Cheesecake de Oreo', 'Familiar 24cm', 'Cheesecake de oreo familiar'),
    ('153', '9810085001530', 'TODOS', 59.9, 'Cheesecake de Oreo', 'Mini 18cm', 'Mini Cheesecake Oreo'),
    ('118', '9810085001189', 'TODOS', 9.9, 'Cheesecake de Maracuyá', 'Individual', 'Cheesecake de maracuya (porcion)'),
    ('134', '9810085001349', 'TODOS', 89.9, 'Cheesecake de Maracuyá', 'Familiar 24cm', 'Cheesecake maracuya familiar'),
    ('152', '9810085001523', 'TODOS', 49.9, 'Cheesecake de Maracuyá', 'Mini 18cm', 'Mini Cheesecake Maracuya'),
    ('119', '9810085001196', 'TODOS', 9.9, 'Cheesecake de Fresa', 'Individual', 'Cheesecake de fresa (porcion)'),
    ('133', '9810085001332', 'TODOS', 89.9, 'Cheesecake de Fresa', 'Familiar 24cm', 'Cheesecake fresa familiar'),
    ('151', '9810085001516', 'TODOS', 49.9, 'Cheesecake de Fresa', 'Mini 18cm', 'Mini Cheesecake Fresa'),
    ('122', '9810085001226', 'TODOS', 8.9, 'Tres Leches de Vainilla', 'Individual', 'Tres leches vainilla (porcion)'),
    ('123', '9810085001233', 'TODOS', 8.9, 'Tres Leches de Chocolate', 'Individual', 'Tres leches de chocolate (porcion)'),
    ('106', '9810085001066', 'TODOS', 8.9, 'Torta de Chocolate con Manjar', 'Individual', 'Torta de chocolate (porcion)'),
    ('145', '9810085001455', 'TODOS', 79.9, 'Torta de Chocolate con Manjar', 'Familiar 24cm', 'Torta de chocolate familiar'),
    ('162', '9810085001622', 'TODOS', 48.5, 'Torta de Chocolate con Manjar', 'Mini 16cm', 'Mini Torta de Chocolate'),
    ('159', '9810085001592', 'TODOS', 48.5, 'Torta Tres Leches Chocolate', 'Mini 16cm', 'Mini Torta tres leches chocolate'),
    ('161', '9810085001615', 'TODOS', 48.5, 'Torta de Alfajor', 'Mini 16cm', 'Mini Torta de Alfajor'),
    ('188', null, 'TODOS', 49.9, 'Torta Selva Negra', 'Mini 16cm', 'Mini Selva negra'),
    ('114', '9810085001141', 'TODOS', 10.9, 'Mil Hojas', '200g', 'Milhojas 200 gr'),
    ('113', '9810085001134', 'TODOS', 22.9, 'Mil Hojas', '500g', 'Milhojas 500 gr'),
    ('136', '9810085001363', 'TODOS', 49.9, 'Mil Hojas', '1kg', 'Milhojas familiar 1kg');

  create temp table _mf_combos (combo text not null, precio numeric(10,2) not null, nombre_mifact text not null) on commit drop;
  insert into _mf_combos (combo, precio, nombre_mifact) values
    ('Combo para ti', 15.9, 'Combo para ti'),
    ('Combo Ideal', 13.9, 'Combo ideal'),
    ('Pie Pack', 12.9, 'PiePack'),
    ('Tortipack', 14.9, 'TortiPack'),
    ('Pack Petitbro', 19.9, 'Petitbro'),
    ('Pack Trio Imperdible', 32.9, 'Trio Imperdible'),
    ('Pack Postres de Locura', 29.9, 'Pack postres de locura'),
    ('Pack Trio Cheesebake', 25.9, 'Pack Trio Cheesebake');

  -- Destino de cada fila: el producto (tamano null) o el tamaño del producto.
  create temp table _mf_destino on commit drop as
  select v.*, p.id as product_id, ps.id as product_size_id
    from _mf v
    join products p on p.nombre = v.producto
    left join product_sizes ps on ps.product_id = p.id and ps.tamano = v.tamano
   where v.tamano is null or ps.id is not null;

  select (select count(*) from _mf) - (select count(*) from _mf_destino) into fallos;
  if fallos <> 0 then
    raise exception 'Mifact: % emparejamientos no encuentran su producto o tamaño en el catálogo (se cancela todo)', fallos;
  end if;
  select count(*) - count(distinct codigo) into fallos from _mf_destino;
  if fallos <> 0 then raise exception 'Mifact: un código aparece emparejado a dos productos'; end if;
  select count(*) - count(distinct coalesce(product_size_id, product_id)) into fallos from _mf_destino;
  if fallos <> 0 then raise exception 'Mifact: dos códigos apuntan al mismo producto o tamaño'; end if;

  -- 2. Precios (con IGV). Un tamaño cambia el precio del tamaño; un producto sin tamaño, su precio base.
  update product_sizes ps set precio = d.precio
    from _mf_destino d
   where d.product_size_id = ps.id and ps.precio is distinct from d.precio;
  get diagnostics cambios = row_count;
  raise notice 'Mifact: % precios de tamaños cambiados', cambios;

  update products p set precio_base = d.precio
    from _mf_destino d
   where d.product_size_id is null and d.product_id = p.id and p.precio_base is distinct from d.precio;
  get diagnostics cambios = row_count;
  raise notice 'Mifact: % precios de productos cambiados', cambios;

  -- 3. Códigos: nunca pisa uno que ya exista.
  insert into mifact_codigos (product_id, product_size_id, almacen, codigo, codigo_barras)
  select case when d.product_size_id is null then d.product_id end, d.product_size_id, d.almacen, d.codigo, d.barras
    from _mf_destino d
  on conflict do nothing;

  select count(*) into fallos
    from _mf_destino d
   where not exists (
     select 1 from mifact_codigos c
      where c.codigo = d.codigo and c.almacen = d.almacen
        and c.product_id is not distinct from (case when d.product_size_id is null then d.product_id end)
        and c.product_size_id is not distinct from d.product_size_id
   );
  if fallos <> 0 then
    raise exception 'Mifact: % códigos no se pudieron guardar porque ya existe otro para ese producto o ese código (se cancela todo)', fallos;
  end if;

  -- 4. Combos con el mismo nombre en Mifact y aquí: precio oficial de Mifact.
  select count(*) into fallos from _mf_combos v where not exists (select 1 from combos c where c.nombre = v.combo);
  if fallos <> 0 then raise exception 'Mifact: % combos no existen en el catálogo', fallos; end if;
  update combos c set precio_promo = v.precio from _mf_combos v where c.nombre = v.combo and c.precio_promo is distinct from v.precio;
  get diagnostics cambios = row_count;
  raise notice 'Mifact: % precios de combos cambiados', cambios;
end
$migracion$;

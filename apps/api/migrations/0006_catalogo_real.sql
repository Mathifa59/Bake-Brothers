-- ============================================================================
-- 0006_catalogo_real — carga el catálogo real de Bake Brothers
--
-- Fuente: docs/catalogo-real-bake-brothers.md (Carta Interna v1.1, Guía de
-- Conocimiento de Producto v5.1, Guía Comercial de Combos v2.0, Guía de
-- Agendamiento de Catering v2.0, Ficha de Información). No se inventó ningún
-- precio, ingrediente ni alérgeno que no estuviera en esa fuente — lo no
-- confirmado queda NULL o con una nota "confirmar" tal cual la fuente.
--
-- Contradicciones encontradas contra el esquema de 0001/0004 (se resuelven
-- aquí, ver detalle en cada bloque):
--   1. product_sizes.factor asumía Personal/Mediano/Grande con un factor
--      multiplicador sobre precio_base. El catálogo real tiene precios
--      absolutos por tamaño, sin relación de factor consistente, y con
--      etiquetas de tamaño heterogéneas por producto (cm, peso, "caja x_").
--      → se agrega product_sizes.precio (precio absoluto) y se libera
--      tamano de su CHECK fijo. `factor` queda nullable, sin usarse en
--      productos nuevos.
--   2. products.categoria_negocio no contemplaba 'bebidas'. → se amplía.
--   3. products.anticipacion_horas/anticipacion_texto eran NOT NULL, pero el
--      catálogo real no especifica anticipación por producto de tienda (solo
--      para catering, que es un modelo aparte — ver nota al final). → se
--      liberan a nullable; quedan NULL en todo este seed.
--   4. products no tenía dónde guardar ingredientes/alérgenos/respuesta
--      rápida (insumo para el RAG de Semana 2). → se agregan 3 columnas.
--   5. combo_items no podía referenciar un tamaño específico dentro de un
--      combo (p.ej. "1 milhojas 200g"). → se agrega product_size_id
--      (nullable, mismo patrón que ya usa `stock`).
-- ============================================================================


-- ============================================================================
-- 0. Ajustes de esquema requeridos por el catálogo real
-- ============================================================================

-- 0.a — categoria_negocio: el nombre del CHECK no se verificó nunca contra un
-- Postgres real (mismo riesgo que orders.canal en 0004) — se busca y borra
-- por su nombre real en vez de asumirlo.
do $$
declare
  nombre_constraint text;
begin
  select con.conname into nombre_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_attribute att
    on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
  where rel.relname = 'products'
    and con.contype = 'c'
    and att.attname = 'categoria_negocio'
    and array_length(con.conkey, 1) = 1;

  if nombre_constraint is not null then
    execute format('alter table products drop constraint %I', nombre_constraint);
  else
    raise notice 'No se encontró un CHECK existente sobre products.categoria_negocio — se crea uno nuevo sin borrar nada.';
  end if;
end $$;

alter table products add constraint products_categoria_negocio_check
  check (categoria_negocio in ('dulces', 'salados', 'bebidas', 'catering'));

-- 0.b — product_sizes.tamano: el catálogo real usa etiquetas heterogéneas
-- (cm, peso, "caja x10/x18", "Individual") que no encajan en un enum fijo de
-- 3 valores. Se retira el CHECK — el tamaño pasa a ser texto libre.
do $$
declare
  nombre_constraint text;
begin
  select con.conname into nombre_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_attribute att
    on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
  where rel.relname = 'product_sizes'
    and con.contype = 'c'
    and att.attname = 'tamano'
    and array_length(con.conkey, 1) = 1;

  if nombre_constraint is not null then
    execute format('alter table product_sizes drop constraint %I', nombre_constraint);
  else
    raise notice 'No se encontró un CHECK existente sobre product_sizes.tamano.';
  end if;
end $$;

-- 0.c — product_sizes: precio absoluto por tamaño (reemplaza al factor para
-- productos con precio real). factor queda nullable: ya no aplica aquí, pero
-- no se borra por si algún producto futuro sí quiere el modelo por factor.
alter table product_sizes add column precio numeric(10, 2);
alter table product_sizes alter column factor drop not null;

-- 0.d — products: ingredientes/alérgenos/respuesta rápida (RAG, Semana 2) y
-- anticipación nullable (no hay dato por producto de tienda en la fuente).
alter table products add column ingredientes text;
alter table products add column alergenos text;
alter table products add column respuesta_rapida text;
alter table products alter column anticipacion_horas drop not null;
alter table products alter column anticipacion_texto drop not null;

-- 0.e — combo_items: tamaño específico dentro de un combo (p.ej. "milhojas
-- 200g" vs "milhojas 500g"). Mismo patrón que product_id + product_size_id
-- opcional en `stock`.
alter table combo_items add column product_size_id uuid references product_sizes(id);


-- ============================================================================
-- 1. Limpieza del catálogo mock de 0002 (no se toca 0002 en sí — ver
--    CLAUDE.md: el seed original queda como historial de migraciones)
-- ============================================================================
-- product_sizes cae en cascada (on delete cascade en su FK a products).
-- Los combos/combo_items/reglas_catering de 0004 seguían vacíos — no hay
-- conflicto de FK al borrar productos.
delete from products where tenant_id = (select id from tenants where slug = 'bake-brothers');
delete from categories where tenant_id = (select id from tenants where slug = 'bake-brothers');


-- ============================================================================
-- 2. Categorías reales (8, reemplazan a las 6 genéricas del mock)
-- ============================================================================
insert into categories (tenant_id, slug, nombre, tipo_producto, orden)
select t.id, v.slug, v.nombre, v.tipo_producto, v.orden
from (values
  ('tortas-y-kekes',    'Tortas y Kekes',    'Tortas y Kekes',    0),
  ('postres',           'Postres',           'Postres',           1),
  ('postres-en-caja',   'Postres en Caja',   'Postres en Caja',   2),
  ('alfajores',         'Alfajores',         'Alfajores',         3),
  ('empanadas',         'Empanadas',         'Empanadas',         4),
  ('sandwiches',        'Sándwiches',        'Sándwiches',        5),
  ('cajitas-dulces',    'Cajitas Dulces',    'Cajitas Dulces',    6),
  ('bebidas',           'Bebidas',           'Bebidas',           7)
) as v(slug, nombre, tipo_producto, orden)
cross join (select id from tenants where slug = 'bake-brothers') as t;


-- ============================================================================
-- 3. Productos reales (58)
-- ============================================================================
-- Nota de ambigüedad (Empanadas BigBro): la Guía de Producto nombra estas 10
-- empanadas distinto a como la Carta Interna las lista. Se asumió que son el
-- mismo producto 1 a 1 en el orden en que aparecen en ambos documentos — no
-- confirmado explícitamente. Ver resumen de la sesión.
--
-- Nota (mayor margen / a posicionar, Ficha de Información): tortas familiares
-- (chocolate, red velvet, carrot cake, crema volteada, pie de limón, pie de
-- manzana) están marcadas como prioridad comercial. No se modela como columna
-- — es guía de venta para el bot/dashboard (Semana 2-3), no un atributo de
-- catálogo.
insert into products (
  tenant_id, category_id, slug, nombre, categoria_negocio, tipo, precio_base,
  descripcion, ingredientes, alergenos, respuesta_rapida, porciones, popular,
  anticipacion_horas, anticipacion_texto, orden
)
select
  t.id, c.id, v.slug, v.nombre, v.categoria_negocio, v.tipo, v.precio_base,
  v.descripcion, v.ingredientes, v.alergenos, v.respuesta_rapida, v.porciones, v.popular,
  null, null, v.orden
from (values
  -- ——— Tortas y Kekes ———
  (1, 'torta-carrot-cake', 'Carrot Cake', 'dulces', 'Tortas y Kekes', 9.90, false,
    'Torta de zanahoria especiada, esponjosa y firme, con pasas, pecanas y frosting.',
    'Harina, zanahoria, pasas, pecanas, azúcar, aceite, canela, huevos, agua. Relleno/cobertura: frosting de queso crema, margarina, azúcar impalpable, limón.',
    'Gluten, huevo, lácteos, frutos secos (pecanas).',
    'Torta de zanahoria con canela, pasas y pecanas, cubierta con frosting de queso crema.',
    null),
  (2, 'torta-chocolate-manjar', 'Torta de Chocolate con Manjar', 'dulces', 'Tortas y Kekes', 8.90, false,
    'Bizcocho de chocolate esponjoso, relleno con manjar, terminado con fudge.',
    'Harina, cocoa, azúcar, aceite, huevos, leche, agua, vainilla, vinagre. Relleno/cobertura: manjar y fudge.',
    'Gluten, huevo, lácteos.',
    'Bizcocho de chocolate relleno con manjar y terminado con fudge.',
    null),
  (3, 'torta-red-velvet', 'Red Velvet', 'dulces', 'Tortas y Kekes', 9.90, false,
    'Bizcocho rojizo con yogurt de vainilla, esponjoso y firme.',
    'Harina, yogurt de vainilla, margarina, huevos, azúcar, polvo de hornear, bicarbonato, colorante. Relleno/cobertura: frosting de queso crema, margarina, azúcar impalpable, limón.',
    'Gluten, huevo, lácteos.',
    'Es un bizcocho rojo, suave y esponjoso, elaborado con yogurt de vainilla.',
    null),
  (4, 'torta-selva-negra', 'Torta Selva Negra', 'dulces', 'Tortas y Kekes', 49.90, false,
    null, null, null, null, null), -- pendiente ficha (solo en Carta Interna, sin Guía de Producto — confirmar con el cliente)
  (5, 'torta-alfajor', 'Torta de Alfajor', 'dulces', 'Tortas y Kekes', 48.50, false,
    null, null, null, null, null), -- pendiente ficha; solo Mini, sin presentación familiar
  (6, 'torta-tres-leches-chocolate', 'Torta Tres Leches Chocolate', 'dulces', 'Tortas y Kekes', 48.50, false,
    null, null, null, null, null), -- ambigüedad sin resolver con el postre "Tres Leches de Chocolate" — ver resumen
  (7, 'pionono-familiar', 'Pionono Familiar', 'dulces', 'Tortas y Kekes', 39.90, false,
    'Bizcocho suave enrollado, relleno con manjar.',
    'Huevos, azúcar, maicena, vainilla, leche, manjar, manteca.',
    'Huevo, lácteos.',
    null, null), -- ficha reutilizada de "Pionono" (Postres en Caja): la fuente remite a esa ficha para la versión familiar
  (8, 'mil-hojas', 'Mil Hojas', 'dulces', 'Tortas y Kekes', 10.90, false,
    null, null, null, null, null), -- sin ficha en la fuente; se vende por peso (200g/500g/1kg)

  -- ——— Postres ———
  (9, 'tres-leches-vainilla', 'Tres Leches de Vainilla', 'dulces', 'Postres', 8.90, false,
    'Bizcocho humedecido con tres leches, con manjar y chantilly.',
    'Huevos, azúcar, harina, maicena, aceite, manjar, mezcla de tres leches, chantilly.',
    'Gluten, huevo, lácteos.',
    'Bizcocho humedecido con tres leches, con manjar y chantilly.',
    null),
  (10, 'tres-leches-chocolate', 'Tres Leches de Chocolate', 'dulces', 'Postres', 8.90, false,
    'Tres leches de chocolate con manjar, chantilly y fudge.',
    'Huevos, azúcar, harina, maicena, aceite, manjar, tres leches de chocolate, chantilly, fudge.',
    'Gluten, huevo, lácteos.',
    'Tres leches de chocolate con manjar, chantilly y fudge.',
    null), -- la fuente solo da precio de porción individual para este postre
  (11, 'crema-volteada', 'Crema Volteada', 'dulces', 'Postres', 9.90, false,
    'Crema volteada clásica de huevo y leche, con caramelo.',
    'Huevos, leche condensada, leche evaporada, azúcar.',
    'Huevo, lácteos.',
    'Crema volteada clásica de huevo y leche, con caramelo.',
    'Mini 20cm (6-10 porciones) · Familiar 26cm (10-20 porciones)'),
  (12, 'pie-limon', 'Pie de Limón', 'dulces', 'Postres', 8.90, false,
    'Base de galleta, relleno cremoso de limón y merengue.',
    'Galleta de vainilla, margarina, limón, leche condensada, huevos, azúcar, cremor tártaro.',
    'Huevo, lácteos (posible gluten por la galleta, confirmar ficha del insumo).',
    'Base de galleta, relleno cremoso de limón y merengue.',
    'Mini 18cm (6-10 porciones) · Familiar 28cm (12-24 porciones)'),
  (13, 'pie-manzana', 'Pie de Manzana', 'dulces', 'Postres', 6.90, false,
    'Pie de manzana con canela, masa dorada y relleno frutal.',
    'Masa quebrada, manzana, azúcar, canela, harina (pintado con huevo).',
    'Gluten, huevo.',
    'Pie de manzana con canela, masa dorada y relleno frutal.',
    'Mini 18cm (6-10 porciones) · Familiar 28cm (12-24 porciones)'),
  (14, 'cheesecake-fresa', 'Cheesecake de Fresa', 'dulces', 'Postres', 9.90, false,
    'Cheesecake cremoso de fresa sobre base de galleta, con fresa y chantilly.',
    'Queso crema, leche condensada, crema de leche, colapiz, yogurt de fresa, base de galleta, fresa.',
    'Lácteos (posible gluten por la base, confirmar).',
    'Cheesecake cremoso de fresa sobre base de galleta, con fresa y chantilly.',
    'Mini 18cm (6-10 porciones) · Familiar 24cm (12-20 porciones)'),
  (15, 'cheesecake-maracuya', 'Cheesecake de Maracuyá', 'dulces', 'Postres', 9.90, false,
    'Cheesecake cremoso de maracuyá con base de galleta, jalea y chantilly.',
    'Queso crema, leche condensada, crema de leche, colapiz, zumo de maracuyá, base de galleta, jalea.',
    'Lácteos (posible gluten por la base, confirmar).',
    'Cheesecake cremoso de maracuyá con base de galleta, jalea y chantilly.',
    'Mini 18cm (6-10 porciones) · Familiar 24cm (12-20 porciones)'),
  (16, 'cheesecake-oreo', 'Cheesecake de Oreo', 'dulces', 'Postres', 10.90, false,
    'Cheesecake cremoso de Oreo con base de galleta, chantilly y chocolate blanco.',
    'Queso crema, leche condensada, crema de leche, colapiz, crema de Oreo, base de galleta.',
    'Lácteos (posible gluten por la galleta/Oreo, confirmar).',
    'Cheesecake cremoso de Oreo con base de galleta, chantilly y chocolate blanco.',
    'Mini 18cm (6-10 porciones) · Familiar 24cm (12-20 porciones)'),
  (17, 'tartaleta-frutas', 'Tartaleta de Frutas', 'dulces', 'Postres', 7.90, false,
    'Tartaleta de fresas, o fresas con arándanos, sujeto a stock.', null, null, null, null),
  (18, 'cupcakes-artesanal', 'Cupcakes Artesanal', 'dulces', 'Postres', 8.90, false,
    null, null, null, null, null),
  (19, 'cuchareable', 'Cuchareable', 'dulces', 'Postres', 15.90, true,
    'Postre en vaso de 16oz. Sabores: chocolate con manjar blanco, chocolate con manjar de lúcuma, chocolate con Nutella, chocolate Princesa, alfajor.',
    null, null, null, null),

  -- ——— Postres en Caja ———
  (20, 'pionono-caja', 'Pionono (caja x16)', 'dulces', 'Postres en Caja', 11.90, false,
    'Bizcocho suave enrollado, relleno con manjar.',
    'Huevos, azúcar, maicena, vainilla, leche, manjar, manteca.',
    'Huevo, lácteos.',
    null, '16 unidades (~4cm c/u)'),
  (21, 'brownie-caja', 'Brownie (caja x16)', 'dulces', 'Postres en Caja', 11.90, false,
    'Brownie con cocoa, chocolate bitter y castañas.',
    'Huevos, harina, cocoa, castañas, azúcar rubia, azúcar blanca, chocolate bitter.',
    'Gluten, huevo, frutos secos (castañas).',
    null, '16 unidades (~4cm c/u)'),

  -- ——— Alfajores ⭐ (producto estrella) ———
  (22, 'alfajor-manjar', 'Alfajor con Manjar', 'dulces', 'Alfajores', 6.90, true,
    'Alfajor de maicena con galletas suaves, relleno de manjar.',
    'Manteca, margarina, harina, azúcar impalpable, maicena, esencia de vainilla. Relleno: manjar.',
    'Gluten; posibles lácteos según relleno (confirmar por insumo compuesto).',
    null, null),
  (23, 'alfajor-pistacho', 'Alfajor con Pistacho', 'dulces', 'Alfajores', 12.90, false,
    'Alfajor de maicena con galletas suaves, relleno de pistacho.',
    'Manteca, margarina, harina, azúcar impalpable, maicena, esencia de vainilla. Relleno: pistacho.',
    'Gluten; posibles lácteos/frutos secos según relleno (confirmar por insumo compuesto).',
    null, null),
  (24, 'alfajor-lucuma', 'Alfajor con Lúcuma', 'dulces', 'Alfajores', 11.90, false,
    'Alfajor de maicena con galletas suaves, relleno de lúcuma.',
    'Manteca, margarina, harina, azúcar impalpable, maicena, esencia de vainilla. Relleno: lúcuma.',
    'Gluten; posibles lácteos según relleno (confirmar por insumo compuesto).',
    null, null),
  (25, 'alfajor-nutella', 'Alfajor con Nutella', 'dulces', 'Alfajores', 12.90, false,
    'Alfajor de maicena con galletas suaves, relleno de Nutella.',
    'Manteca, margarina, harina, azúcar impalpable, maicena, esencia de vainilla. Relleno: Nutella.',
    'Gluten; posibles lácteos/frutos secos según relleno (confirmar por insumo compuesto).',
    null, null),
  (26, 'alfajor-mix', 'Alfajor Mix', 'dulces', 'Alfajores', 12.90, true,
    'Caja surtida de alfajores en varios rellenos.',
    'Manteca, margarina, harina, azúcar impalpable, maicena, esencia de vainilla. Rellenos surtidos.',
    'Gluten; posibles lácteos/frutos secos según relleno (confirmar por insumo compuesto).',
    null, null),

  -- ——— Empanadas "BigBro" ⭐ (producto estrella, la línea completa) ———
  (27, 'empanada-pollo', 'Empanada de Pollo', 'salados', 'Empanadas', 7.90, true,
    null,
    'Masa: manteca, margarina, azúcar rubia, harina de pastelería, agua, sal. Relleno: filete de pollo, cebolla, aceite, sal, pimienta, ajo, sillao con champiñones, perejil, ají amarillo.',
    'Gluten (masa); sillao: confirmar ficha.',
    null, null),
  (28, 'empanada-carne', 'Empanada de Carne', 'salados', 'Empanadas', 7.90, true,
    null,
    'Masa: manteca, margarina, azúcar rubia, harina de pastelería, agua, sal. Relleno: carne molida, cebolla, aceite, sal, pimienta, orégano.',
    'Gluten (masa).',
    null, null),
  (29, 'empanada-jamon-queso', 'Empanada de Jamón y Queso', 'salados', 'Empanadas', 8.90, true,
    null,
    'Masa: manteca, margarina, azúcar rubia, harina de pastelería, agua, sal. Relleno: jamón, queso dambo.',
    'Gluten (masa), lácteos; jamón: confirmar ficha.',
    null, null),
  (30, 'empanada-aji-gallina', 'Empanada de Ají de Gallina', 'salados', 'Empanadas', 8.90, true,
    null,
    'Masa: manteca, margarina, azúcar rubia, harina de pastelería, agua, sal. Relleno: pechuga de pollo, ajo molido, ají amarillo, cebolla, aceite, comino, pimienta, sal, pan duro, leche evaporada, huevo.',
    'Gluten (masa), huevo, lácteos.',
    null, null),
  (31, 'empanada-cabanossi', 'Empanada Cabanozzi', 'salados', 'Empanadas', 8.90, true,
    null,
    'Masa: manteca, margarina, azúcar rubia, harina de pastelería, agua, sal. Relleno: cabanozzi, queso dambo, jamón.',
    'Gluten (masa), lácteos; cabanozzi/jamón: confirmar ficha.',
    null, null),
  (32, 'empanada-hawaiana', 'Empanada Hawaiana', 'salados', 'Empanadas', 8.90, true,
    null,
    'Masa: manteca, margarina, azúcar rubia, harina de pastelería, agua, sal. Relleno: jamón, queso dambo, piña, orégano.',
    'Gluten (masa), lácteos; jamón: confirmar ficha.',
    null, null),
  (33, 'empanada-carnivora', 'Empanada Carnívora', 'salados', 'Empanadas', 8.90, true,
    null,
    'Masa: manteca, margarina, azúcar rubia, harina de pastelería, agua, sal. Relleno: chorizo, hot dog, tocino, lomito ahumado.',
    'Gluten (masa); embutidos: confirmar fichas.',
    null, null),
  (34, 'empanada-3-quesos', 'Empanada 3 Quesos', 'salados', 'Empanadas', 8.90, true,
    null,
    'Masa: manteca, margarina, azúcar rubia, harina de pastelería, agua, sal. Relleno: queso dambo, queso mozzarella, queso fresco, orégano.',
    'Gluten (masa), lácteos.',
    null, null),
  (35, 'empanada-lomo', 'Empanada de Lomo', 'salados', 'Empanadas', 8.90, true,
    null,
    'Masa: manteca, margarina, azúcar rubia, harina de pastelería, agua, sal. Relleno: wachalomo, aceite, ajo molido, sal, pimienta, comino, cebolla, sillao.',
    'Gluten (masa); sillao: confirmar ficha.',
    null, null),
  (36, 'empanada-pollo-champinon', 'Empanada de Pollo con Champiñón', 'salados', 'Empanadas', 8.90, true,
    null,
    'Masa: manteca, margarina, azúcar rubia, harina de pastelería, agua, sal. Relleno: filete de pollo, champiñón, sal, pimienta, comino, aceite, leche evaporada, harina de trigo, ajo molido, ajonjolí.',
    'Gluten (masa y relleno), lácteos, ajonjolí.',
    null, null),

  -- ——— Sándwiches (sin ficha de ingredientes/alérgenos en la fuente) ———
  (37, 'sandwich-triple-pollo-jamon-queso', 'Triple de pollo, jamón y queso', 'salados', 'Sándwiches', 11.90, false,
    null, null, null, null, null),
  (38, 'sandwich-triple-palta-tomate-huevo', 'Triple de palta, tomate y huevo', 'salados', 'Sándwiches', 12.90, false,
    null, null, null, null, null),
  (39, 'croissant-pollo', 'Croissant con pollo', 'salados', 'Sándwiches', 13.90, false,
    null, null, null, null, null),
  (40, 'croissant-mixto', 'Croissant mixto', 'salados', 'Sándwiches', 12.90, false,
    null, null, null, null, null),
  (41, 'ciabatta-pollo', 'Ciabatta con pollo', 'salados', 'Sándwiches', 9.90, false,
    null, null, null, null, null),
  (42, 'mixto-jamon-queso', 'Mixto de jamón y queso', 'salados', 'Sándwiches', 9.90, false,
    null, null, null, null, null),

  -- ——— Cajitas Dulces ———
  (43, 'chocoalfajor', 'Chocoalfajor', 'dulces', 'Cajitas Dulces', 9.90, false,
    'Alfajor de manjar cubierto en chocolate. Presentación: 8 unidades.', null, null, null, null),
  (44, 'trufas', 'Trufas', 'dulces', 'Cajitas Dulces', 7.90, false,
    'Presentación: 4 unidades.', null, null, null, null),
  (45, 'mix-lite', 'Mix Lite', 'dulces', 'Cajitas Dulces', 7.90, false,
    'Presentación: 9 unidades.', null, null, null, null),

  -- ——— Bebidas ———
  (46, 'agua-mineral', 'Agua mineral', 'bebidas', 'Bebidas', 4.00, false, null, null, null, null, null),
  (47, 'inka-kola', 'Inka Kola', 'bebidas', 'Bebidas', 5.00, false, 'Normal o zero.', null, null, null, null),
  (48, 'coca-cola', 'Coca-Cola', 'bebidas', 'Bebidas', 5.00, false, 'Normal o zero.', null, null, null, null),
  (49, 'cafe-americano', 'Café americano', 'bebidas', 'Bebidas', 6.00, false, null, null, null, null, null),
  (50, 'refresher', 'Refresher', 'bebidas', 'Bebidas', 9.90, false,
    'Sabores: fresa, arándanos, aguaymanto, mango, maracuyá.', null, null, null, null),
  (51, 'frappe', 'Frappé', 'bebidas', 'Bebidas', 13.90, false, null, null, null, null, null),
  (52, 'frappe-oreo', 'Frappé de Oreo', 'bebidas', 'Bebidas', 15.90, false, null, null, null, null, null),
  (53, 'infusiones', 'Infusiones', 'bebidas', 'Bebidas', 4.00, false, null, null, null, null, null),
  (54, 'kero-300ml', 'Kero 300ml', 'bebidas', 'Bebidas', 5.00, false, null, null, null, null, null),
  (55, 'jugo', 'Jugo', 'bebidas', 'Bebidas', 9.00, false,
    'Sabores: fresa, piña, mango, papaya, lúcuma.', null, null, null, null),
  (56, 'jugo-surtido', 'Jugo surtido', 'bebidas', 'Bebidas', 11.00, false, null, null, null, null, null),
  (57, 'helado-1-bola', 'Helado 1 bola', 'bebidas', 'Bebidas', 7.00, false,
    'Sabores: fresa, chocolate, vainilla.', null, null, null, null),
  (58, 'helado-2-bolas', 'Helado 2 bolas', 'bebidas', 'Bebidas', 12.00, false, null, null, null, null, null)
) as v(
  orden, slug, nombre, categoria_negocio, tipo, precio_base, popular,
  descripcion, ingredientes, alergenos, respuesta_rapida, porciones
)
cross join (select id from tenants where slug = 'bake-brothers') as t
left join categories c on c.tenant_id = t.id and c.tipo_producto = v.tipo;


-- ============================================================================
-- 4. Tamaños con precio real (solo productos con más de una presentación)
-- ============================================================================
insert into product_sizes (tenant_id, product_id, tamano, precio)
select t.id, p.id, v.tamano, v.precio
from (values
  ('torta-carrot-cake', 'Individual', 9.90),
  ('torta-carrot-cake', 'Mini 16cm', 49.90),
  ('torta-carrot-cake', 'Familiar 24cm', 89.90),
  ('torta-chocolate-manjar', 'Individual', 8.90),
  ('torta-chocolate-manjar', 'Mini 16cm', 48.50),
  ('torta-chocolate-manjar', 'Familiar 24cm', 79.90),
  ('torta-red-velvet', 'Individual', 9.90),
  ('torta-red-velvet', 'Mini 16cm', 49.90),
  ('torta-red-velvet', 'Familiar 24cm', 89.90),
  ('torta-selva-negra', 'Mini 16cm', 49.90),
  ('torta-selva-negra', 'Familiar 24cm', 89.90),
  ('torta-alfajor', 'Mini 16cm', 48.50),
  ('torta-tres-leches-chocolate', 'Mini 16cm', 48.50),
  ('pionono-familiar', 'Familiar 20cm', 39.90),
  ('mil-hojas', '200g', 10.90),
  ('mil-hojas', '500g', 22.90),
  ('mil-hojas', '1kg', 49.90),
  ('tres-leches-vainilla', 'Individual', 8.90),
  ('tres-leches-vainilla', 'Mini 16cm', 48.50),
  ('tres-leches-vainilla', 'Familiar 24cm', 79.90),
  ('tres-leches-chocolate', 'Individual', 8.90),
  ('crema-volteada', 'Individual', 9.90),
  ('crema-volteada', 'Mini 20cm', 39.90),
  ('crema-volteada', 'Familiar 26cm', 69.90),
  ('pie-limon', 'Individual', 8.90),
  ('pie-limon', 'Mini 18cm', 49.90),
  ('pie-limon', 'Familiar 28cm', 79.90),
  ('pie-manzana', 'Individual', 6.90),
  ('pie-manzana', 'Mini 18cm', 35.90),
  ('pie-manzana', 'Familiar 28cm', 54.90),
  ('cheesecake-fresa', 'Individual', 9.90),
  ('cheesecake-fresa', 'Mini 18cm', 49.90),
  ('cheesecake-fresa', 'Familiar 24cm', 89.90),
  ('cheesecake-maracuya', 'Individual', 9.90),
  ('cheesecake-maracuya', 'Mini 18cm', 49.90),
  ('cheesecake-maracuya', 'Familiar 24cm', 89.90),
  ('cheesecake-oreo', 'Individual', 10.90),
  ('cheesecake-oreo', 'Mini 18cm', 59.90),
  ('cheesecake-oreo', 'Familiar 24cm', 99.90),
  ('alfajor-manjar', 'Caja x10', 6.90),
  ('alfajor-manjar', 'Caja x18', 11.90),
  ('alfajor-pistacho', 'Caja x10', 12.90),
  ('alfajor-pistacho', 'Caja x18', 22.90),
  ('alfajor-lucuma', 'Caja x10', 11.90),
  ('alfajor-lucuma', 'Caja x18', 19.90),
  ('alfajor-nutella', 'Caja x10', 12.90),
  ('alfajor-nutella', 'Caja x18', 22.90),
  ('alfajor-mix', 'Caja x10', 12.90),
  ('alfajor-mix', 'Caja x18', 22.90)
) as v(slug, tamano, precio)
cross join (select id from tenants where slug = 'bake-brothers') as t
join products p on p.slug = v.slug and p.tenant_id = t.id;


-- ============================================================================
-- 5. Extras: ajuste contra la ficha real
-- ============================================================================
-- Dedicatorias hasta 8 palabras son gratis según la Ficha de Información —
-- el extra pagado de S/8 "Dedicatoria personalizada" (del mock anterior) ya
-- no aplica. Se desactiva, no se borra (conserva el historial del extra que
-- pudo haberse usado en pedidos ya registrados).
update extras set activo = false
where tenant_id = (select id from tenants where slug = 'bake-brothers') and slug = 'dedicatoria';

-- 'vela' y 'decoracion-especial' no están confirmados ni contradichos en la
-- fuente real — se dejan como estaban (no se tocan sin evidencia).
insert into extras (tenant_id, slug, nombre, precio, activo)
values
  ((select id from tenants where slug = 'bake-brothers'), 'topper-feliz-cumpleanos', 'Topper "feliz cumpleaños"', 7.90, true),
  ((select id from tenants where slug = 'bake-brothers'), 'jugo-con-leche', 'Jugo + leche (adicional)', 2.00, true)
on conflict (tenant_id, slug) do update set nombre = excluded.nombre, precio = excluded.precio, activo = excluded.activo;


-- ============================================================================
-- 6. Combos y promociones (13 vigentes)
-- ============================================================================
insert into combos (nombre, precio_normal, precio_promo, canal_permitido, permite_cambios, condicion_texto)
values
  ('Pack Tres Delicias', 34.70, 30.90, 'ambos', false, 'Sujeto a stock.'),
  ('Pie Pack', 15.80, 12.90, 'ambos', false, 'Sujeto a stock.'),
  ('Pack Petitbro', 24.00, 19.90, 'ambos', false, '12 mini empanadas variadas — sabores sujetos a stock.'),
  ('Pack 6 empanadas', 53.40, 49.90, 'ambos', false, '6 empanadas grandes — sabores sujetos a stock.'),
  ('Pack 12 empanadas', 106.80, 79.90, 'ambos', false, '12 empanadas grandes — sabores sujetos a stock.'),
  ('Pack Postres de Locura', 33.60, 28.90, 'ambos', false, 'Sujeto a stock.'),
  ('Combo Ideal', 14.90, 13.90, 'presencial', true, 'Torta: elegir entre carrot cake, chocolate o red velvet (porción individual).'),
  ('Combo Perfecto', 24.80, 21.80, 'presencial', false, 'Empanada: sabor sujeto a stock.'),
  ('Combo para ti', 17.80, 15.90, 'presencial', false, 'Refresher: sabor sujeto a stock.'),
  ('Combo Horneamos con amor', 85.80, 69.90, 'ambos', true, 'Incluye 15 mini empanadas variadas (sabor sujeto a stock). El milhojas 500g es reemplazable por 11 mini empanadas más.'),
  ('Tortipack', 18.80, 16.00, 'ambos', true, 'Puede llevar ambas porciones del mismo sabor (chocolate o carrot cake). Sujeto a stock.'),
  ('Pack Trio Cheesebake', 30.70, 25.90, 'ambos', true, 'Puede llevar 2 porciones del mismo sabor, excepto repetir Oreo. Sujeto a stock.'),
  ('Pack Trio Imperdible', 35.70, 32.90, 'ambos', true, 'Máximo 2 unidades del mismo sabor/tipo. Sujeto a stock.');

-- Composición de cada combo. Para los combos con "sabor sujeto a stock" y sin
-- ningún producto nombrado explícitamente (Pack Petitbro, Pack 6/12
-- empanadas), NO se listan combo_items: no hay una composición por defecto
-- real en la fuente y no se quiso inventar una. La condición queda descrita
-- en combos.condicion_texto. Ver resumen de la sesión — esto es una decisión
-- reportada, no una omisión.
insert into combo_items (combo_id, product_id, product_size_id, cantidad)
select
  (select id from combos where nombre = v.combo_nombre),
  p.id,
  ps.id,
  v.cantidad
from (values
  ('Pack Tres Delicias', 'mil-hojas', '200g', 1),
  ('Pack Tres Delicias', 'alfajor-manjar', 'Caja x18', 1),
  ('Pack Tres Delicias', 'brownie-caja', null, 1),
  ('Pie Pack', 'pie-manzana', 'Individual', 1),
  ('Pie Pack', 'pie-limon', 'Individual', 1),
  ('Pack Postres de Locura', 'crema-volteada', 'Individual', 1),
  ('Pack Postres de Locura', 'pie-manzana', 'Individual', 1),
  ('Pack Postres de Locura', 'pie-limon', 'Individual', 1),
  ('Pack Postres de Locura', 'torta-chocolate-manjar', 'Individual', 1),
  ('Combo Ideal', 'cafe-americano', null, 1), -- la porción de torta es a elección (3 sabores), sin default en la fuente
  ('Combo Perfecto', 'frappe-oreo', null, 1), -- la empanada es "sabor sujeto a stock", sin default en la fuente
  ('Combo para ti', 'tartaleta-frutas', null, 1),
  ('Combo para ti', 'refresher', null, 1),
  ('Combo Horneamos con amor', 'alfajor-manjar', 'Caja x18', 1),
  ('Combo Horneamos con amor', 'brownie-caja', null, 1),
  ('Combo Horneamos con amor', 'pionono-caja', null, 1),
  ('Combo Horneamos con amor', 'mil-hojas', '500g', 1),
  ('Tortipack', 'torta-chocolate-manjar', 'Individual', 1),
  ('Tortipack', 'torta-carrot-cake', 'Individual', 1),
  ('Pack Trio Cheesebake', 'cheesecake-fresa', 'Individual', 1),
  ('Pack Trio Cheesebake', 'cheesecake-maracuya', 'Individual', 1),
  ('Pack Trio Cheesebake', 'cheesecake-oreo', 'Individual', 1),
  ('Pack Trio Imperdible', 'alfajor-manjar', 'Caja x18', 1),
  ('Pack Trio Imperdible', 'brownie-caja', null, 1),
  ('Pack Trio Imperdible', 'pionono-caja', null, 1)
) as v(combo_nombre, product_slug, tamano, cantidad)
join products p on p.slug = v.product_slug
left join product_sizes ps on ps.product_id = p.id and ps.tamano = v.tamano;


-- ============================================================================
-- 7. Sedes (dato real disponible en la fuente, aunque no era parte explícita
--    del pedido de "catálogo" — se carga porque ya estaba ahí y la tabla
--    existía vacía desde 0004). El horario de atención NO se guarda: `sedes`
--    no tiene columna para eso (no se agregó una para no salirse de alcance
--    de esta migración; queda como dato disponible sin modelar, ver resumen).
-- ============================================================================
insert into sedes (nombre, direccion, activo)
values
  ('Cedros', 'Av. Alameda los Horizontes 820, Chorrillos', true),
  ('Santa Marina', 'Av. Defensores del Morro 2270', true);


-- ============================================================================
-- 8. reglas_catering — NO se puebla en esta migración
-- ============================================================================
-- reglas_catering.product_id es NOT NULL + FK a products + UNIQUE. La
-- sección 10 de la fuente (semáforo de catering) describe ítems que casi
-- nunca corresponden 1 a 1 con un producto de tienda ("Dulces de stock",
-- "Petit panes", "Mini croissant pollo/mixto", etc. — formatos y unidades de
-- venta distintos a los de tienda, sin precio unitario de tienda asociado).
-- Forzarlos dentro de `products` violaría además su CHECK de precio_base > 0
-- (la fuente no da precio unitario para estos ítems, solo mínimos y reglas).
--
-- Dos alternativas razonables, ninguna claramente mejor sin el criterio del
-- cliente — no se decide acá, ver el resumen de la sesión:
--   A) Tabla nueva `catering_items` (id, nombre, categoria) desacoplada de
--      `products`, y reglas_catering.product_id → catering_item_id.
--   B) Reusar `products` agregando un flag `disponible_catering boolean` y
--      relajando precio_base a nullable para estos ítems.

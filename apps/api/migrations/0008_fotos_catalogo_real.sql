-- ============================================================================
-- 0008_fotos_catalogo_real — wireo de fotos reales (mapeo de confianza alta)
--
-- Solo los mapeos de confianza alta ya propuestos y confirmados (empanadas,
-- cajitas, cheesecakes, pies, tortas, mil hojas, tartaletas, combos). Los 5
-- casos sin mapear (2 nombres sin señal, "caja plus", "Caja de alfajores 18
-- unds" sin sabor confirmado, y la ambigüedad "tres leches chocolate" ya
-- documentada) siguen sin foto — no se les asigna nada.
--
-- Algunos productos tenían 2 fotos candidatas (ej. torta-red-velvet: Familiar
-- y Mini; alfajor-nutella/alfajor-pistacho: caja x18 y caja x10). `foto_url`
-- es un único campo por producto — se usó la foto "principal"/genérica y la
-- variante alternativa queda sin wirear (no hay campo de galería en el
-- esquema; fuera de alcance de esta migración agregar uno).
--
-- Rutas: las imágenes viven en apps/web/public/img/catalogo/ y
-- apps/web/public/img/combos/ (copiadas desde imagenes/, que ya quedó
-- trackeada en git en un commit aparte).
-- ============================================================================

update products set foto_url = v.foto_url
from (values
  ('empanada-3-quesos', '/img/catalogo/empanada-3-quesos.png'),
  ('empanada-jamon-queso', '/img/catalogo/empanada-jamon-queso.png'),
  ('empanada-aji-gallina', '/img/catalogo/empanada-aji-gallina.png'),
  ('empanada-cabanossi', '/img/catalogo/empanada-cabanossi.png'),
  ('empanada-carnivora', '/img/catalogo/empanada-carnivora.png'),
  ('empanada-pollo-champinon', '/img/catalogo/empanada-pollo-champinon.png'),
  ('empanada-carne', '/img/catalogo/empanada-carne.png'),
  ('empanada-lomo', '/img/catalogo/empanada-lomo.png'),
  ('empanada-pollo', '/img/catalogo/empanada-pollo.png'),
  ('empanada-hawaiana', '/img/catalogo/empanada-hawaiana.png'),
  ('alfajor-nutella', '/img/catalogo/alfajor-nutella.png'),
  ('alfajor-pistacho', '/img/catalogo/alfajor-pistacho.png'),
  ('alfajor-lucuma', '/img/catalogo/alfajor-lucuma.png'),
  ('alfajor-manjar', '/img/catalogo/alfajor-manjar.png'),
  ('alfajor-mix', '/img/catalogo/alfajor-mix.png'),
  ('chocoalfajor', '/img/catalogo/chocoalfajor.png'),
  ('trufas', '/img/catalogo/trufas.png'),
  ('mix-lite', '/img/catalogo/mix-lite.png'),
  ('brownie-caja', '/img/catalogo/brownie-caja.png'),
  ('pionono-caja', '/img/catalogo/pionono-caja.png'),
  ('cheesecake-oreo', '/img/catalogo/cheesecake-oreo.png'),
  ('cheesecake-fresa', '/img/catalogo/cheesecake-fresa.png'),
  ('cheesecake-maracuya', '/img/catalogo/cheesecake-maracuya.png'),
  ('pie-limon', '/img/catalogo/pie-limon.png'),
  ('pie-manzana', '/img/catalogo/pie-manzana.png'),
  ('tres-leches-vainilla', '/img/catalogo/tres-leches-vainilla.png'),
  ('torta-carrot-cake', '/img/catalogo/torta-carrot-cake.png'),
  ('torta-red-velvet', '/img/catalogo/torta-red-velvet.png'), -- foto de la Familiar; la Mini queda sin wirear (un solo foto_url por producto)
  ('torta-chocolate-manjar', '/img/catalogo/torta-chocolate-manjar.png'), -- ídem; "Mini de chocolate.png" quedó fuera por confianza media
  ('mil-hojas', '/img/catalogo/mil-hojas.png'),
  ('tartaleta-frutas', '/img/catalogo/tartaleta-frutas.png') -- foto de fresa; la variante "fresa y arándanos" queda sin wirear
) as v(slug, foto_url)
where products.tenant_id = (select id from tenants where slug = 'bake-brothers')
  and products.slug = v.slug;

alter table combos add column foto_url text;

update combos set foto_url = v.foto_url
from (values
  ('Pack 6 empanadas', '/img/combos/pack-6-empanadas.png'),
  ('Pack 12 empanadas', '/img/combos/pack-12-empanadas.png'),
  ('Pack Petitbro', '/img/combos/pack-petitbro.png'),
  ('Pie Pack', '/img/combos/pie-pack.png'),
  ('Pack Postres de Locura', '/img/combos/pack-postres-de-locura.png'),
  ('Tortipack', '/img/combos/tortipack.png'),
  ('Pack Trio Cheesebake', '/img/combos/pack-trio-cheesebake.png')
) as v(nombre, foto_url)
where combos.nombre = v.nombre;

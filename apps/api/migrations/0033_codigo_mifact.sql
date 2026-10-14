-- ============================================================================
-- 0033_codigo_mifact — código de producto de Mifact (facturación) en nuestro catálogo
--
-- El importador de catálogo del dashboard (solo admin) cruza el Excel de productos
-- que exporta Mifact con nuestro catálogo POR NOMBRE y guarda el código de Mifact
-- en cada producto que coincide, para poder enlazar ventas y facturas después.
--
-- Una "unidad vendible" es un producto sin tamaños, o un tamaño de un producto
-- (Mifact tiene una fila por presentación: "Alfajor Mix Caja x10" y "…Caja x18" son
-- dos códigos). Por eso la columna va en las dos tablas. Un código no puede repetirse
-- dentro de una misma tabla (índices únicos parciales); que tampoco se repita ENTRE
-- las dos lo verifica la ruta que lo guarda (services/mifactCodigos.ts).
--
-- Sin cambios de permisos: `authenticated` ya tiene SELECT a nivel de tabla (0012) y
-- la columna nueva queda cubierta; `app_api` ya puede UPDATE. Nadie escribe estos
-- códigos desde el navegador — solo la ruta de admin de apps/api.
-- Nunca se toca un precio: esta migración no cambia ningún dato existente.
-- ============================================================================

alter table products add column if not exists codigo_mifact text;
alter table product_sizes add column if not exists codigo_mifact text;

create unique index if not exists products_codigo_mifact_uniq
  on products (codigo_mifact) where codigo_mifact is not null;
create unique index if not exists product_sizes_codigo_mifact_uniq
  on product_sizes (codigo_mifact) where codigo_mifact is not null;

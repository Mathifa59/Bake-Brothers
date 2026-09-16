-- Orden de aparición en el catálogo (preserva el orden del mock original).
-- `if not exists`: 0002_seed_bake_brothers.sql ya la agrega antes de
-- necesitarla en sus INSERT — esto queda como no-op si ya existe.
alter table products add column if not exists orden int not null default 0;

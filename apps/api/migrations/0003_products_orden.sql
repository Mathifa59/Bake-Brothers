-- Orden de aparición en el catálogo (preserva el orden del mock original)
alter table products add column orden int not null default 0;

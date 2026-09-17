-- ============================================================================
-- 0007_catering_items — Opción A para el semáforo de catering
--
-- Decisión del cliente (no elegida unilateralmente, ver resumen de
-- 0006_catalogo_real.sql): `reglas_catering` ya no apunta a `products`. Los
-- ítems de catering (sección 10 de la fuente) casi nunca corresponden 1 a 1
-- con un producto de tienda ("Dulces de stock", "Petit panes", "Mini
-- croissant pollo/mixto", etc. son formatos/unidades de venta propios de
-- catering, sin precio unitario de tienda) — se modelan en una tabla propia,
-- `catering_items`, desacoplada de `products`.
--
-- `reglas_catering` estaba vacía desde que se creó en 0004 (nunca se pobló,
-- justamente por este bloqueo) — se recrea directo en vez de alterar
-- constraints existentes: no hay datos que preservar ni riesgo de perderlos.
--
-- Se agrega `necesita_ticket` (pedido explícito del cliente, del flujo
-- operativo de la sección 10: "Ticket si aplica"). Ahora que el catálogo de
-- catering ya tiene dónde vivir, también se cargan los datos reales de la
-- sección 10 (antes bloqueados por el mismo problema de modelado).
-- ============================================================================

create table catering_items (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  categoria   text not null check (categoria in ('salados', 'dulces_mini_empanadas_sanguchitos')),
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

drop table reglas_catering;

create table reglas_catering (
  id                          uuid primary key default gen_random_uuid(),
  catering_item_id            uuid not null references catering_items(id) on delete cascade,
  unidades_minimas            int not null default 1 check (unidades_minimas > 0),
  -- Ningún ítem de la fuente confirma "mismo día" sin condiciones — todos
  -- son "No confirmar" o "Consultar" (nunca un "sí" liso y llano). Se deja
  -- en false para los 14; la distinción No-confirmar/Consultar no cabe en
  -- este booleano y se pierde aquí — es una limitación conocida, no un dato
  -- inventado. La función de cálculo real (Semana 3) necesitará más que
  -- este campo para reproducir la regla completa de la fuente.
  sale_mismo_dia              boolean not null default false,
  -- Igual de simplificado: la fuente da reglas de corte por hora ("hasta
  -- 12pm → mañana temprano; hasta 8:30pm → desde ~12pm") o "24h
  -- obligatorias" — ninguna es un simple "N horas". Se aproxima a 24 (el
  -- mínimo práctico: día siguiente) en los 14 ítems; ver nota arriba.
  anticipacion_horas          int not null default 0 check (anticipacion_horas >= 0),
  requiere_auto_obligatorio   boolean not null default false,
  -- Regla no negociable de la fuente: "Domingo = consultar siempre, sin
  -- importar categoría" — true en los 14 ítems, sin excepción.
  consultar_domingo           boolean not null default true,
  -- Nullable a propósito: la nota de "Ticket si aplica" de la fuente no
  -- cubre los 14 ítems con la misma granularidad con la que se modeló esta
  -- tabla (ver el NULL de 'Dulces de stock', mezclado a nivel de variante,
  -- y los 3 ítems no mencionados en la nota en absoluto). NULL = no
  -- determinable con la fuente actual, no "no necesita ticket".
  necesita_ticket             boolean,
  creado_en                   timestamptz not null default now(),
  unique (catering_item_id)
);

-- 0004 otorgó grants sobre reglas_catering, pero al recrearla esos grants se
-- pierden (van atados al objeto, no al nombre) — hay que volver a otorgarlos,
-- más el de la tabla nueva.
grant select, insert, update on catering_items, reglas_catering to app_api;


-- ============================================================================
-- Datos: los 14 ítems de la sección 10 (semáforo de catering)
-- ============================================================================
insert into catering_items (nombre, categoria)
values
  ('Enrollados (hot dog / jamón y queso)', 'salados'),
  ('Pizzitas', 'salados'),
  ('Tequeños (mixtos/queso)', 'salados'),
  ('Hojarasca con ají de gallina', 'salados'),
  ('Causa rellena', 'salados'),
  ('Brochetas', 'salados'),
  ('Piernitas de pollo', 'salados'),
  ('Dulces de stock (alfajorcitos y variantes, piononos, trufitas, mini milhojas, brownies)', 'dulces_mini_empanadas_sanguchitos'),
  ('Dulces frágiles (mini tartaletas, mini pies, mini cheesecakes)', 'dulces_mini_empanadas_sanguchitos'),
  ('Mini empanadas (todos los sabores)', 'dulces_mini_empanadas_sanguchitos'),
  ('Petit panes (todos los sabores)', 'dulces_mini_empanadas_sanguchitos'),
  ('Mini croissant pollo/mixto', 'dulces_mini_empanadas_sanguchitos'),
  ('Butifarras', 'dulces_mini_empanadas_sanguchitos'),
  ('Triples (todas variedades)', 'dulces_mini_empanadas_sanguchitos');

-- necesita_ticket, por ítem, según el flujo operativo de la fuente:
--   "Ticket si aplica (piononos, tartaletas, mini pies, trufitas, mini
--   cheesecakes sí necesitan ticket; alfajorcitos, mini milhojas, brownies
--   no; todos los salados sí, mini empanadas no; todos los sanguchitos sí)."
--   - Todos los `salados` (7): sí.
--   - Dulces frágiles: sus 3 variantes (mini tartaletas, mini pies, mini
--     cheesecakes) están TODAS en la lista de "sí" → true, sin ambigüedad.
--   - Dulces de stock: MEZCLADO — piononos y trufitas están en la lista de
--     "sí", pero alfajorcitos, mini milhojas y brownies están en la de "no",
--     y esta fila agrupa a las 5 variantes juntas. No se fuerza un único
--     valor → NULL (ver comentario de la columna).
--   - Mini empanadas: explícitamente "no" → false.
--   - Triples: "todos los sanguchitos sí" → true.
--   - Petit panes y Mini croissant pollo/mixto: no aparecen en la nota, ni
--     en la lista de "sí" ni en la de "no" → NULL (no confirmado).
--   - Butifarras: tampoco aparece en la nota (y no es parte del grupo
--     "salados" de la fuente, pese a ser un ítem salado) → NULL.
insert into reglas_catering (
  catering_item_id, unidades_minimas, sale_mismo_dia, anticipacion_horas,
  requiere_auto_obligatorio, consultar_domingo, necesita_ticket
)
select ci.id, v.unidades_minimas, false, v.anticipacion_horas, v.requiere_auto_obligatorio, true, v.necesita_ticket
from (values
  ('Enrollados (hot dog / jamón y queso)', 25, 24, false, true),
  ('Pizzitas', 25, 24, false, true),
  ('Tequeños (mixtos/queso)', 25, 24, false, true),
  ('Hojarasca con ají de gallina', 25, 24, true, true),
  ('Causa rellena', 50, 24, true, true),
  ('Brochetas', 50, 24, false, true),
  ('Piernitas de pollo', 50, 24, false, true),
  ('Dulces de stock (alfajorcitos y variantes, piononos, trufitas, mini milhojas, brownies)', 20, 24, false, null),
  ('Dulces frágiles (mini tartaletas, mini pies, mini cheesecakes)', 25, 24, true, true),
  ('Mini empanadas (todos los sabores)', 12, 24, false, false),
  ('Petit panes (todos los sabores)', 12, 24, false, null),
  ('Mini croissant pollo/mixto', 50, 24, false, null),
  ('Butifarras', 50, 24, false, null),
  ('Triples (todas variedades)', 25, 24, false, true)
) as v(nombre, unidades_minimas, anticipacion_horas, requiere_auto_obligatorio, necesita_ticket)
join catering_items ci on ci.nombre = v.nombre;

-- ============================================================================
-- 0018_semaforo_catering — columna nueva para el semáforo (decisión del
-- cliente, no forzada sobre el dato existente)
--
-- anticipacion_horas plano (24 para los 14 ítems) no alcanza para
-- representar la excepción documentada en la Guía de Agendamiento v2.0
-- (sección 10): varios ítems admiten agendarse para el día siguiente si el
-- pedido llega antes de las 8:30pm de hoy, aunque eso dé menos de 24h
-- exactas de anticipación — y esa excepción NO es uniforme entre los 14
-- ítems, así que no se puede inferir del dato que ya existe.
--
-- admite_corte_noche_anterior = true: la fuente documenta explícitamente el
-- corte de las 8:30pm para este ítem.
-- admite_corte_noche_anterior = false (default): o la fuente exige "24h
-- obligatorias" sin excepción de horario (Causa rellena, Brochetas,
-- Piernitas de pollo, Butifarras), o la fuente ya trata el ítem con más
-- incertidumbre que al resto — su columna "Hoy" dice "Consultar", no un
-- "No confirmar" limpio (Dulces de stock, Mini empanadas, Petit panes) — en
-- ambos casos se deja en false, más conservador, sin inventar el atajo.
-- ============================================================================

alter table reglas_catering add column admite_corte_noche_anterior boolean not null default false;

update reglas_catering set admite_corte_noche_anterior = true
where catering_item_id in (
  select id from catering_items where nombre in (
    'Enrollados (hot dog / jamón y queso)',
    'Pizzitas',
    'Tequeños (mixtos/queso)',
    'Hojarasca con ají de gallina',
    'Dulces frágiles (mini tartaletas, mini pies, mini cheesecakes)',
    'Mini croissant pollo/mixto',
    'Triples (todas variedades)'
  )
);

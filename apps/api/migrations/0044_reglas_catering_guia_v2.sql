-- ============================================================================
-- 0044_reglas_catering_guia_v2 — alinea reglas_catering con la Guía de
-- Agendamiento de Catering v2.0 (matriz de la sección 02).
--
-- Se compararon los 14 ítems contra la matriz (mínimos, "Hoy", "Mañana /
-- anticipación"). Los mínimos ya coincidían todos. Diferencias encontradas:
--
-- 1) Columna "HOY = CONSULTAR" (Dulces de stock, Mini empanadas, Petit panes,
--    Mini croissant, Triples). Estaban con sale_mismo_dia = false, lo que el
--    semáforo leía como "NO CONFIRMAR" (rojo). La Guía dice CONSULTAR
--    (amarillo). sale_mismo_dia = true significa ahora "para hoy se consulta,
--    no se rechaza"; el semáforo nunca da verde para hoy.
--
-- 2) Columna "MAÑANA = AGENDAR" sin horario de corte propio (Dulces de stock:
--    "se puede agendar para el día siguiente"; Mini empanadas: "puede agendarse
--    con anticipación"; Petit panes: "para el día siguiente"). Estaban con
--    admite_corte_noche_anterior = false, así que pedir hoy para mañana daba
--    amarillo por no completar 24 h. La Guía los marca AGENDAR. Como la Guía
--    no da una hora distinta para estos tres, se les aplica el mismo corte de
--    las 8:30 p. m. que a los demás (conservador: después de esa hora pasa a
--    consultar). Butifarras, Causa, Brochetas y Piernitas siguen con
--    "24 horas obligatorias" (false).
--
-- Idempotente. Solo cambia datos, no el esquema.
-- ============================================================================

update reglas_catering set sale_mismo_dia = true
where catering_item_id in (
  select id from catering_items where nombre in (
    'Dulces de stock (alfajorcitos y variantes, piononos, trufitas, mini milhojas, brownies)',
    'Mini empanadas (todos los sabores)',
    'Petit panes (todos los sabores)',
    'Mini croissant pollo/mixto',
    'Triples (todas variedades)'
  )
);

update reglas_catering set admite_corte_noche_anterior = true
where catering_item_id in (
  select id from catering_items where nombre in (
    'Dulces de stock (alfajorcitos y variantes, piononos, trufitas, mini milhojas, brownies)',
    'Mini empanadas (todos los sabores)',
    'Petit panes (todos los sabores)'
  )
);

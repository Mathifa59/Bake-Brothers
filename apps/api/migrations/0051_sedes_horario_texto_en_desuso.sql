-- ============================================================================
-- 0051_sedes_horario_texto_en_desuso — el horario tiene UNA sola fuente
--
-- La tabla por día `sedes_horarios` (0050) es la única fuente del horario de los locales. De ahí se generan el texto que lee el
-- bot, los renglones de la web y el JSON-LD. La columna de texto libre `sedes.horario` (0034/0048) queda en DESUSO: nada la lee.
-- Solo se documenta (no se borra todavía: la API anterior todavía la seleccionaba; se puede borrar en una migración posterior,
-- cuando ya no corra ningún despliegue viejo). Cambiar un horario = cambiar `sedes_horarios` y, para la web, correr
-- `pnpm --filter @bakebrothers/api horarios:web` y publicar.
-- ============================================================================

comment on column sedes.horario is 'EN DESUSO desde la 0051: nada la lee. El horario vive en sedes_horarios (una fila por día); de ahí se genera el texto del bot, la web y el JSON-LD.';

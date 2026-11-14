-- ============================================================================
-- 0048_horarios_locales — horario real de cada local (confirmado por el cliente, 2026-11-13)
--
-- `sedes.horario` es texto libre que el bot recibe en cada conversación (textoContextoLocales): sale de la base, así
-- que cambiar un horario no necesita un deploy. Ya no hay «por confirmar».
--   · Cedros:        lunes a sábado 7:30 a. m. a 8:30 p. m.; domingo 10:30 a. m. a 8:30 p. m.
--   · Santa Marina:  viernes a miércoles 12:00 m. a 10:00 p. m.; jueves 1:00 p. m. a 10:00 p. m.
-- (El horario en que las PERSONAS atienden WhatsApp es otro y vive en packages/domain/src/cortesAtencion.ts.)
-- ============================================================================

update sedes
   set horario = 'lunes a sábado 7:30 a. m. a 8:30 p. m.; domingo 10:30 a. m. a 8:30 p. m.'
 where nombre = 'Cedros';

update sedes
   set horario = 'viernes a miércoles 12:00 m. a 10:00 p. m.; jueves 1:00 p. m. a 10:00 p. m.'
 where nombre = 'Santa Marina';

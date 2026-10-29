-- ============================================================================
-- 0034_horario_sedes — horario de atención por local, en la base y no en el código
--
-- El bot necesita el horario de cada local para no ofrecer una hora de recojo con el local cerrado
-- (0006 lo dejó fuera: "el horario de atención NO se guarda"). Se guarda como texto libre, tal como lo
-- lee el cliente, porque el modelo lo lee tal cual y no hay (todavía) un campo de hora estructurado en los
-- pedidos. Cambiar un horario es un UPDATE, sin deploy.
--
-- Datos: los de la ficha real (catalogo-real-bake-brothers.md, sección 0). El sábado de Cedros NO figura en
-- la ficha: se deja marcado "por confirmar" a propósito, para que el bot no prometa una hora ese día.
--
-- No cambia permisos: `sedes` ya tiene RLS y grants (0011/0032); una columna nueva hereda los del
-- nivel de tabla. Idempotente: se puede correr dos veces.
-- ============================================================================

alter table sedes add column if not exists horario text;

update sedes
   set horario = 'lunes a viernes 7:30 a. m. a 8:30 p. m.; sábado por confirmar; domingo 10:00 a. m. a 8:30 p. m.'
 where nombre = 'Cedros' and horario is null;

update sedes
   set horario = 'todos los días 12:00 p. m. a 10:00 p. m.'
 where nombre = 'Santa Marina' and horario is null;

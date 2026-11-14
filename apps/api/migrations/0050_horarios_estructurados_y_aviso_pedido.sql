-- ============================================================================
-- 0050_horarios_estructurados_y_aviso_pedido
--
-- 1) `sedes_horarios`: el horario de cada local por día de la semana, ESTRUCTURADO (hasta hoy era solo texto libre en
--    `sedes.horario`, que el bot lee pero el servidor no puede comprobar). Sirve para validar en el servidor que la hora de
--    recojo de un pedido caiga dentro del horario del local de ese día, y para decirle al bot qué horas ofrecer.
--    · dia_semana: 0 = domingo … 6 = sábado (como `extract(dow ...)`); un día sin fila = el local está cerrado.
--    · abre/cierra: hora local de Lima. Se puede recoger desde `abre` hasta ANTES de `cierra`.
--    El texto `sedes.horario` (0048) se mantiene para el prompt; si un horario cambia hay que cambiar los dos.
--    Solo la API lee la tabla (sin permisos para anon/authenticated, igual que catering_items).
-- 2) `avisos.tipo` admite 'pedido_nuevo': aviso al local cuando el bot registra un pedido PARA HOY.
-- Horarios (confirmados por el cliente, 2026-11-13):
--   Cedros       lunes a sábado 7:30 a. m.–8:30 p. m.; domingo 10:30 a. m.–8:30 p. m.
--   Santa Marina viernes a miércoles 12:00 m.–10:00 p. m.; jueves 1:00 p. m.–10:00 p. m.
-- ============================================================================

create table if not exists sedes_horarios (
  sede_id     uuid not null references sedes(id) on delete cascade,
  dia_semana  smallint not null check (dia_semana between 0 and 6),
  abre        time not null,
  cierra      time not null,
  primary key (sede_id, dia_semana),
  check (cierra > abre)
);

grant select on sedes_horarios to app_api;

insert into sedes_horarios (sede_id, dia_semana, abre, cierra)
select s.id, d.dia, d.abre, d.cierra
  from sedes s
  join (values
    ('Cedros', 1, time '07:30', time '20:30'), ('Cedros', 2, time '07:30', time '20:30'), ('Cedros', 3, time '07:30', time '20:30'),
    ('Cedros', 4, time '07:30', time '20:30'), ('Cedros', 5, time '07:30', time '20:30'), ('Cedros', 6, time '07:30', time '20:30'),
    ('Cedros', 0, time '10:30', time '20:30'),
    ('Santa Marina', 5, time '12:00', time '22:00'), ('Santa Marina', 6, time '12:00', time '22:00'), ('Santa Marina', 0, time '12:00', time '22:00'),
    ('Santa Marina', 1, time '12:00', time '22:00'), ('Santa Marina', 2, time '12:00', time '22:00'), ('Santa Marina', 3, time '12:00', time '22:00'),
    ('Santa Marina', 4, time '13:00', time '22:00')
  ) as d(nombre, dia, abre, cierra) on d.nombre = s.nombre
on conflict (sede_id, dia_semana) do nothing;

alter table avisos drop constraint if exists avisos_tipo_check;
alter table avisos add constraint avisos_tipo_check check (tipo in ('mensaje_nuevo', 'esperando_persona', 'pedido_nuevo'));

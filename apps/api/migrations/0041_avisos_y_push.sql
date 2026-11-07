-- ============================================================================
-- 0041_avisos_y_push
--
-- Avisos al equipo cuando entra algo que una persona tiene que atender (con el bot apagado, cada mensaje lo
-- responde alguien y se tiene que enterar con el celular bloqueado):
--   - avisos:            el centro de avisos de la campana (lista persistente, con Realtime).
--   - avisos_cursor:     hasta cuándo vio avisos cada persona (de ahí sale el contador de «sin ver»).
--   - push_suscripciones: los celulares/navegadores que activaron las notificaciones push (Web Push). Solo la API
--                         la toca (guarda las llaves de cada dispositivo): NINGÚN permiso para el panel.
--
-- Quién ve un aviso: dirección todos; un empleado, los de su sede y los que no tienen sede (una conversación nueva
-- del número único aún no tiene local, así que la ve todo el personal — igual que en Conversaciones, 0030).
-- Numeración: la 0039 la usa la rama del ciclo (sin mergear); esta no depende de ella.
-- ============================================================================

-- ——— avisos ———
create table if not exists avisos (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null check (tipo in ('mensaje_nuevo', 'esperando_persona')),
  titulo          text not null,
  cuerpo          text not null,
  conversacion_id uuid references conversaciones(id) on delete cascade,
  sede_id         uuid references sedes(id) on delete set null,
  creado_en       timestamptz not null default now()
);
create index if not exists avisos_creado_en_idx on avisos (creado_en desc);

alter table avisos enable row level security;
-- 0013: las tablas nuevas nacen cerradas; cada permiso se da aquí, explícito.
grant select on avisos to authenticated;
grant select, insert, update, delete on avisos to app_api;

drop policy if exists app_api_avisos on avisos;
create policy app_api_avisos on avisos for all to app_api using (true) with check (true);

drop policy if exists avisos_select_por_sede on avisos;
create policy avisos_select_por_sede on avisos
  for select to authenticated
  using (
    exists (
      select 1 from usuarios_dashboard u
      where u.id = (select auth.uid())
        and (u.rol = 'admin' or avisos.sede_id is null or u.sede_id = avisos.sede_id)
    )
  );

-- La campana se actualiza sola: Realtime respeta la RLS de arriba.
alter publication supabase_realtime add table avisos;

-- ——— avisos_cursor ———
create table if not exists avisos_cursor (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  vistos_en  timestamptz not null default now()
);

alter table avisos_cursor enable row level security;
grant select, insert, update on avisos_cursor to authenticated;
grant select on avisos_cursor to app_api;

drop policy if exists avisos_cursor_propio on avisos_cursor;
create policy avisos_cursor_propio on avisos_cursor
  for all to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

-- ——— push_suscripciones (solo la API) ———
create table if not exists push_suscripciones (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references auth.users(id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  user_agent      text,
  creado_en       timestamptz not null default now(),
  ultimo_exito_en timestamptz
);
create index if not exists push_suscripciones_usuario_idx on push_suscripciones (usuario_id);

alter table push_suscripciones enable row level security;
grant select, insert, update, delete on push_suscripciones to app_api;

drop policy if exists app_api_push_suscripciones on push_suscripciones;
create policy app_api_push_suscripciones on push_suscripciones for all to app_api using (true) with check (true);

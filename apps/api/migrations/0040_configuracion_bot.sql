-- ============================================================================
-- 0040_configuracion_bot
--
-- Interruptor «Bot activo / apagado» (y un mensaje de bienvenida fijo, sin IA) que el admin cambia desde el panel,
-- SIN redeploy. Arranca APAGADO: con el bot apagado, los mensajes de WhatsApp van directo a Conversaciones como
-- «esperando persona», sin llamar a Claude ni registrar errores (apps/api/src/bot/atencionSinBot.ts).
--
-- Una sola fila (id = true). Lectura: todo el personal (el panel muestra el estado). Escritura: solo admin, por RLS
-- (el panel habla directo con Supabase, igual que plan_vitrina y respuestas_rapidas). La API la lee con app_api.
--
-- Nota de numeración: la 0039 la usa la rama del ciclo Órdenes → Producción → Stock (sin mergear); esta migración
-- no depende de ella.
-- ============================================================================

create table if not exists configuracion_bot (
  id                 boolean primary key default true check (id),
  bot_activo         boolean not null default false,
  bienvenida_activa  boolean not null default false,
  mensaje_bienvenida text    not null default 'Hola, gracias por escribir a Bake Brothers. En unos minutos te atendemos.'
                       check (length(btrim(mensaje_bienvenida)) between 1 and 1000),
  actualizado_en     timestamptz not null default now(),
  actualizado_por    uuid references auth.users(id) on delete set null
);

insert into configuracion_bot (id) values (true) on conflict (id) do nothing;

alter table configuracion_bot enable row level security;
-- 0013: las tablas nuevas nacen cerradas; cada permiso se da aquí, explícito.
grant select on configuracion_bot to authenticated;
grant update (bot_activo, bienvenida_activa, mensaje_bienvenida) on configuracion_bot to authenticated;
grant select on configuracion_bot to app_api;

drop policy if exists personal_lee_configuracion_bot on configuracion_bot;
create policy personal_lee_configuracion_bot on configuracion_bot
  for select to authenticated
  using (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid())));

drop policy if exists admin_actualiza_configuracion_bot on configuracion_bot;
create policy admin_actualiza_configuracion_bot on configuracion_bot
  for update to authenticated
  using (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin'))
  with check (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin'));

-- Quién y cuándo lo cambió: lo pone la base, no el navegador.
create or replace function configuracion_bot_sellar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := (select auth.uid());
  return new;
end
$$;

drop trigger if exists configuracion_bot_sellar_trigger on configuracion_bot;
create trigger configuracion_bot_sellar_trigger
  before update on configuracion_bot
  for each row execute function configuracion_bot_sellar();

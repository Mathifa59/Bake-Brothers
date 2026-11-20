-- ============================================================================
-- 0056_equipo_gestion
--
-- Gestión del equipo desde el panel (solo Administración): crear cuentas con usuario y contraseña definidos por el
-- administrador, editarlas, desactivarlas y reactivarlas — sin invitaciones por correo y sin borrar nunca a nadie.
-- La creación en Supabase Auth la hace la API (con la llave de servicio, que vive SOLO en Coolify); esta migración
-- pone en la base lo que hace falta para que el resto sea a prueba de errores:
--
--   1. usuarios_dashboard gana `usuario` (nombre de ingreso), `activo`, `es_encargado` (permiso para porcionar,
--      lo usa la parte de Stock) y `desactivado_en`.
--   2. Una cuenta DESACTIVADA pierde el acceso a los datos AL INSTANTE, aunque su sesión (JWT) siga vigente hasta 1 h:
--      la política de lectura de su propia fila y las funciones de acceso de la 0054 ahora exigen `activo`. Como todas
--      las demás políticas consultan usuarios_dashboard a través de esa política (o de esas funciones), no hay que
--      reescribirlas una por una.
--   3. Siempre queda al menos UN administrador activo, y nadie puede quitarse a sí mismo Administración ni
--      desactivarse (lo valida la API con mensajes claros, y la base lo sostiene aunque alguien lo intente por SQL).
--   4. Auditoría: `equipo_auditoria` registra quién creó, cambió o desactivó cada cuenta y cuándo. La escribe un
--      trigger (no el código de la API), así que queda registro también de lo que se haga a mano en la base. Solo se
--      agrega; no se puede editar ni borrar. Nunca guarda contraseñas.
-- ============================================================================

-- ——— 1. columnas ———
alter table usuarios_dashboard
  add column if not exists usuario        text,
  add column if not exists activo         boolean not null default true,
  add column if not exists es_encargado   boolean not null default false,
  add column if not exists desactivado_en timestamptz;

comment on column usuarios_dashboard.usuario is
  'Nombre de ingreso (ej. caja.cedros). El correo interno de Supabase Auth es usuario@equipo.bakebrothers.pe. Null en las cuentas con correo real.';
comment on column usuarios_dashboard.activo is
  'false = cuenta desactivada: no ve ningún dato ni entra a la API aunque su sesión siga vigente. Nunca se borra una cuenta.';
comment on column usuarios_dashboard.es_encargado is
  'Permiso adicional «Encargado» (además de su perfil): puede porcionar productos en Stock. Administración puede sin serlo.';

alter table usuarios_dashboard drop constraint if exists usuarios_dashboard_usuario_formato;
alter table usuarios_dashboard add constraint usuarios_dashboard_usuario_formato
  check (usuario is null or usuario ~ '^[a-z0-9][a-z0-9._-]{2,29}$');

create unique index if not exists usuarios_dashboard_usuario_unico on usuarios_dashboard (usuario) where usuario is not null;

-- ——— 2. una cuenta desactivada no ve nada ———
-- Las políticas inline (métricas, catálogo, mifact, etc.) consultan usuarios_dashboard como el usuario de la sesión,
-- es decir, a través de ESTA política: si la cuenta está desactivada su fila "no existe" y todo se le niega.
drop policy if exists usuarios_dashboard_propio on usuarios_dashboard;
create policy usuarios_dashboard_propio on usuarios_dashboard
  for select to authenticated
  using (id = auth.uid() and activo);

-- Las funciones SECURITY DEFINER de la 0054 saltan la RLS, así que revisan `activo` ellas mismas.
create or replace function tiene_perfil_panel(p_perfiles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from usuarios_dashboard u
    where u.id = (select auth.uid())
      and u.activo
      and (u.rol = 'admin' or u.perfiles && p_perfiles)
  )
$$;

create or replace function acceso_a_sede(p_sede uuid, p_globales text[], p_locales text[], p_incluye_sin_sede boolean default true)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from usuarios_dashboard u
    where u.id = (select auth.uid())
      and u.activo
      and (
        u.rol = 'admin'
        or u.perfiles && p_globales
        or (
          u.perfiles && p_locales
          and ((p_sede is null and p_incluye_sin_sede) or (p_sede is not null and u.sede_id = p_sede))
        )
      )
  )
$$;

create or replace function usuario_recibe_aviso(p_usuario uuid, p_tipo text, p_sede uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from usuarios_dashboard u
    where u.id = p_usuario
      and u.activo
      and case p_tipo
        when 'mensaje_nuevo' then
          u.rol = 'admin' or u.perfiles && array['venta_digital']
          or (u.perfiles && array['empleado_temporal'] and (p_sede is null or u.sede_id = p_sede))
        when 'esperando_persona' then
          u.rol = 'admin' or u.perfiles && array['venta_digital']
          or (u.perfiles && array['empleado_temporal'] and (p_sede is null or u.sede_id = p_sede))
        when 'pedido_nuevo' then
          u.avisa_ordenes and (u.rol = 'admin' or u.perfiles && array['venta_digital', 'ordenes'] or p_sede is null or u.sede_id = p_sede)
        when 'orden_nueva' then
          u.avisa_ordenes and (u.rol = 'admin' or u.perfiles && array['venta_digital', 'ordenes'] or p_sede is null or u.sede_id = p_sede)
        when 'pago_reportado' then
          u.avisa_pagos and (u.rol = 'admin' or u.perfiles && array['caja', 'venta_digital', 'empleado_temporal'])
        else false
      end
  )
$$;

-- ——— 3. la API escribe usuarios_dashboard (nunca borra) ———
-- Hasta ahora app_api solo la leía. Crear y editar cuentas pasa por la API, que ya verificó que quien pide es
-- Administración. No se da delete: una cuenta se desactiva, jamás se borra.
grant insert, update on usuarios_dashboard to app_api;

drop policy if exists app_api_usuarios_dashboard_insert on usuarios_dashboard;
create policy app_api_usuarios_dashboard_insert on usuarios_dashboard
  for insert to app_api with check (true);

drop policy if exists app_api_usuarios_dashboard_update on usuarios_dashboard;
create policy app_api_usuarios_dashboard_update on usuarios_dashboard
  for update to app_api using (true) with check (true);

-- ——— 4. guardias: siempre un administrador activo; nadie se quita a sí mismo Administración ———
-- La API fija quién hace el cambio con set_config('app.actor_id', <uuid>, true) dentro de su transacción.
create or replace function equipo_actor()
returns uuid
language plpgsql
stable
as $$
declare
  v text := nullif(current_setting('app.actor_id', true), '');
begin
  if v is null then return null; end if;
  return v::uuid;
exception when others then
  return null;
end
$$;

create or replace function usuarios_dashboard_guardias()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  era_admin_activo boolean := (old.rol = 'admin' and old.activo);
  sigue_admin_activo boolean;
begin
  if tg_op = 'DELETE' then
    sigue_admin_activo := false;
  else
    sigue_admin_activo := (new.rol = 'admin' and new.activo);
    -- Fecha de desactivación: la fija la base, no el cliente.
    if new.activo is distinct from old.activo then
      new.desactivado_en := case when new.activo then null else now() end;
    end if;
  end if;

  if era_admin_activo and not sigue_admin_activo then
    -- Nadie se quita a sí mismo Administración ni se desactiva.
    if equipo_actor() is not null and equipo_actor() = old.id then
      raise exception 'No puedes quitarte Administración ni desactivar tu propia cuenta' using errcode = 'P0001', hint = 'NO_PUEDES_QUITARTE_ADMINISTRACION';
    end if;
    -- Siempre queda al menos otro administrador activo. FOR UPDATE: dos cambios simultáneos no pueden dejar cero.
    perform 1 from usuarios_dashboard u where u.rol = 'admin' and u.activo and u.id <> old.id for update;
    if not found then
      raise exception 'Tiene que quedar al menos un administrador activo' using errcode = 'P0001', hint = 'ULTIMO_ADMINISTRADOR';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

-- El nombre empieza con «z» a propósito: Postgres dispara los triggers BEFORE por orden alfabético y este tiene que correr
-- DESPUÉS de usuarios_dashboard_perfiles (0054), que es el que deriva `rol` de los perfiles.
drop trigger if exists usuarios_dashboard_guardias on usuarios_dashboard;
drop trigger if exists usuarios_dashboard_zguardias on usuarios_dashboard;
create trigger usuarios_dashboard_zguardias
  before update or delete on usuarios_dashboard
  for each row execute function usuarios_dashboard_guardias();

-- ——— 5. auditoría ———
create table if not exists equipo_auditoria (
  id              bigint generated always as identity primary key,
  cuando          timestamptz not null default now(),
  actor_id        uuid,                    -- null = hecho directamente en la base
  actor_nombre    text,                    -- copia: se conserva aunque la cuenta cambie
  accion          text not null check (accion in ('crear', 'editar', 'desactivar', 'reactivar', 'cambiar_password', 'invitar')),
  objetivo_id     uuid not null,           -- sin FK a propósito: el registro sobrevive a todo
  objetivo_nombre text,
  detalle         jsonb not null default '{}'::jsonb   -- antes/después de lo que cambió. NUNCA contraseñas.
);
create index if not exists idx_equipo_auditoria_cuando   on equipo_auditoria (cuando desc);
create index if not exists idx_equipo_auditoria_objetivo on equipo_auditoria (objetivo_id, cuando desc);

alter table equipo_auditoria enable row level security;
-- Sin ningún permiso para el panel: lo lee la API (solo Administración). Se agrega y se lee; no se edita ni se borra.
grant select, insert on equipo_auditoria to app_api;
create policy app_api_equipo_auditoria_select on equipo_auditoria for select to app_api using (true);
create policy app_api_equipo_auditoria_insert on equipo_auditoria for insert to app_api with check (true);

create or replace function equipo_auditoria_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'El registro de auditoría no se puede editar ni borrar' using errcode = 'P0001';
end
$$;
drop trigger if exists equipo_auditoria_inmutable on equipo_auditoria;
create trigger equipo_auditoria_inmutable
  before update or delete on equipo_auditoria
  for each row execute function equipo_auditoria_inmutable();

-- El trigger que escribe la auditoría corre con permisos de su dueño: así queda registrado aunque quien cambia la fila
-- (la API, o alguien en el SQL Editor) no tenga permiso directo sobre la tabla de auditoría.
create or replace function usuarios_dashboard_auditar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := equipo_actor();
  v_actor_nombre text;
  v_cambios jsonb := '{}'::jsonb;
  v_accion text;
begin
  if v_actor is not null then
    select coalesce(a.nombre, a.usuario) into v_actor_nombre from usuarios_dashboard a where a.id = v_actor;
  end if;

  if tg_op = 'INSERT' then
    insert into equipo_auditoria (actor_id, actor_nombre, accion, objetivo_id, objetivo_nombre, detalle)
    values (
      v_actor, v_actor_nombre, 'crear', new.id, coalesce(new.nombre, new.usuario),
      jsonb_build_object(
        'usuario', new.usuario, 'perfiles', to_jsonb(new.perfiles), 'sede_id', new.sede_id,
        'avisa_ordenes', new.avisa_ordenes, 'avisa_pagos', new.avisa_pagos, 'es_encargado', new.es_encargado
      )
    );
    return new;
  end if;

  if new.nombre        is distinct from old.nombre        then v_cambios := v_cambios || jsonb_build_object('nombre',        jsonb_build_object('antes', old.nombre,        'despues', new.nombre));        end if;
  if new.usuario       is distinct from old.usuario       then v_cambios := v_cambios || jsonb_build_object('usuario',       jsonb_build_object('antes', old.usuario,       'despues', new.usuario));       end if;
  if new.perfiles      is distinct from old.perfiles      then v_cambios := v_cambios || jsonb_build_object('perfiles',      jsonb_build_object('antes', to_jsonb(old.perfiles), 'despues', to_jsonb(new.perfiles))); end if;
  if new.sede_id       is distinct from old.sede_id       then v_cambios := v_cambios || jsonb_build_object('sede_id',       jsonb_build_object('antes', old.sede_id,       'despues', new.sede_id));       end if;
  if new.avisa_ordenes is distinct from old.avisa_ordenes then v_cambios := v_cambios || jsonb_build_object('avisa_ordenes', jsonb_build_object('antes', old.avisa_ordenes, 'despues', new.avisa_ordenes)); end if;
  if new.avisa_pagos   is distinct from old.avisa_pagos   then v_cambios := v_cambios || jsonb_build_object('avisa_pagos',   jsonb_build_object('antes', old.avisa_pagos,   'despues', new.avisa_pagos));   end if;
  if new.es_encargado  is distinct from old.es_encargado  then v_cambios := v_cambios || jsonb_build_object('es_encargado',  jsonb_build_object('antes', old.es_encargado,  'despues', new.es_encargado));  end if;

  if new.activo is distinct from old.activo then
    insert into equipo_auditoria (actor_id, actor_nombre, accion, objetivo_id, objetivo_nombre, detalle)
    values (v_actor, v_actor_nombre, case when new.activo then 'reactivar' else 'desactivar' end, new.id, coalesce(new.nombre, new.usuario), '{}'::jsonb);
  end if;

  if v_cambios <> '{}'::jsonb then
    insert into equipo_auditoria (actor_id, actor_nombre, accion, objetivo_id, objetivo_nombre, detalle)
    values (v_actor, v_actor_nombre, 'editar', new.id, coalesce(new.nombre, new.usuario), v_cambios);
  end if;
  return new;
end
$$;

drop trigger if exists usuarios_dashboard_auditar on usuarios_dashboard;
create trigger usuarios_dashboard_auditar
  after insert or update on usuarios_dashboard
  for each row execute function usuarios_dashboard_auditar();

revoke all on function usuarios_dashboard_auditar() from public;
revoke all on function equipo_actor() from public;
grant execute on function equipo_actor() to app_api, authenticated;

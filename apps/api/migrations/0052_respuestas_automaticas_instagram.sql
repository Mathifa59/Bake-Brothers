-- 0052 — Respuestas automáticas a comentarios de Instagram («comenta ALFAJOR y te mandamos el link»).
--
-- Reemplaza a ManyChat dentro de Bake OS: el webhook de Meta (que ya recibe los eventos de Instagram) mira cada
-- comentario nuevo; si trae la palabra clave de una regla activa, responde el comentario en público y le manda a esa
-- persona un DM (private reply) con un link corto a WhatsApp que lleva la campaña («(ref: ig-alfajor)»). El pedido
-- que salga de ahí queda con orders.campana = la referencia de la regla, como cualquier campaña.
--
--   1. instagram_conexion: la cuenta de Instagram conectada y su token (cifrado igual que los de WhatsApp, con
--      WHATSAPP_TOKEN_ENCRYPTION_KEY). El panel ve si hay conexión, nunca el token.
--   2. respuestas_automaticas: las reglas que arma dirección en el panel.
--   3. respuestas_automaticas_envios: un registro por comentario atendido. comentario_id único = idempotencia (Meta
--      reintenta los webhooks) y la base de los resultados de cada regla.
--   4. respuestas_automaticas_resumen(): resultados por regla para el panel (solo admin).

-- 1. Conexión ----------------------------------------------------------------------------------------------------
create table if not exists instagram_conexion (
  id               uuid primary key default gen_random_uuid(),
  -- Id de la cuenta profesional de Instagram (el entry[].id de los webhooks).
  ig_user_id       text not null unique,
  usuario          text,
  -- 'facebook_login': token de página / usuario del sistema (graph.facebook.com, envía por la página vinculada).
  -- 'instagram_login': token de Instagram (graph.instagram.com).
  tipo             text not null default 'facebook_login' check (tipo in ('facebook_login', 'instagram_login')),
  -- Solo con facebook_login: la página de Facebook vinculada (los DMs salen por /{page_id}/messages).
  page_id          text,
  token_cifrado    text not null,
  activa           boolean not null default true,
  ultimo_error     text,
  ultimo_error_en  timestamptz,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  constraint instagram_conexion_page_id check (tipo <> 'facebook_login' or page_id is not null)
);

alter table instagram_conexion enable row level security;
grant select, insert, update on instagram_conexion to app_api;
drop policy if exists app_api_instagram_conexion on instagram_conexion;
create policy app_api_instagram_conexion on instagram_conexion for all to app_api using (true) with check (true);

-- El panel (admin) ve el estado de la conexión, columna por columna: token_cifrado NO se concede.
grant select (id, ig_user_id, usuario, tipo, activa, ultimo_error, ultimo_error_en, creado_en, actualizado_en)
  on instagram_conexion to authenticated;
drop policy if exists admin_lee_instagram_conexion on instagram_conexion;
create policy admin_lee_instagram_conexion on instagram_conexion
  for select to authenticated
  using (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin'));

-- 2. Reglas ------------------------------------------------------------------------------------------------------
create table if not exists respuestas_automaticas (
  id                   uuid primary key default gen_random_uuid(),
  red                  text not null default 'instagram' check (red in ('instagram')),
  -- Nombre de la campaña (la palabra principal): de acá sale la referencia.
  nombre               text not null check (length(btrim(nombre)) between 1 and 40),
  palabras             text[] not null check (cardinality(palabras) between 1 and 10),
  -- 0 a 4 variantes; sin variantes no se responde en público (solo el DM).
  respuestas_publicas  text[] not null default '{}' check (cardinality(respuestas_publicas) <= 4),
  mensaje_dm           text not null check (length(btrim(mensaje_dm)) between 1 and 800),
  -- Lo que queda escrito en WhatsApp al tocar el link (la referencia se agrega sola al final).
  mensaje_whatsapp     text not null check (length(btrim(mensaje_whatsapp)) between 1 and 200),
  -- 'ig-alfajor': la misma que arma referenciaDeCampana (packages/domain/src/campana.ts) y que lee el bot.
  referencia           text not null unique check (referencia ~ '^[a-z0-9][a-z0-9_-]{1,31}$'),
  activa               boolean not null default true,
  clics                integer not null default 0,
  creado_por           uuid references auth.users(id) on delete set null,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now()
);
create index if not exists respuestas_automaticas_activas_idx on respuestas_automaticas (activa, creado_en);

alter table respuestas_automaticas enable row level security;
grant select on respuestas_automaticas to app_api;
-- La API solo suma clics (link corto): nunca cambia la regla.
grant update (clics) on respuestas_automaticas to app_api;
drop policy if exists app_api_respuestas_automaticas on respuestas_automaticas;
create policy app_api_respuestas_automaticas on respuestas_automaticas for all to app_api using (true) with check (true);

grant select, insert, update, delete on respuestas_automaticas to authenticated;
drop policy if exists admin_respuestas_automaticas on respuestas_automaticas;
create policy admin_respuestas_automaticas on respuestas_automaticas
  for all to authenticated
  using (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin'))
  with check (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin'));

-- 3. Registro de comentarios atendidos ----------------------------------------------------------------------------
create table if not exists respuestas_automaticas_envios (
  id                   uuid primary key default gen_random_uuid(),
  regla_id             uuid references respuestas_automaticas(id) on delete cascade,
  comentario_id        text not null unique,
  media_id             text,
  autor_id             text,
  autor_usuario        text,
  texto                text,
  respuesta_publica    text,
  respuesta_publica_ok boolean,
  dm_ok                boolean,
  -- procesando → enviado (todo bien) · parcial (salió una de las dos) · error (ninguna) · omitido (no se mandó el DM a
  -- propósito, ej. la misma persona ya lo recibió hace poco).
  estado               text not null default 'procesando'
                       check (estado in ('procesando', 'enviado', 'parcial', 'error', 'omitido')),
  motivo               text,
  creado_en            timestamptz not null default now()
);
create index if not exists respuestas_automaticas_envios_regla_idx on respuestas_automaticas_envios (regla_id, creado_en desc);
create index if not exists respuestas_automaticas_envios_autor_idx on respuestas_automaticas_envios (regla_id, autor_id, creado_en desc);

alter table respuestas_automaticas_envios enable row level security;
grant select, insert, update on respuestas_automaticas_envios to app_api;
drop policy if exists app_api_respuestas_automaticas_envios on respuestas_automaticas_envios;
create policy app_api_respuestas_automaticas_envios on respuestas_automaticas_envios
  for all to app_api using (true) with check (true);

grant select on respuestas_automaticas_envios to authenticated;
drop policy if exists admin_lee_respuestas_automaticas_envios on respuestas_automaticas_envios;
create policy admin_lee_respuestas_automaticas_envios on respuestas_automaticas_envios
  for select to authenticated
  using (exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin'));

-- 4. Resultados por regla (solo admin) -----------------------------------------------------------------------------
-- Pedidos e ingresos con el mismo criterio que Métricas (estado distinto de cancelado) y sin los clientes internos
-- (envíos a los propios locales), igual que Origen de clientes.
create or replace function respuestas_automaticas_resumen()
returns table(regla_id uuid, comentarios bigint, dms bigint, clics integer, pedidos bigint, ingresos numeric)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from usuarios_dashboard u where u.id = (select auth.uid()) and u.rol = 'admin') then
    raise exception 'Las respuestas automáticas son solo para dirección' using errcode = '42501';
  end if;
  return query
  select
    r.id,
    (select count(*) from respuestas_automaticas_envios e where e.regla_id = r.id)::bigint,
    (select count(*) from respuestas_automaticas_envios e where e.regla_id = r.id and e.dm_ok)::bigint,
    r.clics,
    (select count(*) from orders o join customers c on c.id = o.customer_id
      where o.campana = r.referencia and o.estado <> 'cancelled' and not coalesce(c.es_interno, false))::bigint,
    (select coalesce(sum(o.total), 0) from orders o join customers c on c.id = o.customer_id
      where o.campana = r.referencia and o.estado <> 'cancelled' and not coalesce(c.es_interno, false))::numeric
  from respuestas_automaticas r;
end
$$;
revoke all on function respuestas_automaticas_resumen() from public;
grant execute on function respuestas_automaticas_resumen() to authenticated;

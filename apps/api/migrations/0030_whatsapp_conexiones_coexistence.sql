-- ============================================================================
-- ACTUALIZADO 2026-10-21 (todavía NO aplicada en ningún Supabase real, por eso se
-- edita aquí y no en una migración nueva): cambio de plan para WhatsApp — el bot va a
-- usar un NÚMERO NUEVO, SOLO para el bot, conectado directo a la API de Meta en una app
-- del portafolio de Bake Brothers, con token de usuario del sistema. Los números de las
-- tiendas no se tocan. Por eso `whatsapp_conexiones`:
--   - `uso`: 'sede' (el número de un local, como el modelo Coexistence original) o 'bot'
--     (el número del bot, que NO pertenece a una sola sede);
--   - `sede_id` ahora es opcional: obligatorio si uso = 'sede', NULL si uso = 'bot'
--     (constraint). La sede de un pedido del bot sale de lo que responde el cliente
--     (¿en qué local recoges, o es delivery?) — ver packages/domain sedeDelPedido.ts;
--   - `tipo_token` admite 'sistema' (token de usuario del sistema, permanente).
-- El Embedded Signup NO se terminó de construir; queda apagado (WHATSAPP_EMBEDDED_SIGNUP).
-- ============================================================================

-- ============================================================================
-- 0030_whatsapp_conexiones_coexistence — base para conectar los números de
-- WhatsApp de cada sede vía Embedded Signup (Coexistence) con la app de
-- DevHorses como Tech Provider.
--
-- Cambio de modelo (2026-10-02): ya no hay una app de Meta de Bake Brothers
-- ni un token único en una variable de entorno (META_WHATSAPP_TOKEN). La app
-- es de DevHorses y el token para enviar sale del Embedded Signup (token de
-- negocio), UNO por número conectado. Se guarda cifrado (AES-256-GCM, clave
-- en WHATSAPP_TOKEN_ENCRYPTION_KEY — el cifrado lo hace apps/api, la base
-- solo ve texto opaco) en `whatsapp_conexiones`, tabla que ningún rol del
-- dashboard puede leer: sin grants para anon/authenticated (regla de 0013),
-- solo app_api, y RLS activa con la política de bypass de app_api (mismo
-- patrón que orders/conversaciones) como defensa en profundidad.
--
-- Qué hace esta migración:
--   1. `whatsapp_conexiones`: una fila por número conectado (waba_id,
--      phone_number_id, sede, token cifrado, tipo/origen, marcas de la
--      sincronización inicial). `tipo_token = 'prueba'` + `origen =
--      'manual'` permite registrar a mano el número de prueba de DevHorses
--      (ensayos y videos del App Review antes de que el Embedded Signup
--      esté aprobado). Una sola conexión ACTIVA por sede.
--   2. `sedes.whatsapp_waba_id`: junto al phone_number_id que ya existía.
--   3. `conversaciones.pausada_por_echo` / `ultimo_mensaje_humano_en`: el bot
--      se calla cuando un humano responde desde el celular (message echo) y
--      retoma solo pasadas X horas — pero SOLO si la pausa vino de un echo
--      (`pausada_por_echo`), nunca si el bot escaló (semáforo, alergia,
--      reclamo, error) y luego tomó un humano.
--   4. Trigger de transición de estado: agrega `activa → atendida_por_operador`
--      y `cerrada → atendida_por_operador` (echo de Coexistence; transcribe
--      packages/domain/src/conversationStatus.ts, misma duplicación
--      puntual de 0017) y apaga `pausada_por_echo` apenas la conversación
--      sale de `atendida_por_operador` por cualquier vía (incluido un
--      UPDATE directo desde el dashboard), para que el flag nunca quede
--      pegado de una pausa anterior.
-- ============================================================================

-- ——— 1. whatsapp_conexiones ————————————————————————————————————————————————
create table whatsapp_conexiones (
  id                            uuid primary key default gen_random_uuid(),
  -- NULL solo para el número del bot (uso = 'bot'); ver el constraint de abajo.
  sede_id                       uuid references sedes(id),
  uso                           text not null default 'sede' check (uso in ('sede', 'bot')),
  waba_id                       text not null,
  phone_number_id               text not null unique,
  business_id                   text,
  -- iv.tag.ciphertext en base64 (ver apps/api/src/bot/cifrado.ts) — nunca el token en claro.
  token_cifrado                 text not null,
  tipo_token                    text not null check (tipo_token in ('negocio', 'prueba', 'sistema')),
  origen                        text not null check (origen in ('embedded_signup', 'manual')),
  estado                        text not null default 'activa' check (estado in ('activa', 'desconectada')),
  -- Meta da UNA sola oportunidad por tipo, dentro de las 24 h posteriores a
  -- la conexión (smb_app_data) — se marca ANTES de pedir para que un
  -- reintento no gaste el único intento.
  sync_contactos_solicitado_en  timestamptz,
  sync_historial_solicitado_en  timestamptz,
  conectado_en                  timestamptz not null default now(),
  actualizado_en                timestamptz not null default now(),
  -- Un número de local tiene sede; el del bot no. Nunca uno sin lo otro.
  constraint whatsapp_conexiones_uso_sede check ((uso = 'bot') = (sede_id is null))
);

-- Una sola conexión activa por sede (un número por sede, como sedes.whatsapp_phone_number_id).
create unique index idx_whatsapp_conexiones_una_activa_por_sede
  on whatsapp_conexiones (sede_id) where estado = 'activa';

alter table whatsapp_conexiones enable row level security;

create policy app_api_whatsapp_conexiones on whatsapp_conexiones
  for all to app_api
  using (true) with check (true);

grant select, insert, update on whatsapp_conexiones to app_api;

-- ——— 2. sedes.whatsapp_waba_id ——————————————————————————————————————————————
alter table sedes add column whatsapp_waba_id text;

-- ——— 3. conversaciones: pausa por echo ——————————————————————————————————————
alter table conversaciones
  add column pausada_por_echo boolean not null default false,
  add column ultimo_mensaje_humano_en timestamptz,
  -- Número de WhatsApp por el que escribió el cliente la última vez: desde ese mismo número se le
  -- responde. Con el número del bot (uso = 'bot') no hay sede de donde sacarlo, y un número de un
  -- local ya lo tiene en su conexión — esta columna sirve para los dos casos.
  add column whatsapp_phone_number_id text;

-- ——— 4. Trigger de transición de estado ————————————————————————————————————
create or replace function validar_transicion_estado_conversacion()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  transiciones jsonb := '{
    "activa":                ["escalada", "cerrada", "atendida_por_operador"],
    "escalada":               ["atendida_por_operador", "cerrada"],
    "atendida_por_operador":  ["activa", "cerrada"],
    "cerrada":                ["activa", "atendida_por_operador"]
  }'::jsonb;
begin
  if new.estado = old.estado then
    return new;
  end if;
  if not (transiciones -> old.estado) ? new.estado then
    raise exception 'Transición de conversación inválida: % → %', old.estado, new.estado
      using errcode = '23514';
  end if;
  -- La pausa por echo solo tiene sentido mientras la conversación está
  -- atendida por un operador. Al salir de ahí (vuelve al bot, se cierra...)
  -- el flag se apaga solo, sin importar quién cambió el estado.
  if new.estado <> 'atendida_por_operador' then
    new.pausada_por_echo := false;
  end if;
  return new;
end;
$$;


-- ——— 5. Conversaciones SIN sede (las del número del bot) ———————————————————————
-- La RLS de 0017 deja ver/atender una conversación solo al admin o al operador de SU sede. Las
-- conversaciones del número del bot nacen sin sede (la sede de cada pedido sale de lo que
-- responde el cliente, no del número) — con esa política ningún operador las vería ni podría
-- tomarlas. Se agrega: una conversación sin sede la ve y la atiende cualquier persona del
-- personal del panel (existe en usuarios_dashboard). Las que SÍ tienen sede no cambian.
drop policy conversaciones_select_por_sede on conversaciones;
drop policy conversaciones_update_por_sede on conversaciones;

create policy conversaciones_select_por_sede on conversaciones
  for select to authenticated
  using (
    exists (
      select 1 from usuarios_dashboard u
      where u.id = (select auth.uid())
        and (u.rol = 'admin' or conversaciones.sede_id is null or u.sede_id = conversaciones.sede_id)
    )
  );

create policy conversaciones_update_por_sede on conversaciones
  for update to authenticated
  using (
    exists (
      select 1 from usuarios_dashboard u
      where u.id = (select auth.uid())
        and (u.rol = 'admin' or conversaciones.sede_id is null or u.sede_id = conversaciones.sede_id)
    )
  )
  with check (
    exists (
      select 1 from usuarios_dashboard u
      where u.id = (select auth.uid())
        and (u.rol = 'admin' or conversaciones.sede_id is null or u.sede_id = conversaciones.sede_id)
    )
  );

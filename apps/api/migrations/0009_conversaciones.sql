-- ============================================================================
-- 0009_conversaciones — base del bot omnicanal (Semana 2)
--
-- Persiste el estado de cada chat (WhatsApp/Facebook/Instagram) para que el
-- bot pueda retomar contexto entre mensajes y el dashboard (Semana 3) pueda
-- listar conversaciones escaladas. La máquina de estados es una extensión
-- del mismo patrón que orders (ver packages/domain/src/conversationStatus.ts,
-- no algo desconectado de eso): activa → escalada → atendida_por_operador →
-- cerrada, con cerrada → activa para cuando el mismo número vuelve a escribir.
--
-- Todavía no hay lógica de bot real conectada (Semana 2 solo prepara el
-- terreno) — esta migración es únicamente el modelo de datos.
-- ============================================================================

create table conversaciones (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  canal              text not null check (canal in ('whatsapp', 'facebook', 'instagram')),
  -- Número de WhatsApp (formato E.164 sin '+') o PSID de Messenger/Instagram.
  external_id        text not null,
  -- Se resuelve cuando el webhook trae un whatsapp_phone_number_id conocido
  -- (ver sedes.whatsapp_phone_number_id, 0004); null si no se pudo mapear o
  -- el canal es FB/IG (Meta no manda esa info por sede ahí).
  sede_id            uuid references sedes(id),
  estado             text not null default 'activa'
                       check (estado in ('activa', 'escalada', 'atendida_por_operador', 'cerrada')),
  -- Memoria de corto plazo del bot: slots de un pedido en construcción,
  -- última intención detectada, etc. Estructura libre a propósito — la
  -- define el diseño del bot (Semana 2, fuera de esta migración).
  contexto           jsonb not null default '{}'::jsonb,
  -- Log de mensajes entrantes/salientes: [{rol, texto, en}, ...]. Jsonb
  -- embebido (no una tabla aparte) porque el volumen por conversación es
  -- chico y no hace falta paginar ni full-text search todavía — si eso
  -- cambia, se puede migrar a una tabla `mensajes_conversacion` después.
  historial          jsonb not null default '[]'::jsonb,
  ultimo_mensaje_en  timestamptz not null default now(),
  creado_en          timestamptz not null default now(),
  -- Una fila por identidad externa: el mismo número no tiene dos
  -- conversaciones "vivas" en paralelo dentro de un mismo canal.
  unique (tenant_id, canal, external_id)
);

create index idx_conversaciones_estado on conversaciones (estado);
create index idx_conversaciones_sede on conversaciones (sede_id);

grant select, insert, update on conversaciones to app_api;

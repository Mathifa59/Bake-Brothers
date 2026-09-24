-- ============================================================================
-- 0025_eventos_meta_sin_procesar — payloads reales de Facebook/Instagram,
-- guardados para construir su parser después
--
-- POST /webhook hoy solo tiene parser real para WhatsApp
-- (bot/parsearMensajesWhatsApp.ts) — un evento de Messenger (`object:
-- "page"`) o Instagram (`object: "instagram"`) se loggea y se descarta sin
-- procesar. Antes eso se perdía apenas rotaban los logs de Coolify; ahora
-- queda el payload crudo completo acá, para cuando se construya el parser
-- real de esos dos canales — contra ejemplos reales que de verdad llegaron,
-- no contra la documentación de Meta a ciegas.
--
-- Sin RLS a propósito (mismo criterio que mensajes_webhook_procesados,
-- catering_items, etc.): la usa únicamente app_api por conexión directa,
-- nunca por REST — cerrada por ausencia de grant a anon/authenticated.
-- ============================================================================

create table eventos_meta_sin_procesar (
  id            uuid primary key default gen_random_uuid(),
  canal         text not null check (canal in ('facebook', 'instagram')),
  payload       jsonb not null,
  recibido_en   timestamptz not null default now()
);

create index idx_eventos_meta_sin_procesar_canal on eventos_meta_sin_procesar (canal);

grant select, insert on eventos_meta_sin_procesar to app_api;

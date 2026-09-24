-- ============================================================================
-- 0024_mensajes_webhook_procesados — idempotencia real para POST /webhook
--
-- Meta puede reintentar la entrega de un webhook y mandar el mismo mensaje
-- más de una vez (documentado por ellos: "puede resultar en notificaciones
-- de webhook duplicadas"). Antes de correr el cerebro del bot para un
-- mensaje, el handler intenta insertar acá el `mensaje_id` real que manda
-- WhatsApp — si el insert no inserta nada (ya existe), el mensaje ya se
-- procesó y no se vuelve a correr nada.
--
-- Tabla propia, no una columna en `conversaciones`: un mensaje puede llegar
-- ANTES de que exista la conversación (primer contacto de un cliente nuevo),
-- así que la marca de "ya visto" no puede depender de tener ya una fila ahí.
-- Sin RLS a propósito (mismo criterio que contenido_rag/catering_items/
-- reglas_catering): la usa únicamente app_api por conexión directa, nunca
-- por REST — cerrada por ausencia de grant a anon/authenticated, no por RLS.
-- ============================================================================

create table mensajes_webhook_procesados (
  mensaje_id    text primary key,
  procesado_en  timestamptz not null default now()
);

grant select, insert on mensajes_webhook_procesados to app_api;

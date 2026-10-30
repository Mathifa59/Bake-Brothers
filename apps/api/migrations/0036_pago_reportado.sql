-- ============================================================================
-- 0036_pago_reportado — captura de pago leída por el bot + confirmación humana con un toque
--
-- Decisión del negocio (2026-10-30): si el cliente manda una captura de pago, el bot la lee (monto, fecha,
-- número de operación) y deja el pedido como "pago reportado"; en el panel, la trabajadora lo CONFIRMA o lo
-- RECHAZA con un toque. El bot nunca da un pago por confirmado solo.
--
-- Se modela SIN tocar la máquina de estados del pedido: "pago reportado" no es un estado nuevo sino un dato
-- sobre un pedido que sigue en `payment_pending`. Confirmar = pasar a `paid` (transición que ya existe) +
-- resultado 'confirmado'; rechazar = seguir en `payment_pending` + resultado 'rechazado' (el cliente puede
-- mandar otra captura, que vuelve a dejar el reporte pendiente).
--
--   orders.pago_reportado      jsonb   lo que se leyó de la captura y cómo cuadra con el pedido:
--                                      { monto, moneda, fecha, numeroOperacion, medio, coincideTotal,
--                                        requiereRevision, motivos[], mediaId }
--   orders.pago_reportado_en   timestamptz
--   orders.pago_resultado      text    null = pendiente de revisar; 'confirmado' | 'rechazado'
--   orders.pago_revisado_por   uuid    quién lo revisó (lo llena un trigger con auth.uid(); no lo manda el navegador)
--   orders.pago_revisado_en    timestamptz
--   orders.conversacion_id     uuid    la conversación del bot que creó el pedido: así una captura que llega
--                                      por esa conversación se asocia a SU pedido pendiente de pago.
--
-- Permisos: `authenticated` ya tiene select/update a nivel de tabla sobre orders (0011), así que las columnas
-- nuevas heredan eso; la RLS por sede (0011/0035) sigue mandando. Nada nuevo queda abierto a anon.
-- Idempotente.
-- ============================================================================

alter table orders
  add column if not exists pago_reportado     jsonb,
  add column if not exists pago_reportado_en  timestamptz,
  add column if not exists pago_resultado     text,
  add column if not exists pago_revisado_por  uuid,
  add column if not exists pago_revisado_en   timestamptz,
  add column if not exists conversacion_id    uuid references conversaciones(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_pago_resultado_check') then
    alter table orders add constraint orders_pago_resultado_check
      check (pago_resultado is null or pago_resultado in ('confirmado', 'rechazado'));
  end if;
  -- No se puede confirmar ni rechazar un pago que nadie reportó.
  if not exists (select 1 from pg_constraint where conname = 'orders_pago_resultado_requiere_reporte') then
    alter table orders add constraint orders_pago_resultado_requiere_reporte
      check (pago_resultado is null or pago_reportado is not null);
  end if;
end $$;

create index if not exists orders_conversacion_id_idx on orders (conversacion_id) where conversacion_id is not null;
-- "Pagos por confirmar": pedidos con un pago reportado todavía sin revisar.
create index if not exists orders_pago_por_confirmar_idx on orders (pago_reportado_en)
  where pago_reportado is not null and pago_resultado is null;

-- Quién y cuándo revisó el pago: lo pone la base con la sesión real, no el navegador (que podría mentir).
create or replace function registrar_revision_de_pago()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.pago_resultado is distinct from old.pago_resultado and new.pago_resultado is not null then
    -- auth.uid() solo existe para una sesión del panel (rol authenticated). Si el UPDATE lo hace otro rol (la API,
    -- que no tiene acceso al esquema auth), no hay revisor que registrar: queda en null en vez de fallar.
    begin
      new.pago_revisado_por := auth.uid();
    exception when insufficient_privilege then
      new.pago_revisado_por := null;
    end;
    new.pago_revisado_en := now();
  end if;
  -- Un reporte nuevo (otra captura) reabre la revisión: se limpia el resultado anterior.
  if new.pago_reportado_en is distinct from old.pago_reportado_en and new.pago_resultado is not distinct from old.pago_resultado then
    new.pago_resultado := null;
    new.pago_revisado_por := null;
    new.pago_revisado_en := null;
  end if;
  return new;
end;
$$;

drop trigger if exists registrar_revision_de_pago_trigger on orders;
create trigger registrar_revision_de_pago_trigger
  before update on orders
  for each row
  execute function registrar_revision_de_pago();

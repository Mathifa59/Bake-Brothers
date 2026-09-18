-- ============================================================================
-- 0017_rls_conversaciones — bandeja de conversaciones del dashboard
--
-- Mismo patrón que 0011 (orders/stock): app_api sigue con paso libre (ya
-- tenía select/insert/update desde 0009, para cuando el bot exista de
-- verdad — no se toca), authenticated ve/edita solo según rol/sede — admin
-- todo, operador solo sus conversaciones (sede_id = la suya). Una
-- conversación sin sede_id asignado (no se pudo mapear el
-- whatsapp_phone_number_id, o el canal es FB/IG) solo la ve un admin, igual
-- que ya pasa con orders.sede_id null — es intencional, no un descuido: hay
-- que triarla/asignarla antes de que un operador la vea.
--
-- Trigger de transición de estado: mismo criterio que orders — RLS decide
-- QUIÉN puede tocar la fila, el trigger decide QUÉ valor puede escribir,
-- sin importar quién sea. Transcribe TRANSICIONES_VALIDAS_CONVERSACION de
-- packages/domain/src/conversationStatus.ts (misma duplicación puntual e
-- inevitable que ya existe para orders).
--
-- De paso: se le agrega `set search_path` a las dos funciones de trigger
-- (esta y la de orders) — un advisor de seguridad ya lo había señalado
-- (function_search_path_mutable) cuando se creó la de orders; se posterga
-- entonces, se corrige ahora que se toca código igual.
-- ============================================================================

grant select, update on conversaciones to authenticated;

alter table conversaciones enable row level security;

create policy app_api_conversaciones on conversaciones
  for all to app_api
  using (true) with check (true);

create policy conversaciones_select_por_sede on conversaciones
  for select to authenticated
  using (
    exists (
      select 1 from usuarios_dashboard u
      where u.id = auth.uid() and (u.rol = 'admin' or u.sede_id = conversaciones.sede_id)
    )
  );

create policy conversaciones_update_por_sede on conversaciones
  for update to authenticated
  using (
    exists (
      select 1 from usuarios_dashboard u
      where u.id = auth.uid() and (u.rol = 'admin' or u.sede_id = conversaciones.sede_id)
    )
  )
  with check (
    exists (
      select 1 from usuarios_dashboard u
      where u.id = auth.uid() and (u.rol = 'admin' or u.sede_id = conversaciones.sede_id)
    )
  );


-- ============================================================================
-- Trigger de transición de estado — mismo criterio que orders (0011)
-- ============================================================================
create or replace function validar_transicion_estado_conversacion()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  transiciones jsonb := '{
    "activa":                ["escalada", "cerrada"],
    "escalada":               ["atendida_por_operador", "cerrada"],
    "atendida_por_operador":  ["activa", "cerrada"],
    "cerrada":                ["activa"]
  }'::jsonb;
begin
  if new.estado = old.estado then
    return new;
  end if;
  if not (transiciones -> old.estado) ? new.estado then
    raise exception 'Transición de conversación inválida: % → %', old.estado, new.estado
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validar_transicion_estado_conversacion_trigger
  before update of estado on conversaciones
  for each row
  execute function validar_transicion_estado_conversacion();

-- Corrige el mismo advisor sobre la función de orders, de paso.
alter function validar_transicion_estado_pedido() set search_path = public, pg_temp;

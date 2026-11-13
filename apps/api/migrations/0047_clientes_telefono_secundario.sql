-- ============================================================================
-- 0047_clientes_telefono_secundario — un cliente puede tener dos teléfonos
--
-- Hay clientes (mayoristas, sobre todo) que escriben desde dos números. Hasta hoy `customers.telefono` era el único
-- teléfono y la clave de identidad (único por negocio, 0045): el segundo número creaba un cliente aparte. Ahora:
--   · telefono            = el principal (sin cambios: sigue siendo el que usan los pedidos y la facturación).
--   · telefono_secundario = otro número del MISMO cliente. Cuando escribe desde cualquiera de los dos, el bot, los
--                           pedidos y el panel lo reconocen como la misma persona.
--
-- Reglas que sostiene la BASE (no solo el código):
--   1. Formato E.164, igual que el principal.
--   2. Solo puede haber secundario si hay principal, y no puede ser el mismo número.
--   3. Un número no puede estar en dos clientes, NI siquiera cruzado: el secundario de uno no puede ser el principal
--      ni el secundario de otro (índice único para secundario-secundario y trigger para el cruce principal-secundario).
-- Sin cambios de permisos: la tabla ya tiene sus políticas y grants (0014/0045); la columna nueva los hereda.
-- ============================================================================

alter table customers add column telefono_secundario text;

alter table customers
  add constraint customers_telefono_secundario_e164
  check (telefono_secundario is null or telefono_secundario ~ '^\+[1-9][0-9]{7,14}$');

alter table customers
  add constraint customers_telefono_secundario_valido
  check (telefono_secundario is null or (telefono is not null and telefono_secundario <> telefono));

create unique index customers_tenant_telefono_secundario_unico
  on customers (tenant_id, telefono_secundario) where telefono_secundario is not null;

-- Cruce principal ↔ secundario entre clientes distintos (los índices únicos solo ven cada columna por separado).
create or replace function customers_telefonos_sin_cruce() returns trigger
language plpgsql as $$
begin
  if exists (
    select 1 from customers c
     where c.tenant_id = new.tenant_id
       and c.id <> new.id
       and ((new.telefono_secundario is not null and c.telefono = new.telefono_secundario)
         or (new.telefono is not null and c.telefono_secundario = new.telefono))
  ) then
    raise exception 'Ese teléfono ya pertenece a otro cliente (como principal o como secundario).'
      using errcode = '23505';
  end if;
  return new;
end;
$$;

create trigger customers_telefonos_sin_cruce_trg
  before insert or update of telefono, telefono_secundario on customers
  for each row
  when (new.telefono is not null or new.telefono_secundario is not null)
  execute function customers_telefonos_sin_cruce();

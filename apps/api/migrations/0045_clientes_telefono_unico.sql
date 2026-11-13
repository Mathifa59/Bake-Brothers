-- ============================================================================
-- 0045_clientes_telefono_unico — Etapa 4 (clientes)
--
-- 1) El teléfono del cliente se guarda SIEMPRE en E.164 («+51912944096») y es único por negocio: antes se
--    guardaba tal como lo escribía quien tomaba el pedido («912944096», «51 912 944 096»…) y findOrCreateCustomer
--    comparaba el texto exacto, así que la misma persona podía quedar duplicada.
-- 2) El teléfono es opcional: los mayoristas que vienen de la hoja DATOS de la plantilla no tienen teléfono todavía.
-- 3) customers.nombre_confirmado: un cliente creado automáticamente al escribir por WhatsApp lleva el nombre del
--    perfil de WhatsApp (o su número) hasta que un pedido le dé su nombre real.
-- 4) conversaciones.customer_id: la conversación queda enlazada al cliente (se busca por teléfono; si no existe se crea).
-- 5) Una persona del panel ve al cliente de una conversación que ella misma puede ver (aunque aún no tenga pedidos).
--
-- Al aplicarla en el Supabase real: customers y conversaciones estaban vacías (0 filas), así que no hay datos que
-- normalizar; el UPDATE de abajo solo protege otras bases (por ejemplo, copias locales de prueba).
-- ============================================================================

alter table customers alter column telefono drop not null;
alter table customers add column nombre_confirmado boolean not null default true;

-- Normaliza lo que ya exista a E.164 (solo lo reconocible: celular peruano de 9 dígitos, con o sin 51).
update customers c
   set telefono = n.e164
  from (
    select id,
           case
             when d ~ '^9[0-9]{8}$'       then '+51' || d
             when d ~ '^519[0-9]{8}$'     then '+' || d
             when d ~ '^0[1-8][0-9]{7}$'  then '+51' || substr(d, 2)
           end as e164
      from (select id, regexp_replace(telefono, '\D', '', 'g') as d from customers where telefono is not null) x
  ) n
 where c.id = n.id and n.e164 is not null and c.telefono is distinct from n.e164;

-- NOT VALID: se exige para lo que se inserte o actualice de ahora en adelante; un dato viejo no reconocible no
-- bloquea la migración (habría que revisarlo a mano).
alter table customers
  add constraint customers_telefono_e164 check (telefono is null or telefono ~ '^\+[1-9][0-9]{7,14}$') not valid;

-- Sin duplicados: un teléfono, un cliente. (Si hubiera duplicados previos, esto falla a propósito: hay que unirlos.)
create unique index customers_tenant_telefono_unico on customers (tenant_id, telefono) where telefono is not null;
drop index if exists idx_customers_tenant_telefono;

alter table conversaciones add column customer_id uuid references customers(id) on delete set null;
create index idx_conversaciones_customer on conversaciones (customer_id);

-- Enlaza las conversaciones de WhatsApp que ya existan con su cliente (por teléfono exacto).
update conversaciones cv
   set customer_id = cu.id
  from customers cu
 where cv.canal = 'whatsapp' and cv.customer_id is null
   and cu.tenant_id = cv.tenant_id
   and cu.telefono = '+' || regexp_replace(cv.external_id, '\D', '', 'g');

-- Segunda política de lectura (se suma a la de pedidos: las de un mismo tipo se combinan con OR). La política de
-- conversaciones se aplica sola dentro del subselect, así que cada persona solo ve a los clientes de las
-- conversaciones que ya puede ver.
create policy customers_select_por_conversacion on customers
  for select to authenticated
  using (exists (select 1 from conversaciones c where c.customer_id = customers.id));

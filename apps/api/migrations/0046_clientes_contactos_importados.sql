-- ============================================================================
-- 0046_clientes_contactos_importados — base de contactos para mensajes masivos
--
-- El negocio tiene una agenda de contactos del celular (miles de personas) que quiere tener dentro de Bake OS como
-- una pequeña base de datos: para reconocer a quien escribe por WhatsApp y, cuando la API de WhatsApp esté migrada,
-- para mandar mensajes masivos. Esos contactos NO son clientes nuevos ni compradores: son personas de la lista.
--
-- 1) customers.origen: de dónde salió el registro. NULL = cliente normal (pedido, WhatsApp, mayorista de la hoja);
--    'contactos' = importado de la agenda. Los de origen 'contactos' no cuentan como «Nuevos del mes».
-- 2) customers.acepta_marketing: consentimiento para recibir mensajes masivos / promocionales. NULL = todavía no se
--    sabe (el caso de TODOS los importados). Las reglas de WhatsApp Business exigen que la persona haya aceptado
--    recibir mensajes de la marca; el envío masivo debe filtrar por acepta_marketing = true, nunca por «tiene
--    teléfono». Quien escriba primero al número o lo pida en una compra se marca true con la fecha de aceptación.
-- 3) customers.acepta_marketing_en: cuándo aceptó (para poder demostrarlo).
--
-- Sin cambios de permisos: customers ya tiene sus políticas (0014/0045); las columnas nuevas las hereda.
-- ============================================================================

alter table customers add column origen text;
alter table customers add column acepta_marketing boolean;
alter table customers add column acepta_marketing_en timestamptz;

alter table customers
  add constraint customers_origen_valido check (origen is null or origen in ('contactos'));

-- Filtrar/contar por origen y por consentimiento sin recorrer toda la tabla.
create index idx_customers_origen on customers (origen) where origen is not null;
create index idx_customers_acepta_marketing on customers (acepta_marketing) where acepta_marketing is true;

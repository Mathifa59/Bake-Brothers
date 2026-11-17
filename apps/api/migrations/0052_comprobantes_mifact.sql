-- ============================================================================
-- 0052_comprobantes_mifact — boletas y facturas electrónicas emitidas desde un pedido (Mifact)
--
-- Una fila por comprobante emitido (o intentado) a partir de un pedido de Bake OS. Guarda lo que hay que poder
-- revisar y reconstruir: quién lo emitió (razón social), en qué entorno (demo / producción), serie y correlativo,
-- el receptor, los montos, lo que se le mandó a Mifact (SIN el token), el estado que devuelve Mifact/SUNAT
-- (101 en proceso, 102 aceptado, 103 aceptado con observaciones, 104 rechazado, 105 anulado, 108 anulación
-- solicitada), el PDF y el correo enviado.
--
-- NUMERACIÓN: el correlativo lo genera NUESTRO sistema (el servicio de Mifact no lo genera). La tabla
-- `comprobantes_numeradores` lleva el último número usado por (emisor, entorno, serie) y se incrementa de forma
-- atómica; un número que pudo haber llegado a Mifact (envío con respuesta dudosa) NUNCA se reutiliza para otro pedido.
--
-- SEGURIDAD (0013): las tablas nuevas nacen cerradas. NADA para anon ni authenticated: tienen datos de receptores
-- (DNI/RUC) y el PDF; solo la API (app_api) las lee y escribe, y solo la usan rutas de administrador.
--
-- Idempotente: se puede correr dos veces sin duplicar ni pisar nada.
-- ============================================================================

create table if not exists comprobantes_numeradores (
  tenant_id uuid not null references tenants(id) on delete cascade,
  emisor    text not null check (emisor in ('baker_brothers', 'hermanos_loarte')),
  entorno   text not null check (entorno in ('demo', 'produccion')),
  serie     text not null check (serie ~ '^[BF][A-Z0-9]{3}$'),
  ultimo    integer not null default 0 check (ultimo >= 0),
  primary key (tenant_id, emisor, entorno, serie)
);

create table if not exists comprobantes (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  -- Sin `on delete cascade`: un comprobante es un documento fiscal, no se pierde porque se borre un pedido.
  order_id           uuid not null references orders(id),
  emisor             text not null check (emisor in ('baker_brothers', 'hermanos_loarte')),
  entorno            text not null check (entorno in ('demo', 'produccion')),
  tipo               text not null check (tipo in ('boleta', 'factura')),
  serie              text not null check (serie ~ '^[BF][A-Z0-9]{3}$'),
  correlativo        integer not null check (correlativo > 0),
  fecha_emision      date not null,

  -- Receptor (catálogo 06 de SUNAT: 0 sin documento, 1 DNI, 4 carnet de extranjería, 6 RUC, 7 pasaporte).
  receptor_tipo_doc  text not null check (receptor_tipo_doc in ('0', '1', '4', '6', '7', 'A', 'F')),
  receptor_doc       text not null,
  receptor_nombre    text not null,
  receptor_direccion text,
  receptor_correo    text,

  gravado            numeric(12,2) not null,
  igv                numeric(12,2) not null,
  total              numeric(12,2) not null,

  -- Lo que se le mandó a Mifact, SIN el token: permite reenviar exactamente lo mismo si la respuesta se perdió.
  payload            jsonb not null,

  estado             text not null default 'pendiente_envio' check (estado in (
                       'pendiente_envio', 'en_proceso', 'aceptado', 'aceptado_con_observaciones',
                       'rechazado', 'anulacion_solicitada', 'anulado', 'error')),
  estado_codigo      smallint check (estado_codigo in (101, 102, 103, 104, 105, 108)),
  sunat_codigo       text,
  sunat_descripcion  text,
  sunat_nota         text,
  hash               text,
  cadena_qr          text,

  -- PDF: la URL pública que publica Mifact y una copia guardada acá (unas decenas de KB).
  url_pdf            text,
  pdf                bytea,
  pdf_guardado_en    timestamptz,

  motivo_anulacion        text,
  anulacion_solicitada_en timestamptz,
  correo_enviado_a        text,
  correo_enviado_en       timestamptz,

  ultimo_error       text,
  intentos           integer not null default 0,
  creado_por         uuid,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  consultado_en      timestamptz,

  constraint comprobantes_numero_uniq unique (tenant_id, emisor, entorno, serie, correlativo),
  constraint comprobantes_tipo_serie check (
    (tipo = 'boleta' and serie like 'B%') or (tipo = 'factura' and serie like 'F%')
  )
);

create index if not exists idx_comprobantes_order on comprobantes (order_id);

-- Un pedido tiene A LO SUMO un comprobante vigente. «Vigente» = todavía vale o está por resolverse; un comprobante
-- rechazado, con error, anulado o con la anulación ya solicitada deja el pedido libre para emitir otro.
create unique index if not exists comprobantes_uno_vigente_por_pedido
  on comprobantes (order_id)
  where estado in ('pendiente_envio', 'en_proceso', 'aceptado', 'aceptado_con_observaciones');

alter table comprobantes_numeradores enable row level security;
alter table comprobantes enable row level security;

-- Solo la API. Nada para anon ni authenticated.
grant select, insert, update, delete on comprobantes_numeradores to app_api;
grant select, insert, update, delete on comprobantes to app_api;
drop policy if exists app_api_comprobantes_numeradores on comprobantes_numeradores;
create policy app_api_comprobantes_numeradores on comprobantes_numeradores for all to app_api using (true) with check (true);
drop policy if exists app_api_comprobantes on comprobantes;
create policy app_api_comprobantes on comprobantes for all to app_api using (true) with check (true);

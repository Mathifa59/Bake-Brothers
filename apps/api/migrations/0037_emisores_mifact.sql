-- ============================================================================
-- 0037_emisores_mifact — quién emite los comprobantes de cada sede (para cuando llegue Mifact)
--
-- Decisión del negocio (2026-10-30): cada sede factura con su propia razón social —
--   Cedros       → Corporación Hermanos Loarte S.A.C.
--   Santa Marina → Baker Brothers E.I.R.L.
-- y cada una tendrá su RUC, su token de Mifact y sus series de boleta y factura. Hoy solo se conocen las razones
-- sociales: RUC, series y token quedan vacíos (null) hasta que el cliente los entregue — nada se inventa.
--
-- Va en una tabla APARTE de `sedes` a propósito: `sedes` es legible por todo el personal del panel (es la
-- lista de locales), y aquí vive un TOKEN. Esta tabla NO se le da a `authenticated` ni a `anon`: solo la API
-- (app_api) la lee y escribe, y el token se guarda CIFRADO con la misma clave AES que los tokens de WhatsApp
-- (WHATSAPP_TOKEN_ENCRYPTION_KEY). El panel nunca recibe el token.
--
-- Idempotente: se puede correr dos veces sin duplicar ni pisar lo que ya se cargó.
-- ============================================================================

create table if not exists emisores_mifact (
  sede_id        uuid primary key references sedes(id) on delete cascade,
  razon_social   text not null,
  -- RUC de 11 dígitos; null hasta que el cliente lo entregue.
  ruc            text,
  -- Series de SUNAT: boleta empieza con B y factura con F, seguidas de 3 caracteres (B001, F001…).
  serie_boleta   text,
  serie_factura  text,
  -- Token de la API de Mifact de ESTE emisor, cifrado (AES-256-GCM). Nunca en claro.
  token_cifrado  text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint emisores_mifact_ruc_formato check (ruc is null or ruc ~ '^[0-9]{11}$'),
  constraint emisores_mifact_serie_boleta_formato check (serie_boleta is null or serie_boleta ~ '^B[A-Z0-9]{3}$'),
  constraint emisores_mifact_serie_factura_formato check (serie_factura is null or serie_factura ~ '^F[A-Z0-9]{3}$')
);

-- Un RUC emite por una sola sede en este sistema (cada sede tiene su propio emisor).
create unique index if not exists emisores_mifact_ruc_uniq on emisores_mifact (ruc) where ruc is not null;

alter table emisores_mifact enable row level security;

-- Solo la API. NADA para anon ni authenticated (0013: las tablas nuevas nacen cerradas) — y esta tabla tiene un
-- token, así que tampoco se abre en lectura al personal del panel.
grant select, insert, update, delete on emisores_mifact to app_api;
drop policy if exists app_api_emisores_mifact on emisores_mifact;
create policy app_api_emisores_mifact on emisores_mifact for all to app_api using (true) with check (true);

-- Razones sociales conocidas. `on conflict do nothing`: si ya hay una fila (con RUC, series o token cargados),
-- no se toca.
insert into emisores_mifact (sede_id, razon_social)
select s.id, v.razon_social
from (values
  ('Cedros', 'Corporación Hermanos Loarte S.A.C.'),
  ('Santa Marina', 'Baker Brothers E.I.R.L.')
) as v(nombre, razon_social)
join sedes s on s.nombre = v.nombre
on conflict (sede_id) do nothing;

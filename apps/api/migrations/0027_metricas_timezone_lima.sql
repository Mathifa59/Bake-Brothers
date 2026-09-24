-- ============================================================================
-- 0027_metricas_timezone_lima — corrige un bug real de timezone en las 3
-- funciones de 0026
--
-- `SHOW timezone` en este proyecto de Supabase confirma sesión en UTC (el
-- default de Supabase, no algo que este proyecto haya configurado). Las 3
-- funciones de 0026 casteaban `p_desde`/`p_hasta` (un `date`, sin hora) a
-- `timestamptz` directo — Postgres interpreta ese cast usando el timezone
-- de LA SESIÓN, no el del negocio. Bake Brothers opera en Lima (UTC-5, sin
-- horario de verano) — el resultado real: el límite de "hoy" quedaba
-- corrido 5 horas.
--
-- Reproducido con datos reales antes de corregir (no asumido): un pedido
-- insertado con creado_en = hoy 21:00 hora Lima (dentro de las últimas 5
-- horas del día en Lima) NO aparecía en metricas_kpis('hoy','hoy') —
-- 21:00 Lima = 02:00 UTC del día siguiente, fuera de la ventana
-- [hoy 00:00 UTC, mañana 00:00 UTC) que la función calculaba. Un pedido
-- real tomado por WhatsApp a la hora pico de la tarde/noche simplemente no
-- contaba como "de hoy" hasta que alguien mirara el dashboard al día
-- siguiente.
--
-- Fix: en vez de `fecha::timestamptz` (medianoche EN EL TIMEZONE DE LA
-- SESIÓN), `fecha::timestamp at time zone 'America/Lima'` (medianoche EN
-- LIMA, expresada como el instante UTC real que le corresponde) — el mismo
-- patrón exacto en las 3 funciones. Timezone hardcodeado a propósito, no
-- parametrizado: el negocio entero opera en un solo lugar (Lima), igual
-- que ya asume el resto del código (sin soporte multi-timezone en ningún
-- otro lado).
-- ============================================================================

create or replace function metricas_kpis(p_desde date, p_hasta date, p_sede_id uuid default null)
returns table(pedidos bigint, ingresos numeric, ticket_promedio numeric)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    count(*)::bigint as pedidos,
    coalesce(sum(o.total), 0)::numeric as ingresos,
    case when count(*) = 0 then 0::numeric else round(coalesce(sum(o.total), 0) / count(*), 2) end as ticket_promedio
  from orders o
  where o.creado_en >= (p_desde::timestamp at time zone 'America/Lima')
    and o.creado_en < ((p_hasta + 1)::timestamp at time zone 'America/Lima')
    and o.estado <> 'cancelled'
    and (p_sede_id is null or o.sede_id = p_sede_id)
$$;

create or replace function metricas_productos_vendidos(p_desde date, p_hasta date, p_sede_id uuid default null)
returns table(id uuid, nombre text, cantidad bigint, ingresos numeric)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    coalesce(p.id, c.id) as id,
    coalesce(p.nombre, c.nombre, oi.nombre_producto) as nombre,
    sum(oi.cantidad)::bigint as cantidad,
    sum(oi.precio_unitario * oi.cantidad)::numeric as ingresos
  from order_items oi
  join orders o on o.id = oi.order_id
  left join products p on p.id = oi.product_id
  left join combos c on c.id = oi.combo_id
  where o.creado_en >= (p_desde::timestamp at time zone 'America/Lima')
    and o.creado_en < ((p_hasta + 1)::timestamp at time zone 'America/Lima')
    and o.estado <> 'cancelled'
    and (p_sede_id is null or o.sede_id = p_sede_id)
    and (oi.product_id is not null or oi.combo_id is not null)
  group by coalesce(p.id, c.id), coalesce(p.nombre, c.nombre, oi.nombre_producto)
$$;

create or replace function metricas_tendencia_diaria(p_desde date, p_hasta date, p_sede_id uuid default null)
returns table(fecha date, pedidos bigint, ingresos numeric)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    dias.fecha::date as fecha,
    coalesce(count(o.id), 0)::bigint as pedidos,
    coalesce(sum(o.total), 0)::numeric as ingresos
  from generate_series(p_desde::timestamp, p_hasta::timestamp, interval '1 day') as dias(fecha)
  left join orders o
    on o.creado_en >= (dias.fecha at time zone 'America/Lima')
   and o.creado_en < ((dias.fecha + interval '1 day') at time zone 'America/Lima')
   and o.estado <> 'cancelled'
   and (p_sede_id is null or o.sede_id = p_sede_id)
  group by dias.fecha
  order by dias.fecha
$$;

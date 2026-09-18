-- ============================================================================
-- 0014_rls_customers — pantalla de clientes (CRM básico) del dashboard
--
-- customers no tenía grant para authenticated (0012/0013 la dejaron en cero,
-- correctamente) ni RLS habilitada. Mismo patrón que 0011 para orders/stock:
-- app_api sigue con paso libre (findOrCreateCustomer, usado por
-- POST /api/orders, no se puede romper), authenticated ve solo lo que le
-- corresponde por rol/sede.
--
-- Regla pedida: un operador ve un cliente solo si existe al menos un pedido
-- de ese cliente en SU sede_id — no hay sede_id directo en customers (un
-- cliente puede haber comprado en cualquier sede), así que se resuelve vía
-- EXISTS contra orders. Un admin ve todos, sin filtro.
-- ============================================================================

grant select on customers to authenticated;

alter table customers enable row level security;

create policy app_api_customers on customers
  for all to app_api
  using (true) with check (true);

create policy customers_select_por_sede on customers
  for select to authenticated
  using (
    exists (
      select 1 from usuarios_dashboard u
      where u.id = auth.uid() and (
        u.rol = 'admin'
        or exists (
          select 1 from orders o
          where o.customer_id = customers.id and o.sede_id = u.sede_id
        )
      )
    )
  );

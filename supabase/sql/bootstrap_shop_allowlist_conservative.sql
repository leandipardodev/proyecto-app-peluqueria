do $$
declare
  v_shop_id uuid;
begin
  insert into public.shops (name, slug, active, plan_expiry)
  values ('Klip Barber', 'klip-barber', true, now() + interval '30 days')
  on conflict (slug) do update
  set active = excluded.active,
      plan_expiry = greatest(public.shops.plan_expiry, excluded.plan_expiry)
  returning id into v_shop_id;

  insert into public.admin_allowlist (email, shop_id, role, is_active)
  values
    (lower('tu-email@gmail.com'), v_shop_id, 'owner', true),
    (lower('email-de-lucho@gmail.com'), v_shop_id, 'owner', true)
  on conflict (lower(email)) do update
  set role = excluded.role,
      is_active = excluded.is_active,
      shop_id = excluded.shop_id,
      updated_at = now();

  raise notice 'Bootstrap ok para shop_id=%', v_shop_id;
end $$;

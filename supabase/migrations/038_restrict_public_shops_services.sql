begin;

do $$
declare
  p record;
begin
  -- Remove any anonymous SELECT policy on shops/services to avoid global public listing.
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('shops', 'services')
      and cmd = 'SELECT'
      and (
        roles::text ilike '%anon%'
        or policyname ilike '%public%'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

commit;

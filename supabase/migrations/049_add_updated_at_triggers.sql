-- Add auto-update triggers for updated_at on core tables that lack them
-- Defines the helper function inline (idempotent) in case migration 030 wasn't applied

begin;

create or replace function public.set_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Create trigger only if the table has an updated_at column
do $$
declare
  tbl text;
  tables text[] := array[
    'shops',
    'user_profiles',
    'services',
    'appointments',
    'stock',
    'leads_global',
    'customers',
    'shop_memberships'
  ];
begin
  foreach tbl in array tables
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = tbl
        and column_name = 'updated_at'
    ) then
      execute format(
        'drop trigger if exists trg_%s_updated_at on public.%s',
        tbl, tbl
      );
      execute format(
        'create trigger trg_%s_updated_at
         before update on public.%s
         for each row execute function public.set_timestamp_updated_at()',
        tbl, tbl
      );
    end if;
  end loop;
end $$;

commit;

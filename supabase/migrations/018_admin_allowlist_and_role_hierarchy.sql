begin;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join pg_enum e on e.enumtypid = t.oid
    where n.nspname = 'public'
      and t.typname = 'user_role'
      and e.enumlabel = 'admin'
  ) then
    alter type public.user_role add value 'admin' after 'owner';
  end if;
exception
  when duplicate_object then null;
end $$;

create table if not exists public.admin_allowlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  shop_id uuid not null references public.shops(id) on delete cascade,
  role public.user_role not null default 'admin',
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint admin_allowlist_role_check check (role in ('owner', 'admin', 'staff'))
);

create unique index if not exists idx_admin_allowlist_email_unique
  on public.admin_allowlist (lower(email));

create index if not exists idx_admin_allowlist_shop_id
  on public.admin_allowlist (shop_id);

alter table if exists public.admin_allowlist enable row level security;

drop policy if exists admin_allowlist_no_direct_access on public.admin_allowlist;
create policy admin_allowlist_no_direct_access
on public.admin_allowlist
for all
to authenticated
using (false)
with check (false);

commit;

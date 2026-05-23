begin;

alter table public.user_profiles
  add column if not exists platform_role text not null default 'user';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_platform_role_check'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_platform_role_check
      check (platform_role in ('user', 'super_admin'));
  end if;
end $$;

update public.user_profiles
set platform_role = 'super_admin'
where role = 'superadmin';

create index if not exists idx_user_profiles_platform_role
  on public.user_profiles (platform_role);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_admin_audit_logs_actor
  on public.admin_audit_logs (actor_user_id);

create index if not exists idx_admin_audit_logs_created_at
  on public.admin_audit_logs (created_at desc);

alter table public.admin_audit_logs enable row level security;

drop policy if exists admin_audit_logs_no_direct_access on public.admin_audit_logs;
create policy admin_audit_logs_no_direct_access
on public.admin_audit_logs
for all
to authenticated
using (false)
with check (false);

commit;

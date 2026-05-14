begin;

alter table public.appointments
  add column if not exists deposit_amount numeric(10,2);

alter table public.customers
  add column if not exists recurring_weekday smallint,
  add column if not exists recurring_frequency text,
  add column if not exists recurring_notes text;

create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  gifted_to_name text not null,
  gifted_to_phone text,
  gifted_to_birthday date not null,
  gifted_by_name text,
  service_name text not null,
  voucher_message text,
  status text not null default 'pending',
  reminder_sent_at timestamp with time zone,
  redeemed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_vouchers_shop_id on public.vouchers(shop_id);
create index if not exists idx_vouchers_birthday on public.vouchers(gifted_to_birthday);
create index if not exists idx_vouchers_status on public.vouchers(status);

alter table public.vouchers enable row level security;
alter table public.vouchers force row level security;

drop policy if exists "RLS_MultiLocal_v2_Strict" on public.vouchers;
create policy "RLS_MultiLocal_v2_Strict"
on public.vouchers
for all
to authenticated
using (
  exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = vouchers.shop_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role in ('owner', 'admin', 'staff')
  )
)
with check (
  exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = vouchers.shop_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role in ('owner', 'admin', 'staff')
  )
);

commit;

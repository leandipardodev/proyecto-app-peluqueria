begin;

create table if not exists public.referral_program_settings (
  id uuid primary key default gen_random_uuid(),
  is_default boolean not null default true,
  default_commission_percent numeric(6,3) not null default 20 check (default_commission_percent >= 0 and default_commission_percent <= 100),
  default_commission_months integer not null default 2 check (default_commission_months >= 1 and default_commission_months <= 24),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create unique index if not exists uq_referral_program_settings_default
  on public.referral_program_settings (is_default)
  where is_default = true;

insert into public.referral_program_settings (is_default, default_commission_percent, default_commission_months)
select true, 20, 2
where not exists (
  select 1 from public.referral_program_settings where is_default = true
);

create table if not exists public.referral_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  referral_code text not null,
  commission_percent_override numeric(6,3) check (commission_percent_override is null or (commission_percent_override >= 0 and commission_percent_override <= 100)),
  commission_months_override integer check (commission_months_override is null or (commission_months_override >= 1 and commission_months_override <= 24)),
  is_active boolean not null default true,
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create unique index if not exists uq_referral_partners_code
  on public.referral_partners (lower(referral_code));

create table if not exists public.referral_attributions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  partner_id uuid not null references public.referral_partners(id) on delete restrict,
  attributed_at timestamp with time zone not null default now(),
  referral_code_snapshot text,
  commission_percent_snapshot numeric(6,3) not null check (commission_percent_snapshot >= 0 and commission_percent_snapshot <= 100),
  commission_months_snapshot integer not null check (commission_months_snapshot >= 1 and commission_months_snapshot <= 24),
  created_at timestamp with time zone not null default now(),
  unique (shop_id)
);

create index if not exists idx_referral_attributions_partner
  on public.referral_attributions (partner_id, attributed_at desc);

create table if not exists public.referral_commission_payouts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.referral_partners(id) on delete restrict,
  paid_at timestamp with time zone,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  currency text not null default 'ARS',
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_referral_commission_payouts_partner
  on public.referral_commission_payouts (partner_id, created_at desc);

create table if not exists public.referral_commission_ledger (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.referral_partners(id) on delete restrict,
  shop_id uuid not null references public.shops(id) on delete cascade,
  billing_event_id uuid not null references public.shop_billing_events(id) on delete cascade,
  payment_id text,
  payment_applied_at timestamp with time zone not null,
  payment_sequence integer not null check (payment_sequence >= 1),
  period_ym text not null,
  base_amount numeric(12,2) not null check (base_amount >= 0),
  commission_percent numeric(6,3) not null check (commission_percent >= 0 and commission_percent <= 100),
  commission_amount numeric(12,2) not null check (commission_amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  payout_id uuid references public.referral_commission_payouts(id) on delete set null,
  paid_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (billing_event_id)
);

create index if not exists idx_referral_commission_ledger_partner_status
  on public.referral_commission_ledger (partner_id, status, payment_applied_at desc);

create index if not exists idx_referral_commission_ledger_shop
  on public.referral_commission_ledger (shop_id, payment_applied_at desc);

alter table public.referral_program_settings enable row level security;
alter table public.referral_partners enable row level security;
alter table public.referral_attributions enable row level security;
alter table public.referral_commission_payouts enable row level security;
alter table public.referral_commission_ledger enable row level security;

drop policy if exists referral_program_settings_no_direct_access on public.referral_program_settings;
create policy referral_program_settings_no_direct_access
on public.referral_program_settings
for all
to authenticated
using (false)
with check (false);

drop policy if exists referral_partners_no_direct_access on public.referral_partners;
create policy referral_partners_no_direct_access
on public.referral_partners
for all
to authenticated
using (false)
with check (false);

drop policy if exists referral_attributions_no_direct_access on public.referral_attributions;
create policy referral_attributions_no_direct_access
on public.referral_attributions
for all
to authenticated
using (false)
with check (false);

drop policy if exists referral_commission_payouts_no_direct_access on public.referral_commission_payouts;
create policy referral_commission_payouts_no_direct_access
on public.referral_commission_payouts
for all
to authenticated
using (false)
with check (false);

drop policy if exists referral_commission_ledger_no_direct_access on public.referral_commission_ledger;
create policy referral_commission_ledger_no_direct_access
on public.referral_commission_ledger
for all
to authenticated
using (false)
with check (false);

commit;

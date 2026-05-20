begin;

create table if not exists public.staff_compensation_rules (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  staff_user_id uuid not null references auth.users(id) on delete cascade,
  model text not null check (model in ('percentage', 'fixed_plus_percentage', 'service_specific')),
  percentage_rate numeric(6,3) check (percentage_rate is null or (percentage_rate >= 0 and percentage_rate <= 100)),
  fixed_amount numeric(12,2) check (fixed_amount is null or fixed_amount >= 0),
  starts_on date not null,
  ends_on date,
  is_active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create unique index if not exists idx_staff_comp_rules_unique_open
  on public.staff_compensation_rules (shop_id, staff_user_id)
  where ends_on is null and is_active = true;

create index if not exists idx_staff_comp_rules_shop_staff_dates
  on public.staff_compensation_rules (shop_id, staff_user_id, starts_on, ends_on);

create table if not exists public.staff_commission_overrides (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  compensation_rule_id uuid not null references public.staff_compensation_rules(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  percentage_rate numeric(6,3) not null check (percentage_rate >= 0 and percentage_rate <= 100),
  fixed_amount numeric(12,2) check (fixed_amount is null or fixed_amount >= 0),
  created_at timestamp with time zone not null default now(),
  unique (compensation_rule_id, service_id)
);

create index if not exists idx_staff_commission_overrides_shop
  on public.staff_commission_overrides (shop_id);

create table if not exists public.staff_liquidations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  staff_user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'paid', 'cancelled')),
  gross_revenue numeric(12,2) not null default 0,
  commission_amount numeric(12,2) not null default 0,
  bonuses_amount numeric(12,2) not null default 0,
  deductions_amount numeric(12,2) not null default 0,
  final_payable numeric(12,2) not null default 0,
  paid_amount numeric(12,2) not null default 0,
  paid_at timestamp with time zone,
  paid_by uuid references auth.users(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  check (period_end >= period_start),
  check (gross_revenue >= 0),
  check (commission_amount >= 0),
  check (bonuses_amount >= 0),
  check (deductions_amount >= 0),
  check (paid_amount >= 0)
);

create unique index if not exists idx_staff_liquidations_unique_period
  on public.staff_liquidations (shop_id, staff_user_id, period_start, period_end)
  where status <> 'cancelled';

create index if not exists idx_staff_liquidations_shop_status
  on public.staff_liquidations (shop_id, status, period_start desc);

create table if not exists public.staff_liquidation_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  liquidation_id uuid not null references public.staff_liquidations(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  service_name_snapshot text,
  start_time_snapshot timestamp with time zone,
  gross_amount numeric(12,2) not null default 0,
  commission_rate_snapshot numeric(6,3) check (commission_rate_snapshot is null or (commission_rate_snapshot >= 0 and commission_rate_snapshot <= 100)),
  commission_amount numeric(12,2) not null default 0,
  bonus_amount numeric(12,2) not null default 0,
  deduction_amount numeric(12,2) not null default 0,
  net_amount numeric(12,2) not null default 0,
  created_at timestamp with time zone not null default now(),
  check (gross_amount >= 0),
  check (commission_amount >= 0),
  check (bonus_amount >= 0),
  check (deduction_amount >= 0),
  check (net_amount >= 0)
);

create unique index if not exists idx_staff_liquidation_items_unique_appointment
  on public.staff_liquidation_items (liquidation_id, appointment_id)
  where appointment_id is not null;

create index if not exists idx_staff_liquidation_items_shop
  on public.staff_liquidation_items (shop_id, liquidation_id);

create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  opened_by uuid not null references auth.users(id) on delete restrict,
  opened_at timestamp with time zone not null default now(),
  opening_amount numeric(12,2) not null default 0 check (opening_amount >= 0),
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamp with time zone,
  expected_amount numeric(12,2),
  counted_amount numeric(12,2),
  difference_amount numeric(12,2),
  close_notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  check ((status = 'open' and closed_at is null) or status in ('closed', 'cancelled'))
);

create unique index if not exists idx_cash_sessions_single_open
  on public.cash_sessions (shop_id)
  where status = 'open';

create index if not exists idx_cash_sessions_shop_opened_at
  on public.cash_sessions (shop_id, opened_at desc);

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  cash_session_id uuid references public.cash_sessions(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  movement_type text not null check (movement_type in ('income', 'expense', 'withdrawal', 'adjustment')),
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash', 'transfer', 'debit_card', 'credit_card', 'qr', 'other')),
  category text not null,
  description text,
  happened_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_cash_movements_shop_happened_at
  on public.cash_movements (shop_id, happened_at desc);

create index if not exists idx_cash_movements_session
  on public.cash_movements (cash_session_id);

alter table public.staff_compensation_rules enable row level security;
alter table public.staff_commission_overrides enable row level security;
alter table public.staff_liquidations enable row level security;
alter table public.staff_liquidation_items enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;

drop policy if exists staff_comp_rules_select on public.staff_compensation_rules;
create policy staff_comp_rules_select
on public.staff_compensation_rules
for select
to authenticated
using (
  exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = staff_compensation_rules.shop_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
  )
);

drop policy if exists staff_comp_rules_manage on public.staff_compensation_rules;
create policy staff_comp_rules_manage
on public.staff_compensation_rules
for all
to authenticated
using (
  exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = staff_compensation_rules.shop_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = staff_compensation_rules.shop_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role in ('owner', 'admin')
  )
);

drop policy if exists staff_commission_overrides_select on public.staff_commission_overrides;
create policy staff_commission_overrides_select
on public.staff_commission_overrides
for select
to authenticated
using (
  exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = staff_commission_overrides.shop_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
  )
);

drop policy if exists staff_commission_overrides_manage on public.staff_commission_overrides;
create policy staff_commission_overrides_manage
on public.staff_commission_overrides
for all
to authenticated
using (
  exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = staff_commission_overrides.shop_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = staff_commission_overrides.shop_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role in ('owner', 'admin')
  )
);

drop policy if exists staff_liquidations_select on public.staff_liquidations;
create policy staff_liquidations_select
on public.staff_liquidations
for select
to authenticated
using (
  exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = staff_liquidations.shop_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
  )
  and (
    staff_liquidations.staff_user_id = auth.uid()
    or exists (
      select 1
      from public.shop_memberships sm2
      where sm2.shop_id = staff_liquidations.shop_id
        and sm2.user_id = auth.uid()
        and sm2.is_active = true
        and sm2.role in ('owner', 'admin')
    )
  )
);

drop policy if exists staff_liquidations_manage on public.staff_liquidations;
create policy staff_liquidations_manage
on public.staff_liquidations
for all
to authenticated
using (
  exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = staff_liquidations.shop_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = staff_liquidations.shop_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role in ('owner', 'admin')
  )
);

drop policy if exists staff_liquidation_items_select on public.staff_liquidation_items;
create policy staff_liquidation_items_select
on public.staff_liquidation_items
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_liquidations sl
    where sl.id = staff_liquidation_items.liquidation_id
      and sl.shop_id = staff_liquidation_items.shop_id
      and (
        sl.staff_user_id = auth.uid()
        or exists (
          select 1
          from public.shop_memberships sm
          where sm.shop_id = sl.shop_id
            and sm.user_id = auth.uid()
            and sm.is_active = true
            and sm.role in ('owner', 'admin')
        )
      )
  )
);

drop policy if exists staff_liquidation_items_manage on public.staff_liquidation_items;
create policy staff_liquidation_items_manage
on public.staff_liquidation_items
for all
to authenticated
using (
  exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = staff_liquidation_items.shop_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = staff_liquidation_items.shop_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role in ('owner', 'admin')
  )
);

drop policy if exists cash_sessions_select on public.cash_sessions;
create policy cash_sessions_select
on public.cash_sessions
for select
to authenticated
using (
  exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = cash_sessions.shop_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
  )
);

drop policy if exists cash_sessions_manage on public.cash_sessions;
create policy cash_sessions_manage
on public.cash_sessions
for all
to authenticated
using (
  exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = cash_sessions.shop_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = cash_sessions.shop_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role in ('owner', 'admin')
  )
);

drop policy if exists cash_movements_select on public.cash_movements;
create policy cash_movements_select
on public.cash_movements
for select
to authenticated
using (
  exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = cash_movements.shop_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
  )
);

drop policy if exists cash_movements_manage on public.cash_movements;
create policy cash_movements_manage
on public.cash_movements
for all
to authenticated
using (
  exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = cash_movements.shop_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = cash_movements.shop_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role in ('owner', 'admin')
  )
);

commit;

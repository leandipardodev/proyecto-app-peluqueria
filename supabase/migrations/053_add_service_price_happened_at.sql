-- Add service_price to appointments (snapshot of price at booking time)
alter table if exists public.appointments
  add column if not exists service_price numeric;

-- Backfill existing appointments with current service price
update public.appointments a
  set service_price = s.price
  from public.services s
  where a.service_id = s.id
    and a.service_price is null;

-- Add happened_at to finances (actual date of the expense, not creation date)
alter table if exists public.finances
  add column if not exists happened_at timestamptz;

-- Backfill happened_at with created_at
update public.finances
  set happened_at = created_at
  where happened_at is null;

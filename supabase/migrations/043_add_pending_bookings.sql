-- Pending bookings: reservas temporales que esperan confirmacion de pago
-- El appointment solo se crea en la DB cuando Mercado Pago confirma el pago

create table if not exists pending_bookings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  staff_id uuid references public.staff(id) on delete set null,
  customer_name text not null,
  customer_email text,
  customer_phone text not null,
  authenticated_user_id uuid,
  start_time timestamptz not null,
  end_time timestamptz not null,
  deposit_amount numeric(10,2),
  mp_preference_id text,
  status text not null default 'pending' check (status in ('pending', 'completed', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes'
);

create index if not exists idx_pending_bookings_shop_time
  on pending_bookings (shop_id, start_time, end_time);

create index if not exists idx_pending_bookings_status
  on pending_bookings (status, expires_at);

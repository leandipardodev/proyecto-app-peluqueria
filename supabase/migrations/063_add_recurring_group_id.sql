alter table if exists public.appointments add column if not exists recurring_group_id uuid;

create index if not exists idx_appointments_recurring_group_id on public.appointments (recurring_group_id);

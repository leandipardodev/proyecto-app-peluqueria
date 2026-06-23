-- Prevent double-booking race condition by adding a partial unique index
-- Acts as atomic safety net (same pattern as idx_pending_bookings_unique_slot)
-- Only applies to non-cancelled, non-no_show appointments
create unique index if not exists idx_appointments_unique_slot
  on appointments (shop_id, staff_id, start_time)
  where status not in ('cancelled', 'no_show');

-- Fix CHECK constraint: add status values that the code already uses
-- ('confirmed', 'pending_payment', 'in_progress')
alter table appointments drop constraint if exists appointments_status_check;
alter table appointments add constraint appointments_status_check
  check (status in ('scheduled', 'confirmed', 'pending_payment', 'in_progress', 'completed', 'cancelled', 'no_show'));

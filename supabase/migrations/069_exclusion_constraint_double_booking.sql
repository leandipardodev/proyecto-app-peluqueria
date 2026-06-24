-- Add exclusion constraint to prevent overlapping appointments at DB level.
-- This is the gold standard for preventing double-booking: any two active
-- appointments for the same shop+staff+time range will be rejected.
--
-- Uses btree_gist extension (btree equality + gist range) to build the index.
-- NOT VALID so existing data is not checked on creation (avoids blocking).

create extension if not exists btree_gist;

-- Also fix the pending_bookings unique index to handle NULL staff_id.
-- PostgreSQL treats NULL != NULL in unique indexes, so two "no preference"
-- pending bookings for the same start_time could coexist. Use COALESCE
-- to map NULL to a sentinel UUID.
drop index if exists idx_pending_bookings_unique_slot;
create unique index if not exists idx_pending_bookings_unique_slot
  on public.pending_bookings (shop_id, coalesce(staff_id, '00000000-0000-0000-0000-000000000000'), start_time)
  where status = 'pending';

-- Exclusion constraint on appointments for overlapping time ranges.
-- Uses gist with tstzrange to detect any overlap (&&).
-- COALESCE handles NULL staff_id (appointments without staff assignment).
-- NOT VALID skips checking existing data, only prevents new violations.
-- NOT VALID is not supported for EXCLUDE constraints in PostgreSQL.
-- If existing data violates the constraint, run this query first to find conflicts:
--   select a1.id, a2.id from appointments a1, appointments a2
--   where a1.id < a2.id
--     and a1.shop_id = a2.shop_id
--     and coalesce(a1.staff_id, '00000000-0000-0000-0000-000000000000') = coalesce(a2.staff_id, '00000000-0000-0000-0000-000000000000')
--     and tstzrange(a1.start_time, a1.end_time) && tstzrange(a2.start_time, a2.end_time)
--     and a1.status not in ('cancelled', 'no_show')
--     and a2.status not in ('cancelled', 'no_show');
-- Then fix or cancel the conflicting appointments before running this migration.
alter table appointments
  add constraint no_overlap_appointments
  exclude using gist (
    shop_id with =,
    coalesce(staff_id, '00000000-0000-0000-0000-000000000000') with =,
    tstzrange(start_time, end_time) with &&
  )
  where (status not in ('cancelled', 'no_show'));

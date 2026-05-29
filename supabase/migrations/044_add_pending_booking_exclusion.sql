-- Prevent double-booking by adding a partial unique index
-- Only applies to 'pending' bookings (not expired/cancelled/completed)
-- This acts as the atomic safety net for the race condition in createPendingBooking()

create unique index if not exists idx_pending_bookings_unique_slot
  on pending_bookings (shop_id, staff_id, start_time)
  where status = 'pending';

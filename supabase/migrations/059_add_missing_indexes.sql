-- Add missing composite indexes for common query patterns
-- Based on query audit: queries filtering by multiple columns lack composite indexes

-- Finances: queries filter by shop_id + type (income/expense)
CREATE INDEX IF NOT EXISTS idx_finances_shop_type
  ON finances (shop_id, type);

-- Vouchers: queries filter by shop_id + status (birthday alerts, listings)
CREATE INDEX IF NOT EXISTS idx_vouchers_shop_status
  ON vouchers (shop_id, status);

-- Cash movements: queries filter by shop_id + cash_session_id (session closure)
CREATE INDEX IF NOT EXISTS idx_cash_movements_shop_session
  ON cash_movements (shop_id, cash_session_id);

-- Pending bookings: conflict checks filter by shop_id + status + time range
CREATE INDEX IF NOT EXISTS idx_pending_bookings_shop_status_time
  ON pending_bookings (shop_id, status, start_time, end_time);

-- Appointments: revenue queries filter by shop_id + status + is_paid
CREATE INDEX IF NOT EXISTS idx_appointments_shop_status_paid
  ON appointments (shop_id, status, is_paid);

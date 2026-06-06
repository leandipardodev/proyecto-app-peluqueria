-- Performance indexes for dashboard & calendar queries
-- Based on stress-test analysis: missing composite indexes for common query patterns

-- Appointments: shop_id + start_time is the most common query pair (calendar, dashboard)
CREATE INDEX IF NOT EXISTS idx_appointments_shop_start
  ON appointments (shop_id, start_time);

-- Finances: shop_id + happened_at for flow range queries
CREATE INDEX IF NOT EXISTS idx_finances_shop_happened
  ON finances (shop_id, happened_at);

-- Cash movements: shop_id + happened_at + movement_type for income/expense aggregation
CREATE INDEX IF NOT EXISTS idx_cash_movements_shop_happened_type
  ON cash_movements (shop_id, happened_at, movement_type);

-- Trigger-based auto-update for updated_at timestamps (if not already set)
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

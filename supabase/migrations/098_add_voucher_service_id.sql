ALTER TABLE vouchers ADD COLUMN service_id uuid REFERENCES services(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vouchers_service_id ON vouchers(service_id);
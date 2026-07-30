ALTER TABLE pending_bookings ADD COLUMN IF NOT EXISTS ip_address text;

CREATE INDEX IF NOT EXISTS idx_pending_bookings_ip_address ON pending_bookings (ip_address);

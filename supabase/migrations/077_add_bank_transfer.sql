-- Bank transfer support: columnas payment_method + datos bancarios del local

-- pending_bookings: payment_method y monto a transferir
ALTER TABLE pending_bookings ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'mp';
ALTER TABLE pending_bookings ADD COLUMN IF NOT EXISTS payment_amount numeric;

-- appointments: payment_method
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'mp';

-- shops: datos bancarios del local y flag de habilitación
ALTER TABLE shops ADD COLUMN IF NOT EXISTS bank_transfer_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS bank_cvu_cbu text;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS bank_alias text;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS bank_name text;

-- Index para buscar transferencias pendientes rápido
CREATE INDEX IF NOT EXISTS idx_pending_bookings_bank_transfer
  ON pending_bookings (shop_id, status, start_time)
  WHERE payment_method = 'bank_transfer' AND status = 'pending';

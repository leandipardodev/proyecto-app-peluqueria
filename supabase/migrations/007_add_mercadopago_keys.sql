-- Migration 007: Add Mercado Pago keys to shops
ALTER TABLE shops ADD COLUMN IF NOT EXISTS mp_public_key TEXT DEFAULT '';
ALTER TABLE shops ADD COLUMN IF NOT EXISTS mp_access_token TEXT DEFAULT '';

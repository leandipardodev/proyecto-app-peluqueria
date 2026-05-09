-- Add new info fields to shops table for the public booking page
ALTER TABLE shops ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS instagram_url TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS logo_url TEXT;

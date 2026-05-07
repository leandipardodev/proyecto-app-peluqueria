-- Migration 004: Fix plan_expiry truncation bug
-- The previous code stored plan_expiry as date-only (midnight UTC),
-- causing plans to expire ~24h early (at midnight instead of the actual registration time).
-- This migration:
-- 1. Fixes existing truncated dates by setting them to end-of-day (23:59:59 UTC)
-- 2. Re-activates shops that prematurely expired due to this bug

UPDATE shops
SET plan_expiry = plan_expiry + interval '1 day' - interval '1 second'
WHERE plan_expiry::time = '00:00:00';

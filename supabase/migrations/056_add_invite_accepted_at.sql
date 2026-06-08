-- Add invite_accepted_at to shop_memberships to track when staff accepts invite
alter table if exists public.shop_memberships
  add column if not exists invite_accepted_at timestamptz;

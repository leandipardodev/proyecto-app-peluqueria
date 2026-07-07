-- Add break_start/break_end to shop_date_overrides to support
-- non-working blocks within reduced hours on specific dates.
-- Example: work 9a-20p but block 13-15 on a particular day.

alter table if exists shop_date_overrides
  add column if not exists break_start time,
  add column if not exists break_end time;

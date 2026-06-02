-- Add composite indexes for production query performance
-- Targeted at the most frequent dashboard & calendar query patterns

-- Dashboard summary: fetches all completed appointments for a shop
-- Also used by aggregates grouping by date_key_ar
create index if not exists idx_appointments_shop_status
  on public.appointments (shop_id, status);

-- Dashboard aggregation: group completed appointments by date_key_ar
-- Also supports filtered scans by shop + status + date range
create index if not exists idx_appointments_shop_status_datekey
  on public.appointments (shop_id, status, date_key_ar);

-- Calendar & table views: filter by shop + time range (already covered by
-- idx_appointments_shop_start_status, but this narrower index helps when
-- the query only needs status filtering, not sorting)
create index if not exists idx_appointments_shop_status_start
  on public.appointments (shop_id, status, start_time);

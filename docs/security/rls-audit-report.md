# RLS Audit Report (Priority 2)

Date: 2026-05-26

## Scope

- Multi-tenant isolation by `shop_id`
- Role boundaries (`owner`, `admin`, `staff`, public booking)
- Server actions and webhook paths that bypass client RLS via service role

## Critical Tables

- `shops`
- `shop_memberships`
- `appointments`
- `customers`
- `services`
- `finances`
- `cash_sessions`
- `cash_movements`
- `staff_compensation_rules`
- `staff_liquidations`
- `staff_liquidation_items`
- `shop_booking_theme`

## Access Matrix (Expected)

- `owner`: full read/write in same `shop_id`
- `admin`: operational read/write in same `shop_id`, no destructive billing controls
- `staff`: appointment/customer/service operational subset, no billing ownership settings
- `public booking`: only booking-surface reads and appointment creation constrained to shop
- `service role`: backend-only, never exposed to client

## Findings

### Confirmed Good

- Membership-based shop resolution is consistently used in server actions.
- Dashboard revalidation is scoped by resolved `shop_slug` and `shop_id`.
- Appointment update flows validate access before mutation.

### Risks to Validate in DB Policies

1. Policy drift between legacy tables and newer finance/cash tables.
2. `WITH CHECK` coverage for update/insert paths (same `shop_id` enforcement).
3. Staff over-permission in write paths for finance and liquidation entities.

### Executed Checks (2026-05-26)

- Unauthenticated (`anon`) access probes were executed against sensitive tables.
- Results:
  - `appointments`, `customers`, `finances`, `cash_sessions`, `cash_movements`, `staff_liquidations`: no public rows exposed in probe.
  - `shops`: publicly readable rows detected (sample returned `id`, `nombre`, `slug`).
  - `services`: publicly readable rows detected across shop ids (sample returned `shop_id`, `name`, `price`).

### Risk Assessment from Executed Checks

- If global public listing of all shops/services is not intended, this is a multi-tenant data exposure risk.
- Recommended mitigation:
  1. Restrict `shops`/`services` read policies to explicit public-booking scope (selected shop/slug only).
  2. Avoid broad `select` policies for `anon` role on multi-tenant catalogs.

### Mitigation Applied and Re-Tested

- Migration applied: `038_restrict_public_shops_services.sql`
- Post-migration anonymous probes (`anon`) now return `count=0` for:
  - `shops`
  - `services`
  - (and still `count=0` for `appointments`, `customers`, `finances`)
- Status: global public listing exposure closed.

## Mandatory SQL Checks (run in Supabase SQL editor)

```sql
-- 1) RLS enabled
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname='public'
  and tablename in (
    'shops','shop_memberships','appointments','customers','services','finances',
    'cash_sessions','cash_movements','staff_compensation_rules','staff_liquidations',
    'staff_liquidation_items','shop_booking_theme'
  )
order by tablename;

-- 2) Policies overview
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname='public'
order by tablename, policyname;
```

## Next Actions

1. Export current policy set and compare against expected matrix above.
2. Add missing `WITH CHECK` constraints where updates can cross `shop_id`.
3. Add security regression tests:
   - member from shop A cannot read/write shop B rows
   - staff cannot mutate owner-only entities
4. Store final evidence in this file with pass/fail per table.

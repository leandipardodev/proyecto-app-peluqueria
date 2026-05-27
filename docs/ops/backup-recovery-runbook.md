# Backup and Recovery Runbook (Priority 2)

Date: 2026-05-26

## Objectives

- RPO target: <= 24h
- RTO target: <= 2h for staging recovery, <= 4h for production recovery

## Backup Policy

1. Daily managed DB backups (Supabase managed backups enabled).
2. Pre-release backup before major schema or billing changes.
3. Retention target: 30 days minimum.

## Recovery Scenarios

### A) Full restore to staging (mandatory drill)

1. Create/choose staging project.
2. Restore latest production backup into staging.
3. Apply pending migrations if needed.
4. Run validation checklist.

### B) Production incident restore (high severity)

1. Freeze writes (maintenance mode or write paths disabled).
2. Select recovery point.
3. Restore database.
4. Verify core business flows.
5. Re-enable writes.
6. Publish incident note and recovery timestamp.

## Post-Restore Validation Checklist

- Shop count and key shop metadata present
- Appointments and customers integrity for sample shops
- Finance and cash totals load correctly on dashboard
- Payment webhooks still process correctly
- RLS policies still present and active

## Drill Frequency

- Monthly staging restore drill
- Additional drill after major schema changes

## Evidence

- Record drill date, duration, operator, and issues found
- Keep recovery output in internal ops notes

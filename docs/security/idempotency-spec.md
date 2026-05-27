# Idempotency Spec (Priority 2)

Date: 2026-05-26

## Goal

Prevent duplicate side effects in sensitive flows (payments, webhooks, billing state changes).

## Implemented

### Subscription webhook

- Lock event: `subscription_payment_applied`
- Unique key source: `payload->>'payment_id'`
- Duplicate behavior: safely return `{ ok: true }` without re-applying subscription cycle

### Appointment payment webhook

- Lock event: `appointment_payment_applied`
- Unique key source: `payload->>'payment_id'`
- Duplicate behavior: safely return `{ ok: true }` without re-applying appointment paid state

## Storage Strategy

- Table: `shop_billing_events`
- Unique partial indexes by `event_type` + `payment_id` expression
- Keep non-lock webhook events for traceability/auditing

## Rules

1. Lock first, mutate second.
2. Treat unique violations as successful duplicate handling.
3. Never throw on duplicate events from providers.
4. Keep payload with `payment_id`, `status`, references for audits.

## Pending Extensions

1. Add idempotency keys for manual charge-link creation actions.
2. Add idempotency in any future partner payout write path.
3. Add concurrency test suite (same webhook payload x3 in parallel).

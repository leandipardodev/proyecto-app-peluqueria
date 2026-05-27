begin;

with ranked as (
  select
    id,
    row_number() over (
      partition by (payload->>'payment_id')
      order by created_at asc, id asc
    ) as rn
  from public.shop_billing_events
  where event_type = 'appointment_payment_applied'
    and coalesce(payload->>'payment_id', '') <> ''
)
delete from public.shop_billing_events e
using ranked r
where e.id = r.id
  and r.rn > 1;

create unique index if not exists uq_shop_billing_events_appt_applied_payment_id
on public.shop_billing_events ((payload->>'payment_id'))
where event_type = 'appointment_payment_applied'
  and coalesce(payload->>'payment_id', '') <> '';

create index if not exists idx_shop_billing_events_appt_applied_shop_id
on public.shop_billing_events (shop_id, created_at desc)
where event_type = 'appointment_payment_applied';

commit;

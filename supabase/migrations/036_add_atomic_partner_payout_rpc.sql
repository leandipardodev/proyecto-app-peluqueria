begin;

create or replace function public.admin_mark_partner_commissions_paid(
  p_partner_id uuid,
  p_actor_user_id uuid
)
returns table(updated_count integer, total_amount numeric, payout_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric(12,2) := 0;
  v_count integer := 0;
  v_payout_id uuid := null;
begin
  with locked_rows as (
    select id, commission_amount
    from public.referral_commission_ledger
    where partner_id = p_partner_id
      and status = 'pending'
    for update
  ),
  stats as (
    select coalesce(sum(commission_amount), 0)::numeric(12,2) as total,
           count(*)::integer as cnt
    from locked_rows
  )
  select total, cnt into v_total, v_count from stats;

  if v_count = 0 then
    return query select 0::integer, 0::numeric, null::uuid;
    return;
  end if;

  insert into public.referral_commission_payouts (
    partner_id,
    paid_at,
    amount,
    status,
    created_by,
    created_at,
    updated_at
  )
  values (
    p_partner_id,
    now(),
    v_total,
    'paid',
    p_actor_user_id,
    now(),
    now()
  )
  returning id into v_payout_id;

  update public.referral_commission_ledger
  set status = 'paid',
      paid_at = now(),
      payout_id = v_payout_id,
      updated_at = now()
  where partner_id = p_partner_id
    and status = 'pending';

  return query select v_count, v_total, v_payout_id;
end;
$$;

comment on function public.admin_mark_partner_commissions_paid(uuid, uuid)
is 'Marks pending referral commissions as paid for a partner atomically and creates one payout record.';

commit;

-- Atomic loyalty reward redemption and cut increment functions
-- These prevent race conditions when two requests try to update
-- the same customer's loyalty counters simultaneously.

create or replace function redeem_customer_reward(p_customer_id uuid, p_shop_id uuid)
returns json
language plpgsql
security definer
as $$
declare
  v_updated boolean;
begin
  update customers
  set loyalty_rewards_available = loyalty_rewards_available - 1
  where id = p_customer_id
    and shop_id = p_shop_id
    and loyalty_rewards_available > 0;

  get diagnostics v_updated = row_count;

  return json_build_object('success', v_updated > 0);
end;
$$;

-- Atomic cut increment with reward calculation.
-- Prevents race conditions when two appointments complete simultaneously.
create or replace function increment_loyalty_cut(p_customer_id uuid, p_shop_id uuid, p_required_cuts int)
returns json
language plpgsql
security definer
as $$
declare
  v_current_cuts int;
  v_current_rewards int;
  v_next_cuts_raw int;
  v_rewards_to_add int;
  v_next_cuts int;
begin
  select loyalty_cuts_count, loyalty_rewards_available
  into v_current_cuts, v_current_rewards
  from customers
  where id = p_customer_id and shop_id = p_shop_id
  for update;

  if not found then
    return json_build_object('success', false, 'error', 'Cliente no encontrado');
  end if;

  v_current_cuts := greatest(0, coalesce(v_current_cuts, 0));
  v_current_rewards := greatest(0, coalesce(v_current_rewards, 0));

  v_next_cuts_raw := v_current_cuts + 1;
  v_rewards_to_add := floor(v_next_cuts_raw / greatest(1, p_required_cuts));
  v_next_cuts := v_next_cuts_raw % greatest(1, p_required_cuts);

  update customers
  set loyalty_cuts_count = v_next_cuts,
      loyalty_rewards_available = v_current_rewards + v_rewards_to_add
  where id = p_customer_id and shop_id = p_shop_id;

  return json_build_object('success', true, 'rewards_added', v_rewards_to_add);
end;
$$;

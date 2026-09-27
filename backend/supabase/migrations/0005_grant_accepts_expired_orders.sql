-- The new hourly expire-pending-orders cron (app/api/cron/expire-pending-orders) sets
-- orders.status = 'expired' once a pending order is more than 24h old. apply_membership_grant
-- (0003_apply_membership_grant.sql) previously only accepted 'pending'/'failed' as valid
-- prior states -- exactly the same class of bug fixed for the 'deny' status in the webhook's
-- earlier idempotency work: a payment that settles late (after the cron already expired the
-- order, but Midtrans still delivers a success notification because the money did move)
-- would be silently dropped as 'order_already_processed'. 'expired' must be honored the same
-- way 'failed' already is.
create or replace function public.apply_membership_grant(
  p_order_id uuid,
  p_paid_at timestamptz,
  p_transaction_id text,
  p_user_id uuid,
  p_expected_tier text,
  p_expected_expires_at timestamptz,
  p_new_tier text,
  p_new_expires_at timestamptz
) returns text
language plpgsql
set search_path = ''
as $$
declare
  v_order_status text;
  v_user_tier text;
  v_user_expires_at timestamptz;
begin
  select status into v_order_status from public.orders where id = p_order_id for update;
  if not found then
    return 'order_not_found';
  end if;

  if v_order_status not in ('pending', 'failed', 'expired') then
    return 'order_already_processed';
  end if;

  select tier, expires_at into v_user_tier, v_user_expires_at
  from public.users where id = p_user_id for update;

  if v_user_tier is distinct from p_expected_tier or v_user_expires_at is distinct from p_expected_expires_at then
    return 'user_state_changed';
  end if;

  update public.orders
  set status = 'paid', paid_at = p_paid_at, midtrans_transaction_id = p_transaction_id
  where id = p_order_id;

  update public.users
  set tier = p_new_tier, expires_at = p_new_expires_at
  where id = p_user_id;

  return 'ok';
end;
$$;

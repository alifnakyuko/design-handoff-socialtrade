-- Applies a Midtrans payment's order-paid transition and the resulting membership grant
-- atomically, in one transaction. Row locks (`for update`) on both the order and the user
-- close the window that existed when these were two separate round-trips from the webhook:
-- either both writes happen, or neither does -- there is no in-between state where the
-- order is 'paid' but the user was never granted, and no way for a concurrent order for the
-- same user to silently overwrite this grant.
--
-- The caller (lib/midtrans-webhook.ts) still computes the new tier/expiry with
-- calculateNewExpiry() in TypeScript; this function does not duplicate that business logic.
-- It only re-verifies, under a row lock, that the order and user are still in the state the
-- caller read before computing p_new_tier/p_new_expires_at, and applies both writes only if
-- so -- otherwise it writes nothing, so the caller can safely re-read and retry.
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
as $$
declare
  v_order_status text;
  v_user_tier text;
  v_user_expires_at timestamptz;
begin
  select status into v_order_status from public.orders where id = p_order_id for update;
  if v_order_status is null or v_order_status not in ('pending', 'failed') then
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

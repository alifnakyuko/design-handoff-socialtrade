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
--
-- DEPLOY ORDER: apply this migration (`supabase db push`) before deploying code that calls
-- it. If the code ships first, PostgREST won't have this function in its schema cache yet
-- and every settlement will fail closed (write_failed) until the migration lands.
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
    -- The caller just read this order moments ago (see lib/midtrans-webhook.ts) -- getting
    -- here means it was deleted, or (more likely, if this is ever reached) RLS hid it from
    -- a non-service-role caller. Either way this is a real problem, not a duplicate
    -- notification, so it must not be silently acknowledged as success.
    return 'order_not_found';
  end if;

  if v_order_status not in ('pending', 'failed') then
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

-- This function trusts its p_new_tier/p_new_expires_at parameters completely (the caller
-- computed them from calculateNewExpiry) and writes across both orders and users, so it
-- must only ever be callable by the backend's service-role client -- never by anon or
-- authenticated clients, who could otherwise pass arbitrary values (e.g. p_new_tier =
-- 'lifetime') for any order they can still make this function's row locks resolve against.
-- Postgres grants EXECUTE on new functions to PUBLIC by default, and Supabase's default
-- grants extend that to anon/authenticated -- revoke both explicitly rather than relying on
-- RLS gaps on `orders`/`users` to accidentally make this safe.
revoke execute on function public.apply_membership_grant(
  uuid, timestamptz, text, uuid, text, timestamptz, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.apply_membership_grant(
  uuid, timestamptz, text, uuid, text, timestamptz, text, timestamptz
) to service_role;

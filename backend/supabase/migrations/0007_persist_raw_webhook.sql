-- Persists the raw Midtrans notification payload on the order for debugging/reconciliation,
-- per the original brief's orders.raw_webhook column.
alter table public.orders
  add column raw_webhook jsonb;

-- apply_membership_grant gains p_raw_webhook, stored alongside the paid transition.
-- Per the lesson learned in 0006: CREATE OR REPLACE cannot widen an argument list without
-- creating a second, ambiguous overload -- drop the old (9-argument) signature first so
-- there is only ever one apply_membership_grant. Also defensively drop the original
-- 8-argument signature: it should already be gone (0006 dropped it before creating the
-- 9-argument version), but if any environment ever applied an earlier, broken draft of 0006
-- that skipped that drop, both would still exist -- this is a no-op everywhere else.
drop function if exists public.apply_membership_grant(
  uuid, timestamptz, text, uuid, text, timestamptz, text, timestamptz
);

drop function if exists public.apply_membership_grant(
  uuid, timestamptz, text, uuid, text, timestamptz, text, timestamptz, text
);

create or replace function public.apply_membership_grant(
  p_order_id uuid,
  p_paid_at timestamptz,
  p_transaction_id text,
  p_user_id uuid,
  p_expected_tier text,
  p_expected_expires_at timestamptz,
  p_new_tier text,
  p_new_expires_at timestamptz,
  p_promo_code text default null,
  p_raw_webhook jsonb default null
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
  set status = 'paid', paid_at = p_paid_at, midtrans_transaction_id = p_transaction_id, raw_webhook = p_raw_webhook
  where id = p_order_id;

  update public.users
  set tier = p_new_tier, expires_at = p_new_expires_at
  where id = p_user_id;

  if p_promo_code is not null then
    update public.promo_codes set used_count = used_count + 1 where code = p_promo_code;
  end if;

  return 'ok';
end;
$$;

revoke execute on function public.apply_membership_grant(
  uuid, timestamptz, text, uuid, text, timestamptz, text, timestamptz, text, jsonb
) from public, anon, authenticated;

grant execute on function public.apply_membership_grant(
  uuid, timestamptz, text, uuid, text, timestamptz, text, timestamptz, text, jsonb
) to service_role;

-- Adds usage-quota and per-plan-restriction support to promo codes, per the original brief:
-- max_uses (null = unlimited), used_count (incremented on payment settlement, not on
-- validation, so a code isn't consumed by someone who validates it but never pays), and
-- applies_to_plan_ids (null = applies to every plan; otherwise a list of plan codes).
alter table public.promo_codes
  add column max_uses int,
  add column used_count int not null default 0,
  add column applies_to_plan_ids text[];

-- apply_membership_grant now optionally increments used_count as part of the same atomic
-- transaction as the order-paid/grant writes, when the order used a promo code. This keeps
-- "used_count only increments on actual payment" true even under concurrent settlements,
-- without needing a second round-trip from the webhook.
create or replace function public.apply_membership_grant(
  p_order_id uuid,
  p_paid_at timestamptz,
  p_transaction_id text,
  p_user_id uuid,
  p_expected_tier text,
  p_expected_expires_at timestamptz,
  p_new_tier text,
  p_new_expires_at timestamptz,
  p_promo_code text default null
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

  if p_promo_code is not null then
    update public.promo_codes set used_count = used_count + 1 where code = p_promo_code;
  end if;

  return 'ok';
end;
$$;

revoke execute on function public.apply_membership_grant(
  uuid, timestamptz, text, uuid, text, timestamptz, text, timestamptz, text
) from public, anon, authenticated;

grant execute on function public.apply_membership_grant(
  uuid, timestamptz, text, uuid, text, timestamptz, text, timestamptz, text
) to service_role;

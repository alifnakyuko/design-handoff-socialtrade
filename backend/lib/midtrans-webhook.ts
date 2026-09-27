import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Tier } from './tiers';
import type { Plan } from './pricing';
import { calculateNewExpiry } from './membership';

export type MidtransNotification = {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
  transaction_status: string;
  transaction_id: string;
};

export function verifyMidtransSignature(notification: MidtransNotification, serverKey: string): boolean {
  const hash = crypto
    .createHash('sha512')
    .update(notification.order_id + notification.status_code + notification.gross_amount + serverKey)
    .digest('hex');
  return hash === notification.signature_key;
}

const MAX_GRANT_ATTEMPTS = 2;

type GrantRpcResult = 'ok' | 'order_already_processed' | 'order_not_found' | 'user_state_changed';

export async function handleMidtransNotification(
  supabase: SupabaseClient,
  notification: MidtransNotification,
  serverKey: string
): Promise<{ status: 'ignored' | 'invalid_signature' | 'order_not_found' | 'updated' | 'write_failed' }> {
  if (!verifyMidtransSignature(notification, serverKey)) {
    return { status: 'invalid_signature' };
  }

  const { data: order, error } = await supabase
    .from('orders')
    .select('id, user_id, plan, status, promo_code')
    .eq('midtrans_order_id', notification.order_id)
    .single();

  if (error || !order) {
    return { status: 'order_not_found' };
  }

  const isSuccess = notification.transaction_status === 'settlement' || notification.transaction_status === 'capture';
  const isFailure = ['deny', 'cancel', 'expire'].includes(notification.transaction_status);

  if (!isSuccess && !isFailure) {
    return { status: 'ignored' };
  }

  if (isFailure) {
    // Guarded so a late/out-of-order failure notification can never overwrite an order
    // that a different (earlier or concurrent) notification already marked 'paid'.
    const { error: failedUpdateError } = await supabase
      .from('orders')
      .update({ status: 'failed' })
      .eq('id', order.id)
      .eq('status', 'pending');
    if (failedUpdateError) {
      return { status: 'write_failed' };
    }
    return { status: 'updated' };
  }

  const purchasedPlan = order.plan as Plan;

  // The order-paid transition and the membership grant are applied atomically by the
  // apply_membership_grant() Postgres function (see supabase/migrations/0003_*.sql): it
  // locks both rows and only writes if the order is still pending/failed AND the user's
  // tier/expires_at are still exactly what was read below. This closes the crash window an
  // earlier version of this code had between two separate writes, and replaces an
  // application-level optimistic-concurrency retry with a real row lock. calculateNewExpiry
  // itself stays in TypeScript -- the database function does not duplicate that logic, it
  // only re-verifies the precondition it was computed from before writing.
  for (let attempt = 0; attempt < MAX_GRANT_ATTEMPTS; attempt++) {
    const { data: userRow, error: userReadError } = await supabase
      .from('users')
      .select('tier, expires_at')
      .eq('id', order.user_id)
      .single();

    if (userReadError) {
      return { status: 'write_failed' };
    }

    const currentTier: Tier = (userRow?.tier as Tier) ?? 'free';
    const rawExpiresAt: string | null = userRow?.expires_at ?? null;
    const currentExpiresAt = rawExpiresAt ? new Date(rawExpiresAt) : null;

    let newState;
    try {
      newState = calculateNewExpiry(new Date(), { tier: currentTier, expiresAt: currentExpiresAt }, purchasedPlan);
    } catch (calcError) {
      console.error('calculateNewExpiry failed while granting membership for order', order.id, calcError);
      return { status: 'write_failed' };
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc('apply_membership_grant', {
      p_order_id: order.id,
      p_paid_at: new Date().toISOString(),
      p_transaction_id: notification.transaction_id,
      p_user_id: order.user_id,
      p_expected_tier: currentTier,
      p_expected_expires_at: rawExpiresAt,
      p_new_tier: newState.tier,
      p_new_expires_at: newState.expiresAt ? newState.expiresAt.toISOString() : null,
      p_promo_code: order.promo_code ?? null,
    });

    if (rpcError) {
      return { status: 'write_failed' };
    }

    const result = rpcResult as GrantRpcResult;

    if (result === 'ok') {
      return { status: 'updated' };
    }
    if (result === 'order_already_processed') {
      // Duplicate notification for an order a different delivery already transitioned out
      // of pending/failed. Acknowledge success to Midtrans (so it stops retrying) without
      // re-applying the membership grant.
      return { status: 'updated' };
    }
    if (result === 'order_not_found') {
      // This order was just read successfully above -- seeing this now means it was
      // deleted, or (more likely) the RPC call somehow isn't using the service-role client
      // and RLS hid it. Either way this is a real failure, not a duplicate notification, so
      // it must not be silently acknowledged as success.
      console.error('apply_membership_grant reported order_not_found for order', order.id, '-- this should be unreachable');
      return { status: 'write_failed' };
    }
    // result === 'user_state_changed': a concurrent order for the same user won the row
    // lock first and changed tier/expires_at since we read it. Loop and retry against the
    // fresh state instead of giving up on this grant.
  }

  console.error(
    'apply_membership_grant kept reporting user_state_changed for order',
    order.id,
    '- gave up after',
    MAX_GRANT_ATTEMPTS,
    'attempts'
  );
  return { status: 'write_failed' };
}

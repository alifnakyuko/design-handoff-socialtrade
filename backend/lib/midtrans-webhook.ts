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

// Reads the user's current tier/expiry, computes the new membership state, and writes it
// back with an optimistic-concurrency guard (only if tier/expires_at are still exactly what
// was just read). If a concurrent order for the same user changed them in between -- two
// near-simultaneous purchases -- the write matches zero rows and this retries once against
// the fresh state, instead of silently overwriting the other order's grant.
async function grantMembership(
  supabase: SupabaseClient,
  userId: string,
  purchasedPlan: Plan
): Promise<{ ok: true } | { ok: false }> {
  for (let attempt = 0; attempt < MAX_GRANT_ATTEMPTS; attempt++) {
    const { data: userRow, error: userReadError } = await supabase
      .from('users')
      .select('tier, expires_at')
      .eq('id', userId)
      .single();

    if (userReadError) {
      return { ok: false };
    }

    const currentTier: Tier = (userRow?.tier as Tier) ?? 'free';
    const currentExpiresAt = userRow?.expires_at ? new Date(userRow.expires_at) : null;

    let newState;
    try {
      newState = calculateNewExpiry(new Date(), { tier: currentTier, expiresAt: currentExpiresAt }, purchasedPlan);
    } catch (calcError) {
      console.error('calculateNewExpiry failed while granting membership for user', userId, calcError);
      return { ok: false };
    }

    let query = supabase
      .from('users')
      .update({ tier: newState.tier, expires_at: newState.expiresAt ? newState.expiresAt.toISOString() : null })
      .eq('id', userId)
      .eq('tier', currentTier);
    query = currentExpiresAt ? query.eq('expires_at', currentExpiresAt.toISOString()) : query.is('expires_at', null);

    const { data: updatedUsers, error: userUpdateError } = await query.select('id');

    if (userUpdateError) {
      return { ok: false };
    }
    if (updatedUsers && updatedUsers.length > 0) {
      return { ok: true };
    }
    // Lost the optimistic race against a concurrent order for the same user -- loop and
    // retry against the fresh state instead of giving up on this grant.
  }

  console.error(
    'Optimistic concurrency conflict granting membership for user',
    userId,
    '- gave up after',
    MAX_GRANT_ATTEMPTS,
    'attempts'
  );
  return { ok: false };
}

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
    .select('id, user_id, plan, status')
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

  // Atomically transition to paid. Both 'pending' (the normal case) and 'failed' are
  // accepted prior states: Midtrans can send `deny` for a first payment attempt and then
  // `settlement`/`capture` for a later attempt with a different payment method, under the
  // same order_id -- that must still be able to grant membership. An already-'paid' order
  // (a duplicate notification) matches zero rows here, which is the idempotency signal.
  const { data: updatedOrders, error: paidUpdateError } = await supabase
    .from('orders')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      midtrans_transaction_id: notification.transaction_id,
    })
    .eq('id', order.id)
    .in('status', ['pending', 'failed'])
    .select('id');

  if (paidUpdateError) {
    return { status: 'write_failed' };
  }

  if (!updatedOrders || updatedOrders.length === 0) {
    // Duplicate notification for an order already transitioned out of pending/failed by an
    // earlier delivery. Acknowledge success to Midtrans (so it stops retrying) without
    // re-applying the membership grant.
    return { status: 'updated' };
  }

  const purchasedPlan = order.plan as Plan;
  const grantResult = await grantMembership(supabase, order.user_id, purchasedPlan);

  if (!grantResult.ok) {
    // Best-effort compensation: revert the order back to 'pending' so a Midtrans retry (or
    // manual reconciliation) gets another chance to apply the grant, instead of the order
    // being stuck 'paid' forever with no membership ever applied. If this compensating
    // write itself also fails, the order is left wrongly 'paid' with no grant -- manual
    // reconciliation is needed, hence the loud log.
    const { error: revertError } = await supabase
      .from('orders')
      .update({ status: 'pending' })
      .eq('id', order.id)
      .eq('status', 'paid');
    if (revertError) {
      console.error(
        'Failed to revert order',
        order.id,
        'to pending after a failed membership grant -- manual reconciliation needed',
        revertError
      );
    }
    return { status: 'write_failed' };
  }

  return { status: 'updated' };
}

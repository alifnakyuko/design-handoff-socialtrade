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
    const { error: failedUpdateError } = await supabase.from('orders').update({ status: 'failed' }).eq('id', order.id);
    if (failedUpdateError) {
      return { status: 'write_failed' };
    }
    return { status: 'updated' };
  }

  // Atomically transition pending -> paid. The `.eq('status', 'pending')` guard makes this
  // conditional: if the order was already paid by an earlier notification (Midtrans sends
  // duplicates — capture then settlement for card payments, plus retries), this update
  // matches zero rows and `updatedOrders` comes back empty. That is the idempotency signal:
  // we must not re-run calculateNewExpiry and grant membership time twice for one purchase.
  const { data: updatedOrders, error: paidUpdateError } = await supabase
    .from('orders')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      midtrans_transaction_id: notification.transaction_id,
    })
    .eq('id', order.id)
    .eq('status', 'pending')
    .select('id');

  if (paidUpdateError) {
    return { status: 'write_failed' };
  }

  if (!updatedOrders || updatedOrders.length === 0) {
    // Duplicate notification for an order already transitioned out of 'pending' by an
    // earlier delivery. Acknowledge success to Midtrans (so it stops retrying) without
    // re-applying the membership grant.
    return { status: 'updated' };
  }

  const { data: userRow, error: userReadError } = await supabase
    .from('users')
    .select('tier, expires_at')
    .eq('id', order.user_id)
    .single();

  if (userReadError) {
    return { status: 'write_failed' };
  }

  const currentTier: Tier = (userRow?.tier as Tier) ?? 'free';
  const currentExpiresAt = userRow?.expires_at ? new Date(userRow.expires_at) : null;
  const purchasedPlan = order.plan as Plan;

  const newState = calculateNewExpiry(new Date(), { tier: currentTier, expiresAt: currentExpiresAt }, purchasedPlan);

  const { error: userUpdateError } = await supabase
    .from('users')
    .update({ tier: newState.tier, expires_at: newState.expiresAt ? newState.expiresAt.toISOString() : null })
    .eq('id', order.user_id);
  if (userUpdateError) {
    return { status: 'write_failed' };
  }

  return { status: 'updated' };
}

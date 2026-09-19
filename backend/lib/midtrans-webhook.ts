import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { tierRank, type Tier } from './tiers';
import type { Plan } from './pricing';

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
): Promise<{ status: 'ignored' | 'invalid_signature' | 'order_not_found' | 'updated' }> {
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
    await supabase.from('orders').update({ status: 'failed' }).eq('id', order.id);
    return { status: 'updated' };
  }

  await supabase
    .from('orders')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      midtrans_transaction_id: notification.transaction_id,
    })
    .eq('id', order.id);

  const { data: userRow } = await supabase.from('users').select('tier').eq('id', order.user_id).single();
  const currentTier: Tier = (userRow?.tier as Tier) ?? 'free';
  const purchasedTier = order.plan as Plan as Tier;

  if (tierRank(purchasedTier) > tierRank(currentTier)) {
    await supabase.from('users').update({ tier: purchasedTier }).eq('id', order.user_id);
  }

  return { status: 'updated' };
}

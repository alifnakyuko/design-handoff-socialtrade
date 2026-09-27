import type { SupabaseClient } from '@supabase/supabase-js';
import { basePriceFor, type Plan } from './pricing';
import type { SnapClient } from './midtrans-snap';
import { validatePromo } from './promo';

export type CreateCheckoutInput = {
  userId: string;
  userEmail: string;
  plan: Plan;
  promoCode?: string;
};

export type CreateCheckoutResult =
  | { status: 'ok'; orderId: string; token: string; redirectUrl: string }
  | { status: 'invalid_promo' };

export async function createCheckout(
  supabase: SupabaseClient,
  snap: SnapClient,
  input: CreateCheckoutInput
): Promise<CreateCheckoutResult> {
  const baseAmount = basePriceFor(input.plan);
  let finalAmount = baseAmount;
  let appliedPromo: string | null = null;

  if (input.promoCode) {
    const promoResult = await validatePromo(supabase, input.promoCode, input.plan);
    if (!promoResult.valid) {
      return { status: 'invalid_promo' };
    }

    finalAmount = promoResult.finalPrice;
    appliedPromo = promoResult.code;
  }

  const midtransOrderId = `ST-${input.userId.slice(0, 8)}-${Date.now()}`;

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      user_id: input.userId,
      plan: input.plan,
      base_amount: baseAmount,
      promo_code: appliedPromo,
      final_amount: finalAmount,
      status: 'pending',
      midtrans_order_id: midtransOrderId,
    })
    .select('id')
    .single();

  if (orderError || !order) {
    throw new Error('Failed to create order');
  }

  const transaction = await snap.createTransaction({
    orderId: midtransOrderId,
    grossAmount: finalAmount,
    customerEmail: input.userEmail,
  });

  return {
    status: 'ok',
    orderId: order.id,
    token: transaction.token,
    redirectUrl: transaction.redirectUrl,
  };
}

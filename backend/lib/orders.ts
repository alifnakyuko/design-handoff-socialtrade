import type { SupabaseClient } from '@supabase/supabase-js';

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'expired';

export type OrderSummary = {
  id: string;
  plan: string;
  baseAmount: number;
  promoCode: string | null;
  finalAmount: number;
  status: OrderStatus;
  createdAt: string;
  paidAt: string | null;
};

export async function getOrderStatus(
  supabase: SupabaseClient,
  orderId: string,
  userId: string
): Promise<{ status: OrderStatus; plan: string } | null> {
  const { data, error } = await supabase
    .from('orders')
    .select('status, plan, user_id')
    .eq('id', orderId)
    .single();

  if (error || !data || data.user_id !== userId) return null;
  return { status: data.status, plan: data.plan };
}

export async function listOrders(supabase: SupabaseClient, userId: string): Promise<OrderSummary[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, plan, base_amount, promo_code, final_amount, status, created_at, paid_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return (data as any[]).map((row) => ({
    id: row.id,
    plan: row.plan,
    baseAmount: row.base_amount,
    promoCode: row.promo_code,
    finalAmount: row.final_amount,
    status: row.status,
    createdAt: row.created_at,
    paidAt: row.paid_at,
  }));
}

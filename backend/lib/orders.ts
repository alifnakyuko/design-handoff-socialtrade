import type { SupabaseClient } from '@supabase/supabase-js';

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'expired';

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

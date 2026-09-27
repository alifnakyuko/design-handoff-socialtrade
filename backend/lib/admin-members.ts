import type { SupabaseClient } from '@supabase/supabase-js';

export type MemberRow = {
  id: string;
  email: string;
  name: string;
  tier: string;
  expiresAt: string | null;
  createdAt: string;
  totalRevenue: number;
};

export async function listMembers(supabase: SupabaseClient): Promise<MemberRow[]> {
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email, name, tier, expires_at, created_at')
    .order('created_at', { ascending: false });

  if (usersError || !users) return [];

  const { data: paidOrders } = await supabase.from('orders').select('user_id, final_amount').eq('status', 'paid');

  const revenueByUser = new Map<string, number>();
  for (const order of (paidOrders as { user_id: string; final_amount: number }[]) ?? []) {
    revenueByUser.set(order.user_id, (revenueByUser.get(order.user_id) ?? 0) + order.final_amount);
  }

  return (users as any[]).map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    tier: u.tier,
    expiresAt: u.expires_at,
    createdAt: u.created_at,
    totalRevenue: revenueByUser.get(u.id) ?? 0,
  }));
}

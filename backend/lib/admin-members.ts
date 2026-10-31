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

  const { data: paidOrders, error: ordersError } = await supabase
    .from('orders')
    .select('user_id, final_amount')
    .eq('status', 'paid');

  if (ordersError) {
    // Fail loud rather than silently reporting 0 revenue for every member, which would look
    // like a plausible (if wrong) answer instead of an obvious error.
    throw new Error('Failed to load orders for revenue calculation');
  }

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

export async function updateMemberTier(
  supabase: SupabaseClient,
  input: { userId: string; adminId: string; tier: string; expiresAt: string | null }
): Promise<{ status: 'ok' } | { status: 'not_found' }> {
  const { error } = await supabase.rpc('admin_update_member', {
    p_user_id: input.userId,
    p_admin_id: input.adminId,
    p_new_tier: input.tier,
    p_new_expires_at: input.expiresAt,
  });
  if (error?.message?.includes('user_not_found')) return { status: 'not_found' };
  if (error) throw new Error('Failed to update member');
  return { status: 'ok' };
}

export type MemberEditRow = {
  id: string;
  old_tier: string | null;
  new_tier: string;
  old_expires_at: string | null;
  new_expires_at: string | null;
  admin_id: string;
  created_at: string;
};

export async function getMemberAuditHistory(supabase: SupabaseClient, userId: string): Promise<MemberEditRow[]> {
  const { data, error } = await supabase
    .from('member_edits')
    .select('id, old_tier, new_tier, old_expires_at, new_expires_at, admin_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as MemberEditRow[];
}

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Tier } from './tiers';

export type CurrentUser = {
  id: string;
  tier: Tier;
  isAdmin: boolean;
};

export async function getCurrentUser(supabase: SupabaseClient): Promise<CurrentUser | null> {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return null;

  const { data: row, error } = await supabase
    .from('users')
    .select('tier, is_admin')
    .eq('id', authData.user.id)
    .single();

  if (error || !row) return null;

  return { id: authData.user.id, tier: row.tier as Tier, isAdmin: row.is_admin as boolean };
}

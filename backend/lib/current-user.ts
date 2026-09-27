import type { SupabaseClient } from '@supabase/supabase-js';
import type { Tier } from './tiers';

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  tier: Tier;
  expiresAt: string | null;
  isAdmin: boolean;
};

export async function getCurrentUser(supabase: SupabaseClient): Promise<CurrentUser | null> {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return null;

  const { data: row, error } = await supabase
    .from('users')
    .select('email, name, tier, is_admin, expires_at')
    .eq('id', authData.user.id)
    .single();

  if (error || !row) return null;

  // Backstop: the daily expiry cron is what actually resets `tier` in the database, so
  // there is up to ~24h (longer if a cron run fails) between a membership lapsing and the
  // stored row reflecting it. Treat an already-past `expires_at` as free right here too,
  // so access control doesn't depend entirely on the cron having already run.
  const isExpired = row.expires_at != null && new Date(row.expires_at).getTime() <= Date.now();
  const effectiveTier: Tier = isExpired ? 'free' : (row.tier as Tier);
  const effectiveExpiresAt: string | null = isExpired ? null : (row.expires_at as string | null);

  return {
    id: authData.user.id,
    email: row.email as string,
    name: row.name as string,
    tier: effectiveTier,
    expiresAt: effectiveExpiresAt,
    isAdmin: row.is_admin as boolean,
  };
}

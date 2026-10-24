import type { SupabaseClient } from '@supabase/supabase-js';

const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 10;

// Keeps /api/promo/validate from being a free oracle for brute-forcing promo codes: no login
// is required to call it (intentional, per the original brief), so this is the only thing
// standing between an attacker and unlimited guesses against a hit response that leaks
// discountPct/finalPrice.
export async function checkPromoValidateRateLimit(supabase: SupabaseClient, ip: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();

  // Bounded, inline cleanup -- avoids needing a separate cron job just to keep this table from
  // growing forever, at the cost of one extra delete per request.
  await supabase.from('promo_validate_attempts').delete().lt('created_at', windowStart);

  const { count } = await supabase
    .from('promo_validate_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('created_at', windowStart);

  if ((count ?? 0) >= MAX_ATTEMPTS_PER_WINDOW) {
    return false;
  }

  await supabase.from('promo_validate_attempts').insert({ ip });
  return true;
}

import type { SupabaseClient } from '@supabase/supabase-js';

export type PlanListing = {
  code: string;
  name: string;
  tierLevel: number;
  price: number;
  strikePrice: number | null;
  durationDays: number | null;
};

export async function listActivePlans(supabase: SupabaseClient): Promise<PlanListing[]> {
  const { data, error } = await supabase
    .from('plans')
    .select('code, name, tier_level, price, strike_price, duration_days')
    .eq('is_active', true)
    .order('sort', { ascending: true });

  if (error || !data) return [];

  return (data as any[]).map((row) => ({
    code: row.code,
    name: row.name,
    tierLevel: row.tier_level,
    price: row.price,
    strikePrice: row.strike_price,
    durationDays: row.duration_days,
  }));
}

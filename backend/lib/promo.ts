import type { SupabaseClient } from '@supabase/supabase-js';
import { basePriceFor, applyDiscount, type Plan } from './pricing';

export type PromoValidationResult =
  | { valid: true; code: string; discountPct: number; finalPrice: number }
  | { valid: false };

export async function validatePromo(
  supabase: SupabaseClient,
  promoCode: string,
  plan: Plan
): Promise<PromoValidationResult> {
  const { data: promo, error } = await supabase
    .from('promo_codes')
    .select('code, percent, active, expires_at, max_uses, used_count, applies_to_plan_ids')
    .eq('code', promoCode)
    .single();

  const todayDateOnly = new Date().toISOString().slice(0, 10);
  if (error || !promo || !promo.active || promo.expires_at < todayDateOnly) {
    return { valid: false };
  }

  if (promo.max_uses != null && promo.used_count >= promo.max_uses) {
    return { valid: false };
  }

  if (promo.applies_to_plan_ids != null && !promo.applies_to_plan_ids.includes(plan)) {
    return { valid: false };
  }

  const baseAmount = basePriceFor(plan);
  const finalPrice = applyDiscount(baseAmount, promo.percent);

  return { valid: true, code: promo.code, discountPct: promo.percent, finalPrice };
}
